-- 익명이 익명이려면 author_id를 클라이언트가 못 읽어야 한다. 테이블 전체 select를 회수하고
-- 컬럼 단위로 다시 준다 -- author_id / deleted_by(모더레이터 신원) / pinned_by는 빠진다.
-- db diff는 revoke만 잡고 아래 컬럼 grant는 못 잡으므로 손으로 붙였다. 이게 없으면 authenticated가
-- posts/comments를 아예 못 읽는다.
revoke select on table "public"."comments" from "authenticated";

revoke select on table "public"."posts" from "authenticated";

grant select (id,pub_id,space_id,title,content,is_anonymous,category_id,pinned_at,created_at,updated_at) on public.posts to authenticated;
grant select (id,post_id,parent_id,content,is_anonymous,created_at,updated_at,deleted_at) on public.comments to authenticated;


  create table "public"."post_attachment_mime_types" (
    "content_type" text not null,
    "max_bytes" bigint not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."post_attachment_mime_types" enable row level security;

CREATE UNIQUE INDEX post_attachment_mime_types_pkey ON public.post_attachment_mime_types USING btree (content_type);

alter table "public"."post_attachment_mime_types" add constraint "post_attachment_mime_types_pkey" PRIMARY KEY using index "post_attachment_mime_types_pkey";

alter table "public"."post_attachment_mime_types" add constraint "post_attachment_mime_types_content_type_fkey" FOREIGN KEY (content_type) REFERENCES public.mime_types(content_type) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."post_attachment_mime_types" validate constraint "post_attachment_mime_types_content_type_fkey";

-- 시드. message_attachment_mime_types와 같은 상한을 쓴다. 이 표가 비어 있으면 어떤 첨부도 만들 수
-- 없으므로(FK가 여기로 걸린다) 아래 post_attachments FK 검증보다 먼저 채운다.
insert into public.post_attachment_mime_types (content_type, max_bytes)
select
  mime.content_type,
  case mime.kind
    when 'image' then 10000000
    when 'video' then 100000000
    else 25000000
  end
from public.mime_types mime
on conflict (content_type) do nothing;

alter table "public"."post_attachments" add constraint "post_attachments_content_type_fkey" FOREIGN KEY (content_type) REFERENCES public.post_attachment_mime_types(content_type) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."post_attachments" validate constraint "post_attachments_content_type_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.enforce_post_attachment_shape()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists (
    select 1
    from (select distinct post_id from new_rows) touched
    where (select count(*) from public.post_attachments a where a.post_id = touched.post_id)
          > private.max_post_attachments()
  ) then
    raise exception 'a post carries at most % attachments', private.max_post_attachments();
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.max_post_attachments()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select 10 $function$
;

