alter table "public"."spaces" add column "cover_image_url" text;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.enqueue_storage_cleanup(p_bucket text, p_path text, p_requested_by bigint DEFAULT NULL::bigint)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  insert into private.attachment_cleanup_queue(storage_bucket, storage_path, requested_by)
  values (p_bucket, p_path, p_requested_by)
  on conflict (storage_bucket, storage_path) do update
  set available_at = least(private.attachment_cleanup_queue.available_at, excluded.available_at),
      processed_at = null,
      last_error = null;
$function$
;

CREATE OR REPLACE FUNCTION private.require_space_upload(p_space_pub_id text, p_bucket text, p_storage_path text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.has_uuid_object_suffix(p_storage_path, p_space_pub_id || '/')
    or not exists(
      select 1 from storage.objects o
      where o.bucket_id = p_bucket
        and o.name = p_storage_path
        and o.owner_id = (select auth.uid())::text
        and o.created_at >= now() - interval '24 hours'
        and coalesce(o.metadata->>'mimetype', '') in ('image/jpeg', 'image/png', 'image/webp')
    )
  then raise exception 'invalid space image object'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.clear_avatar()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(false);
  previous_path text;
begin
  select avatar_url into previous_path from public.profiles where id = caller_id for update;
  if previous_path is null then return; end if;
  perform private.enqueue_storage_cleanup('avatars', previous_path, caller_id);
  update public.profiles set avatar_url = null where id = caller_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.clear_cover_image()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(false);
  previous_path text;
begin
  select cover_image_url into previous_path from public.profiles where id = caller_id for update;
  if previous_path is null then return; end if;
  perform private.enqueue_storage_cleanup('profile-covers', previous_path, caller_id);
  update public.profiles set cover_image_url = null where id = caller_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.clear_space_cover(p_space_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  previous_path text;
begin
  select s.cover_image_url into previous_path
  from public.spaces s
  where s.id = p_space_id and s.deleted_at is null and private.can_manage_space(s.id)
  for update;
  if not found then raise exception 'space manager required'; end if;
  if previous_path is null then return; end if;

  perform private.enqueue_storage_cleanup('space-covers', previous_path, caller_id);
  update public.spaces set cover_image_url = null where id = p_space_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.clear_space_image(p_space_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  previous_path text;
begin
  -- finalize와 같은 이유로 권한 조건을 SELECT에 합친다 -- "없는 space"와 "권한 없는 space"가
  -- 똑같이 0행이 되어 존재 오라클이 없다.
  select s.image_url into previous_path
  from public.spaces s
  where s.id = p_space_id and s.deleted_at is null and private.can_manage_space(s.id)
  for update;
  if not found then raise exception 'space manager required'; end if;
  if previous_path is null then return; end if;

  perform private.enqueue_storage_cleanup('space-images', previous_path, caller_id);
  update public.spaces set image_url = null where id = p_space_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.finalize_space_cover(p_space_id bigint, p_storage_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  space_pub_id text;
  previous_path text;
begin
  select s.pub_id, s.cover_image_url into space_pub_id, previous_path
  from public.spaces s
  where s.id = p_space_id and s.deleted_at is null and private.can_manage_space(s.id)
  for update;
  if not found then raise exception 'space manager required'; end if;

  perform private.require_space_upload(space_pub_id, 'space-covers', p_storage_path);

  if previous_path is not null and previous_path <> p_storage_path then
    perform private.enqueue_storage_cleanup('space-covers', previous_path, caller_id);
  end if;

  update public.spaces set cover_image_url = p_storage_path where id = p_space_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.finalize_space_image(p_space_id bigint, p_storage_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  space_pub_id text;
  previous_path text;
begin
  -- security definer라 spaces_update 정책이 적용되지 않는다 -- 관리자 검사를 여기서 다시 하지
  -- 않으면 이 RPC가 그 정책을 우회하는 뒷문이 된다. 권한 조건을 SELECT에 합쳐 "없는 space"와
  -- "권한 없는 space"를 똑같이 0행으로 만든다(soft_delete_post와 같은 이유).
  select s.pub_id, s.image_url into space_pub_id, previous_path
  from public.spaces s
  where s.id = p_space_id and s.deleted_at is null and private.can_manage_space(s.id)
  for update;
  if not found then raise exception 'space manager required'; end if;

  perform private.require_space_upload(space_pub_id, 'space-images', p_storage_path);

  -- 갈아끼우는 순간 이전 blob은 고아다. 스윕이 어차피 걷어가지만 지금 큐에 넣으면 48시간을 안 기다린다.
  if previous_path is not null and previous_path <> p_storage_path then
    perform private.enqueue_storage_cleanup('space-images', previous_path, caller_id);
  end if;

  update public.spaces set image_url = p_storage_path where id = p_space_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.complete_storage_cleanup(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare bucket text; path text;
begin
  perform private.require_service_role();
  select storage_bucket,storage_path into bucket,path from private.attachment_cleanup_queue where id=p_id and processed_at is null for update;
  if path is null then return; end if;
  if bucket='post-files' then delete from public.post_attachments where storage_path=path;
  elsif bucket in ('message-files','message-files-encrypted') then delete from public.message_attachments where storage_bucket=bucket and storage_path=path;
  elsif bucket='avatars' then update public.profiles set avatar_url=null where avatar_url=path;
  elsif bucket='profile-covers' then update public.profiles set cover_image_url=null where cover_image_url=path;
  elsif bucket='space-images' then update public.spaces set image_url=null where image_url=path and deleted_at is not null;
  elsif bucket='space-covers' then update public.spaces set cover_image_url=null where cover_image_url=path and deleted_at is not null;
  else raise exception 'invalid cleanup bucket'; end if;
  update private.attachment_cleanup_queue set processed_at=now(),last_error=null where id=p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.enqueue_due_storage_cleanup()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result bigint;
begin
  perform private.require_service_role();
  delete from private.attachment_cleanup_queue where processed_at<now()-interval '30 days';

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path)
  select a.storage_bucket,a.storage_path from public.post_attachments a join public.posts p on p.id=a.post_id
  where p.deleted_at<now()-interval '7 days'
  union
  select a.storage_bucket,a.storage_path from public.message_attachments a join public.messages m on m.id=a.message_id
  where m.deleted_at<now()-interval '7 days'
  union
  select a.storage_bucket,a.storage_path from public.post_attachments a join public.posts p on p.id=a.post_id join public.spaces s on s.id=p.space_id
  where s.deleted_at<now()-interval '7 days'
  union
  select 'space-images',s.image_url from public.spaces s
  where s.deleted_at<now()-interval '7 days' and s.image_url is not null
  union
  select 'space-covers',s.cover_image_url from public.spaces s
  where s.deleted_at<now()-interval '7 days' and s.cover_image_url is not null
  union
  select o.bucket_id,o.name from storage.objects o
  where o.created_at<now()-interval '48 hours'
    and o.bucket_id in ('avatars','profile-covers','space-images','space-covers','post-files','message-files','message-files-encrypted')
    and not exists(select 1 from public.profiles p where o.bucket_id='avatars' and p.avatar_url=o.name)
    and not exists(select 1 from public.profiles p where o.bucket_id='profile-covers' and p.cover_image_url=o.name)
    and not exists(select 1 from public.spaces s where o.bucket_id='space-images' and s.image_url=o.name)
    and not exists(select 1 from public.spaces s where o.bucket_id='space-covers' and s.cover_image_url=o.name)
    and not exists(select 1 from public.post_attachments a where o.bucket_id='post-files' and a.storage_path=o.name)
    and not exists(select 1 from public.message_attachments a where o.bucket_id in ('message-files','message-files-encrypted') and a.storage_bucket=o.bucket_id and a.storage_path=o.name)
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),processed_at=null;

  get diagnostics result=row_count;
  return result;
end $function$
;


  create policy "space_covers_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'space-covers'::text) AND (EXISTS ( SELECT 1
   FROM public.spaces s
  WHERE ((s.pub_id = split_part(objects.name, '/'::text, 1)) AND (s.deleted_at IS NULL) AND private.can_manage_space(s.id) AND private.has_uuid_object_suffix(objects.name, (s.pub_id || '/'::text)))))));



  create policy "space_covers_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'space-covers'::text) AND (EXISTS ( SELECT 1
   FROM public.spaces s
  WHERE ((s.cover_image_url = objects.name) AND (s.deleted_at IS NULL))))));




