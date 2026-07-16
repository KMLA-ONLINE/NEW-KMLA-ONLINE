alter table "public"."spaces" add column "cover_image_url" text;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.clear_space_cover(p_space_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_current_profile(true);
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;
  update public.spaces set cover_image_url=null where id=p_space_id and deleted_at is null;
end $function$
;

CREATE OR REPLACE FUNCTION public.clear_space_image(p_space_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_current_profile(true);
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;
  update public.spaces set image_url=null where id=p_space_id and deleted_at is null;
end $function$
;

CREATE OR REPLACE FUNCTION public.finalize_space_cover(p_space_id bigint, p_storage_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare expected_prefix text;
begin
  perform private.require_current_profile(true);
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;
  select s.pub_id||'/' into expected_prefix from public.spaces s where s.id=p_space_id and s.deleted_at is null;
  if expected_prefix is null then raise exception 'space not found'; end if;
  if not private.has_uuid_object_suffix(p_storage_path,expected_prefix)
    or not exists(select 1 from storage.objects where bucket_id='space-covers' and name=p_storage_path and created_at>=now()-interval '24 hours' and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp'))
    then raise exception 'invalid space cover object'; end if;
  update public.spaces set cover_image_url=p_storage_path where id=p_space_id;
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

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('space-covers','space-covers',false,10000000,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

grant select (cover_image_url) on public.spaces to authenticated;

revoke execute on function public.clear_space_image(bigint), public.finalize_space_cover(bigint,text), public.clear_space_cover(bigint) from public,anon,authenticated,service_role;
grant execute on function public.clear_space_image(bigint), public.finalize_space_cover(bigint,text), public.clear_space_cover(bigint) to authenticated;