CREATE OR REPLACE FUNCTION private.post_author(p_author_id bigint, p_is_anonymous boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when p_is_anonymous then null else
    (select jsonb_build_object('id',pr.id,'name',pr.name,'avatar_url',pr.avatar_url)
     from public.profiles pr where pr.id=p_author_id)
  end
$function$
;

CREATE OR REPLACE FUNCTION public.get_post(p_pub_id uuid)
 RETURNS TABLE(post_id bigint, pub_id uuid, space_id bigint, title text, content text, is_anonymous boolean, author jsonb, is_mine boolean, category jsonb, pinned_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, comment_count bigint, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint, attachments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  target_id bigint;
begin
  select p.id into target_id from public.posts p where p.pub_id=p_pub_id and p.deleted_at is null;
  if not found then return; end if;
  if not private.can_access_post(target_id) then raise exception 'post access required'; end if;

  return query
  select
    p.id, p.pub_id, p.space_id, p.title, p.content, p.is_anonymous,
    private.post_author(p.author_id, p.is_anonymous),
    p.author_id=caller_id,
    case when cat.id is null then null else
      jsonb_build_object('id',cat.id,'name',cat.name,'sort_order',cat.sort_order) end,
    p.pinned_at, p.created_at, p.updated_at,
    (select count(*) from public.comments c where c.post_id=p.id and c.deleted_at is null),
    (select count(*) from public.post_reactions r where r.post_id=p.id),
    coalesce((select jsonb_agg(t.icon order by t.n desc, t.icon)
      from (
        select rt.icon, count(*) as n
        from public.post_reactions r join public.reaction_types rt on rt.id=r.reaction_type_id
        where r.post_id=p.id and rt.icon is not null
        group by rt.icon order by count(*) desc limit 3
      ) t),'[]'::jsonb),
    (select r.reaction_type_id from public.post_reactions r where r.post_id=p.id and r.user_id=caller_id),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,
      'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,
      'width',a.width,'height',a.height
    ) order by a.sort_order, a.id)
    from public.post_attachments a join public.mime_types mime on mime.content_type=a.content_type
    where a.post_id=p.id),'[]'::jsonb)
  from public.posts p
  left join public.space_categories cat on cat.id=p.category_id
  where p.id=target_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_post_comments(p_post_id bigint)
 RETURNS TABLE(comment_id bigint, parent_id bigint, content text, is_anonymous boolean, author jsonb, is_mine boolean, is_deleted boolean, created_at timestamp with time zone, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not private.can_access_post(p_post_id) then raise exception 'post access required'; end if;

  return query
  select
    c.id,
    c.parent_id,
    c.content,
    c.is_anonymous,
    -- tombstone은 본문도 작성자도 내리지 않는다. 남는 건 "여기 삭제된 댓글이 있었다"는 사실뿐이다.
    case when c.deleted_at is not null then null
         else private.post_author(c.author_id, c.is_anonymous) end,
    c.author_id=caller_id and c.deleted_at is null,
    c.deleted_at is not null,
    c.created_at,
    (select count(*) from public.comment_reactions r where r.comment_id=c.id),
    coalesce((select jsonb_agg(t.icon order by t.n desc, t.icon)
      from (
        select rt.icon, count(*) as n
        from public.comment_reactions r join public.reaction_types rt on rt.id=r.reaction_type_id
        where r.comment_id=c.id and rt.icon is not null
        group by rt.icon order by count(*) desc limit 3
      ) t),'[]'::jsonb),
    (select r.reaction_type_id from public.comment_reactions r where r.comment_id=c.id and r.user_id=caller_id)
  from public.comments c
  where c.post_id=p_post_id
    and (c.deleted_at is null or private.has_active_descendant(c.id))
  order by c.created_at, c.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_space_posts(p_space_id bigint, p_category_id bigint DEFAULT NULL::bigint, p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content text, is_anonymous boolean, author jsonb, is_mine boolean, category jsonb, pinned_at timestamp with time zone, created_at timestamp with time zone, comment_count bigint, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint, attachments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  before_created_at timestamptz;
begin
  if not private.can_participate_space(p_space_id) then raise exception 'space membership required'; end if;
  if p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  -- 커서는 id 하나지만 정렬은 (created_at, id)다. 그 글의 created_at을 찾아 행 비교로 쓰면
  -- idx_posts_active_space_created_at을 그대로 탄다.
  if p_before_id is not null then
    select p.created_at into before_created_at from public.posts p where p.id=p_before_id;
  end if;

  return query
  with page as (
    -- 고정 글은 첫 페이지에만 얹고, 시간순 스트림에서는 빼서 두 번 나오지 않게 한다(FB와 동일).
    select p.*, 0 as sort_group
    from public.posts p
    where p_before_id is null
      and p.space_id=p_space_id and p.deleted_at is null and p.pinned_at is not null
      and (p_category_id is null or p.category_id=p_category_id)
    union all
    (
      select p.*, 1 as sort_group
      from public.posts p
      where p.space_id=p_space_id and p.deleted_at is null and p.pinned_at is null
        and (p_category_id is null or p.category_id=p_category_id)
        and (p_before_id is null or (p.created_at, p.id) < (before_created_at, p_before_id))
      order by p.created_at desc, p.id desc
      limit p_limit
    )
  )
  select
    page.id,
    page.pub_id,
    page.title,
    page.content,
    page.is_anonymous,
    private.post_author(page.author_id, page.is_anonymous),
    page.author_id=caller_id,
    case when cat.id is null then null else
      jsonb_build_object('id',cat.id,'name',cat.name,'sort_order',cat.sort_order) end,
    page.pinned_at,
    page.created_at,
    coalesce(counts.comment_count,0),
    coalesce(counts.reaction_count,0),
    coalesce(summary.top_reactions,'[]'::jsonb),
    summary.my_reaction_id,
    coalesce(files.items,'[]'::jsonb)
  from page
  left join public.space_categories cat on cat.id=page.category_id
  left join lateral (
    select
      (select count(*) from public.comments c where c.post_id=page.id and c.deleted_at is null) as comment_count,
      (select count(*) from public.post_reactions r where r.post_id=page.id) as reaction_count
  ) counts on true
  left join lateral (
    select
      (select jsonb_agg(t.icon order by t.n desc, t.icon)
       from (
         select rt.icon, count(*) as n
         from public.post_reactions r
         join public.reaction_types rt on rt.id=r.reaction_type_id
         where r.post_id=page.id and rt.icon is not null
         group by rt.icon
         order by count(*) desc
         limit 3
       ) t) as top_reactions,
      (select r.reaction_type_id from public.post_reactions r where r.post_id=page.id and r.user_id=caller_id) as my_reaction_id
  ) summary on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,
      'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,
      'width',a.width,'height',a.height
    ) order by a.sort_order, a.id) as items
    from public.post_attachments a
    join public.mime_types mime on mime.content_type=a.content_type
    where a.post_id=page.id
  ) files on true
  order by page.sort_group, page.pinned_at desc nulls last, page.created_at desc, page.id desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_posts(p_query text, p_space_id bigint)
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content_snippet text, author jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare normalized_query text := regexp_replace(lower(btrim(p_query)), '\s+', '', 'g');
begin
  if p_space_id is null then raise exception 'space target required'; end if;
  if not private.can_participate_space(p_space_id) then raise exception 'space membership required'; end if;
  if p_query is null or char_length(btrim(p_query)) not between 1 and 200 or normalized_query='' then
    raise exception 'query must contain 1 to 200 characters';
  end if;

  return query
  select p.id, p.pub_id, p.title, left(p.content,300),
         private.post_author(p.author_id, p.is_anonymous),
         p.created_at
  from public.posts p
  where p.space_id=p_space_id
    and p.deleted_at is null
    and (regexp_replace(lower(p.title),'\s+','','g') ilike '%'||normalized_query||'%'
      or regexp_replace(lower(p.content),'\s+','','g') ilike '%'||normalized_query||'%')
  order by p.created_at desc, p.id desc
  limit 50;
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
  target_pub_id uuid;
  expected_prefix text;
  attachment_count int4;