-- 버킷은 스키마가 아니라 데이터라 db diff가 못 뽑는다. 커버는 아이콘과 슬롯이 달라 버킷도 다르다
-- (profiles가 avatars와 profile-covers를 가르는 것과 같은 이유). 제한은 profile-covers와 같게 둔다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('space-covers', 'space-covers', false, 10000000, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- 컬럼 grant도 db diff가 안 뽑는다. 읽기는 열고 쓰기는 닫는다 -- cover_image_url을 update로 열면
-- 클라이언트가 올린 적도 없는 경로를 그대로 박아 넣을 수 있다(그래서 finalize/clear RPC가 있다).
grant select (cover_image_url) on public.spaces to authenticated;

-- 새 함수는 Postgres 기본값으로 PUBLIC에 EXECUTE가 열린다. 회수하지 않으면 anon도 부를 수 있다.
-- 기존 함수(enqueue_due_storage_cleanup·complete_storage_cleanup)는 create or replace라 grant가 유지된다.
revoke execute on function private.enqueue_storage_cleanup(text,text,bigint), private.require_space_upload(text,text,text) from public, anon, authenticated, service_role;
revoke execute on function public.finalize_space_image(bigint,text), public.clear_space_image(bigint), public.finalize_space_cover(bigint,text), public.clear_space_cover(bigint), public.clear_avatar(), public.clear_cover_image() from public, anon, authenticated, service_role;
grant execute on function public.finalize_space_image(bigint,text), public.clear_space_image(bigint), public.finalize_space_cover(bigint,text), public.clear_space_cover(bigint), public.clear_avatar(), public.clear_cover_image() to authenticated;
