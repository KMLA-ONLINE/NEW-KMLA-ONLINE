set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.validate_post_attachments(p_post_id bigint, p_space_pub_id text, p_attachments jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare expected_prefix text := p_space_pub_id || '/' || (select auth.uid())::text || '/';
begin
  if p_attachments is null or jsonb_typeof(p_attachments)<>'array' then
    raise exception 'attachments must be a json array';
  end if;
  if jsonb_array_length(p_attachments) > private.max_post_attachments() then
    raise exception 'a post carries at most % attachments', private.max_post_attachments();
  end if;

  -- 글이 받지 않는 MIME은 post_attachment_mime_types에 조인되지 않으므로 allowed.content_type is
  -- null이 곧 "허용되지 않은 타입"이다.
  if exists(
    select 1
    from jsonb_array_elements(p_attachments) as item(value)
    left join public.post_attachment_mime_types allowed on allowed.content_type=item.value->>'content_type'
    where allowed.content_type is null
      or item.value->>'storage_path' is null
      or not private.has_uuid_object_suffix(item.value->>'storage_path', expected_prefix)
      or char_length(btrim(coalesce(item.value->>'file_name','')))=0
      or (item.value->>'size_bytes')::int8 is null
      or (item.value->>'size_bytes')::int8<0
      or (item.value->>'size_bytes')::int8>allowed.max_bytes
      or (
        not exists(
          select 1 from public.post_attachments a
          where a.post_id=p_post_id and a.storage_path=item.value->>'storage_path'
        )
        and not exists(
          select 1 from storage.objects o
          where o.bucket_id='post-files'
            and o.name=item.value->>'storage_path'
            and o.created_at>=now()-interval '24 hours'
            and o.metadata->>'mimetype'=item.value->>'content_type'
            and (o.metadata->>'size')::int8=(item.value->>'size_bytes')::int8
        )
      )
  ) then raise exception 'invalid post attachment'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_post_with_attachments(p_space_id bigint, p_title text, p_content text, p_attachments jsonb DEFAULT '[]'::jsonb, p_category_id bigint DEFAULT NULL::bigint, p_is_anonymous boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  space_pub_id text;
  new_post_id bigint;
  new_pub_id uuid;
begin
  select s.pub_id into space_pub_id
  from public.spaces s where s.id=p_space_id and s.deleted_at is null;
  if not found then raise exception 'space not found'; end if;
  if not private.can_participate_space(p_space_id) then raise exception 'space membership required'; end if;

  -- 길이 제약과 카테고리 동일 space 검사는 테이블 check와 trg_validate_post_category가 한다.
  insert into public.posts(space_id,author_id,title,content,is_anonymous,category_id)
  values(p_space_id,caller_id,p_title,p_content,coalesce(p_is_anonymous,false),p_category_id)
  returning id, pub_id into new_post_id, new_pub_id;

  perform private.validate_post_attachments(new_post_id, space_pub_id, p_attachments);

  insert into public.post_attachments(post_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height)
  select
    new_post_id,'post-files',
    item.value->>'storage_path',
    btrim(item.value->>'file_name'),
    item.value->>'content_type',
    (item.value->>'size_bytes')::int8,
    (item.position-1)::int4,
    (item.value->>'width')::int4,
    (item.value->>'height')::int4
  from jsonb_array_elements(p_attachments) with ordinality as item(value,position);

  return new_pub_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_post_attachments(p_post_id bigint, p_attachments jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  space_pub_id text;
begin
  -- 본문 수정과 같은 권한이다(posts_update). 관리자라도 남의 글의 첨부를 바꾸지는 못한다.
  select s.pub_id into space_pub_id
  from public.posts p
  join public.spaces s on s.id=p.space_id
  where p.id=p_post_id and p.deleted_at is null and p.author_id=caller_id
  for update of p;
  if not found then raise exception 'post author required'; end if;

  perform private.validate_post_attachments(p_post_id, space_pub_id, p_attachments);

  -- 새 목록에서 빠진 기존 첨부의 blob만 삭제 큐로 보낸다(유지되는 blob은 건드리지 않는다).
  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by)
  select a.storage_bucket, a.storage_path, caller_id
  from public.post_attachments a
  where a.post_id=p_post_id
    and not exists(
      select 1 from jsonb_array_elements(p_attachments) as item(value)
      where item.value->>'storage_path'=a.storage_path
    )
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  delete from public.post_attachments where post_id=p_post_id;

  insert into public.post_attachments(post_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height)
  select
    p_post_id,'post-files',
    item.value->>'storage_path',
    btrim(item.value->>'file_name'),
    item.value->>'content_type',
    (item.value->>'size_bytes')::int8,
    (item.position-1)::int4,
    (item.value->>'width')::int4,
    (item.value->>'height')::int4
  from jsonb_array_elements(p_attachments) with ordinality as item(value,position);
end;
$function$
;

drop policy "post_files_insert" on "storage"."objects";


  create policy "post_files_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'post-files'::text) AND (split_part(name, '/'::text, 2) = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM public.spaces s
  WHERE ((s.pub_id = split_part(objects.name, '/'::text, 1)) AND (s.deleted_at IS NULL) AND private.can_participate_space(s.id) AND private.has_uuid_object_suffix(objects.name, (((s.pub_id || '/'::text) || (( SELECT auth.uid() AS uid))::text) || '/'::text)))))));




-- db diff가 grant/revoke를 안 잡아서 손으로 붙인다. 없으면 create_post_with_attachments의 EXECUTE가
-- default privilege에 막혀 아무도 못 부르거나, 반대로 PUBLIC에 열려 anon이 글을 쓸 수 있다.
revoke execute on function private.validate_post_attachments(bigint,text,jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.create_post_with_attachments(bigint,text,text,jsonb,bigint,boolean) from public, anon, authenticated, service_role;
grant execute on function public.create_post_with_attachments(bigint,text,text,jsonb,bigint,boolean) to authenticated;