begin
  select p.pub_id into target_pub_id
  from public.posts p
  where p.id=p_post_id and p.deleted_at is null and p.author_id=caller_id
  for update;
  -- 본문 수정과 같은 권한이다(posts_update). 관리자라도 남의 글의 첨부를 바꾸지는 못한다.
  if not found then raise exception 'post author required'; end if;

  expected_prefix := target_pub_id::text || '/' || (select auth.uid())::text || '/';

  if p_attachments is null or jsonb_typeof(p_attachments)<>'array' then
    raise exception 'attachments must be a json array';
  end if;
  attachment_count := jsonb_array_length(p_attachments);
  if attachment_count > private.max_post_attachments() then
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
        -- 이미 이 글에 붙어 있던 첨부는 스토리지 재확인을 건너뛴다. 수정할 때 그 blob은 24시간보다
        -- 오래됐을 수 있어서, 새로 올라온 것만 객체 존재·타입·크기를 대조한다.
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

grant select on table "public"."post_attachment_mime_types" to "authenticated";

grant delete on table "public"."post_attachment_mime_types" to "service_role";

grant insert on table "public"."post_attachment_mime_types" to "service_role";

grant select on table "public"."post_attachment_mime_types" to "service_role";

grant update on table "public"."post_attachment_mime_types" to "service_role";


  create policy "post_attachment_mime_types_select"
  on "public"."post_attachment_mime_types"
  as permissive
  for select
  to authenticated
using (private.is_accepted_user());


CREATE TRIGGER trg_enforce_post_attachment_shape AFTER INSERT ON public.post_attachments REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION private.enforce_post_attachment_shape();



-- db diff가 함수 grant/revoke를 안 잡아서 손으로 붙인다. 없으면 새 함수의 EXECUTE가 Postgres
-- 기본값대로 PUBLIC에 열려 anon이 글 목록·검색·첨부 교체를 호출할 수 있다.
revoke execute on function private.max_post_attachments(), private.post_author(bigint,boolean), private.enforce_post_attachment_shape() from public, anon, authenticated, service_role;
revoke execute on function public.list_space_posts(bigint,bigint,bigint,int4), public.get_post(uuid), public.get_post_comments(bigint), public.search_posts(text,bigint), public.set_post_attachments(bigint,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.list_space_posts(bigint,bigint,bigint,int4), public.get_post(uuid), public.get_post_comments(bigint), public.search_posts(text,bigint), public.set_post_attachments(bigint,jsonb) to authenticated;
