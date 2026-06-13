create table private.attachment_cleanup_queue (
  id bigserial primary key,
  storage_bucket text not null,
  storage_path text not null,
  requested_by bigint null references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  attempts int4 not null default 0 check (attempts >= 0),
  last_error text null,
  processed_at timestamptz null,
  unique (storage_bucket,storage_path)
);
create index idx_attachment_cleanup_queue_pending on private.attachment_cleanup_queue(processed_at,available_at);

create table private.upload_authorization_events (
  id bigserial primary key,
  profile_id bigint not null references public.profiles(id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  size_bytes int8 not null check(size_bytes>0),
  created_at timestamptz not null default now(),
  unique(storage_bucket,storage_path)
);
create index idx_upload_authorization_events_profile_created_at on private.upload_authorization_events(profile_id,created_at);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('avatars','avatars',false,5000000,array['image/jpeg','image/png','image/webp']),
  ('space-images','space-images',false,10000000,array['image/jpeg','image/png','image/webp']),
  ('post-files','post-files',false,25000000,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','text/csv','application/rtf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/x-hwp','application/x-hwpx','application/haansofthwp','application/haansofthwpx','application/vnd.hancom.hwp','application/vnd.hancom.hwpx','application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation']),
  ('message-files','message-files',false,25000000,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','text/csv','application/rtf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/x-hwp','application/x-hwpx','application/haansofthwp','application/haansofthwpx','application/vnd.hancom.hwp','application/vnd.hancom.hwpx','application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy avatars_select on storage.objects for select to authenticated using (
  bucket_id='avatars' and exists(select 1 from public.profiles p where p.avatar_url=name)
);
create policy space_images_select on storage.objects for select to authenticated using (
  bucket_id='space-images' and exists(select 1 from public.spaces s where s.image_url=name and s.deleted_at is null)
);
create policy post_files_select on storage.objects for select to authenticated using (
  bucket_id='post-files' and exists(select 1 from public.post_attachments a where a.storage_path=name and private.can_access_post(a.post_id))
);
create policy message_files_select on storage.objects for select to authenticated using (
  bucket_id='message-files' and exists(select 1 from public.message_attachments a where a.storage_path=name and private.can_access_message(a.message_id))
);

create function public.finalize_post_attachment(p_post_id bigint,p_storage_path text,p_file_name text,p_content_type text,p_size_bytes int8,p_sort_order int4,p_alt text,p_width int4,p_height int4)
returns bigint language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(true); attachment_id bigint; expected_prefix text;
begin
  select p.pub_id::text||'/'||(select auth.uid())::text||'/' into expected_prefix from public.posts p where p.id=p_post_id and p.author_id=caller_id and p.deleted_at is null and private.can_access_post(p.id);
  if expected_prefix is null or p_storage_path not like expected_prefix||'%' or p_storage_path !~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_content_type not in ('image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','text/csv','application/rtf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/x-hwp','application/x-hwpx','application/haansofthwp','application/haansofthwpx','application/vnd.hancom.hwp','application/vnd.hancom.hwpx','application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation') or p_size_bytes>25000000
    or not exists(select 1 from storage.objects where bucket_id='post-files' and name=p_storage_path and created_at>=now()-interval '24 hours' and metadata->>'mimetype'=p_content_type and (metadata->>'size')::int8=p_size_bytes)
    or not exists(select 1 from private.upload_authorization_events where profile_id=caller_id and storage_bucket='post-files' and storage_path=p_storage_path and size_bytes=p_size_bytes)
  then raise exception 'invalid post attachment'; end if;
  insert into public.post_attachments(post_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,alt,width,height)
  values(p_post_id,'post-files',p_storage_path,p_file_name,p_content_type,p_size_bytes,p_sort_order,p_alt,p_width,p_height) returning id into attachment_id;
  return attachment_id;
end $$;

create function public.finalize_message_attachment(p_message_id bigint,p_storage_path text,p_file_name text,p_content_type text,p_size_bytes int8,p_sort_order int4,p_width int4,p_height int4)
returns bigint language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(true); attachment_id bigint; expected_prefix text;
begin
  select m.room_id::text||'/'||m.id::text||'/'||(select auth.uid())::text||'/' into expected_prefix from public.messages m where m.id=p_message_id and m.sender_id=caller_id and m.deleted_at is null and private.is_room_member(m.room_id);
  if expected_prefix is null or p_storage_path not like expected_prefix||'%' or p_storage_path !~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_content_type not in ('image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','text/csv','application/rtf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/x-hwp','application/x-hwpx','application/haansofthwp','application/haansofthwpx','application/vnd.hancom.hwp','application/vnd.hancom.hwpx','application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation') or p_size_bytes>25000000
    or not exists(select 1 from storage.objects where bucket_id='message-files' and name=p_storage_path and created_at>=now()-interval '24 hours' and metadata->>'mimetype'=p_content_type and (metadata->>'size')::int8=p_size_bytes)
    or not exists(select 1 from private.upload_authorization_events where profile_id=caller_id and storage_bucket='message-files' and storage_path=p_storage_path and size_bytes=p_size_bytes)
  then raise exception 'invalid message attachment'; end if;
  insert into public.message_attachments(message_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height)
  values(p_message_id,'message-files',p_storage_path,p_file_name,p_content_type,p_size_bytes,p_sort_order,p_width,p_height) returning id into attachment_id;
  return attachment_id;
end $$;

create function public.finalize_avatar(p_storage_path text)
returns void language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(false); expected_prefix text:=(select auth.uid())::text||'/';
begin
  if p_storage_path not like expected_prefix||'%' or p_storage_path !~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_storage_path and created_at>=now()-interval '24 hours' and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp'))
    or not exists(select 1 from private.upload_authorization_events e join storage.objects o on o.bucket_id=e.storage_bucket and o.name=e.storage_path where e.profile_id=caller_id and e.storage_bucket='avatars' and e.storage_path=p_storage_path and e.size_bytes=(o.metadata->>'size')::int8)
    then raise exception 'invalid avatar object'; end if;
  update public.profiles set avatar_url=p_storage_path where id=caller_id;
end $$;

create function public.finalize_space_image(p_space_id bigint,p_storage_path text)
returns void language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(true); expected_prefix text;
begin
  select pub_id::text||'/' into expected_prefix from public.spaces where id=p_space_id and deleted_at is null;
  if not exists(select 1 from public.space_members where space_id=p_space_id and user_id=caller_id and role in ('owner','admin') and banned_at is null)
    or p_storage_path not like expected_prefix||'%' or p_storage_path !~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or not exists(select 1 from storage.objects where bucket_id='space-images' and name=p_storage_path and created_at>=now()-interval '24 hours' and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp'))
    or not exists(select 1 from private.upload_authorization_events e join storage.objects o on o.bucket_id=e.storage_bucket and o.name=e.storage_path where e.profile_id=caller_id and e.storage_bucket='space-images' and e.storage_path=p_storage_path and e.size_bytes=(o.metadata->>'size')::int8)
    then raise exception 'invalid space image object'; end if;
  update public.spaces set image_url=p_storage_path where id=p_space_id;
end $$;

create function public.request_attachment_removal(p_attachment_kind text,p_attachment_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(true); bucket text; path text;
begin
  if p_attachment_kind='post' then
    select a.storage_bucket,a.storage_path into bucket,path from public.post_attachments a join public.posts p on p.id=a.post_id where a.id=p_attachment_id and p.author_id=caller_id and p.deleted_at is null;
  elsif p_attachment_kind='message' then
    select a.storage_bucket,a.storage_path into bucket,path from public.message_attachments a join public.messages m on m.id=a.message_id where a.id=p_attachment_id and m.sender_id=caller_id and m.deleted_at is null and private.is_room_member(m.room_id);
  else raise exception 'invalid attachment kind'; end if;
  if path is null then raise exception 'attachment not found or not owned'; end if;
  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by) values(bucket,path,caller_id)
  on conflict(storage_bucket,storage_path) do update set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),processed_at=null;
end $$;

create function public.enqueue_due_storage_cleanup()
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
  perform private.require_service_role();
  delete from private.upload_authorization_events where created_at<now()-interval '2 days';
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
  select o.bucket_id,o.name from storage.objects o
  where o.created_at<now()-interval '48 hours'
    and o.bucket_id in ('avatars','space-images','post-files','message-files')
    and not exists(select 1 from public.profiles p where o.bucket_id='avatars' and p.avatar_url=o.name)
    and not exists(select 1 from public.spaces s where o.bucket_id='space-images' and s.image_url=o.name)
    and not exists(select 1 from public.post_attachments a where o.bucket_id='post-files' and a.storage_path=o.name)
    and not exists(select 1 from public.message_attachments a where o.bucket_id='message-files' and a.storage_path=o.name)
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),processed_at=null;

  get diagnostics result=row_count;
  return result;
end $$;

create function public.record_upload_authorization(p_profile_id bigint,p_storage_bucket text,p_storage_path text,p_size_bytes int8)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_service_role();
  if p_size_bytes<=0 or p_storage_bucket not in ('avatars','space-images','post-files','message-files') or nullif(btrim(p_storage_path),'') is null
    then raise exception 'valid upload authorization required'; end if;
  perform pg_advisory_xact_lock(p_profile_id);
  if (select count(*) from private.upload_authorization_events where profile_id=p_profile_id and created_at>=now()-interval '1 minute')>=20
    then raise exception 'upload rate limit exceeded'; end if;
  if coalesce((select sum(size_bytes) from private.upload_authorization_events where profile_id=p_profile_id and created_at>=now()-interval '1 day'),0)+p_size_bytes>500000000
    then raise exception 'daily upload quota exceeded'; end if;
  insert into private.upload_authorization_events(profile_id,storage_bucket,storage_path,size_bytes)
  values(p_profile_id,p_storage_bucket,p_storage_path,p_size_bytes);
  delete from private.upload_authorization_events where created_at<now()-interval '2 days';
end $$;

create function public.claim_storage_cleanup(p_limit int4 default 100)
returns table(id bigint,storage_bucket text,storage_path text)
language plpgsql security definer set search_path='' as $$
begin
  perform private.require_service_role();
  if p_limit not between 1 and 500 then raise exception 'limit must be between 1 and 500'; end if;
  return query
  with claimed as (
    select q.id from private.attachment_cleanup_queue q
    where q.processed_at is null and q.available_at<=now()
    order by q.available_at,q.id
    for update skip locked
    limit p_limit
  )
  update private.attachment_cleanup_queue q
  set attempts=q.attempts+1,available_at=now()+interval '10 minutes',last_error=null
  from claimed
  where q.id=claimed.id
  returning q.id,q.storage_bucket,q.storage_path;
end $$;

create function public.complete_storage_cleanup(p_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare bucket text; path text;
begin
  perform private.require_service_role();
  select storage_bucket,storage_path into bucket,path from private.attachment_cleanup_queue where id=p_id and processed_at is null for update;
  if path is null then return; end if;
  if bucket='post-files' then delete from public.post_attachments where storage_path=path;
  elsif bucket='message-files' then delete from public.message_attachments where storage_path=path;
  elsif bucket='avatars' then update public.profiles set avatar_url=null where avatar_url=path;
  elsif bucket='space-images' then update public.spaces set image_url=null where image_url=path and deleted_at is not null;
  else raise exception 'invalid cleanup bucket'; end if;
  update private.attachment_cleanup_queue set processed_at=now(),last_error=null where id=p_id;
end $$;

create function public.fail_storage_cleanup(p_id bigint,p_error text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_service_role();
  update private.attachment_cleanup_queue
  set last_error=left(coalesce(p_error,'unknown error'),2000),
      available_at=now()+least(interval '24 hours',interval '5 minutes'*power(2,greatest(attempts-1,0)))
  where id=p_id and processed_at is null;
end $$;

create function public.cleanup_deleted_content()
returns bigint language plpgsql security definer set search_path='' as $$
declare post_id bigint; result bigint:=0;
begin
  perform private.require_service_role();
  for post_id in
    select p.id from public.posts p
    where p.deleted_at<now()-interval '7 days' and not exists(select 1 from public.post_attachments a where a.post_id=p.id)
  loop
    perform public.purge_deleted_content('post',post_id);
    result:=result+1;
  end loop;
  return result;
end $$;

create function public.reconcile_cached_counts()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_service_role();
  update public.spaces s set member_count=(select count(*) from public.space_members sm where sm.space_id=s.id) where true;
  update public.posts p set
    comment_count=(select count(*) from public.comments c where c.post_id=p.id and c.deleted_at is null),
    reaction_count=(select count(*) from public.post_reactions r where r.post_id=p.id)
  where true;
end $$;

revoke all on table private.attachment_cleanup_queue from public,anon,authenticated;
revoke all on sequence private.attachment_cleanup_queue_id_seq from public,anon,authenticated;
revoke all on table private.upload_authorization_events from public,anon,authenticated;
revoke all on sequence private.upload_authorization_events_id_seq from public,anon,authenticated;
grant select,insert,update,delete on private.attachment_cleanup_queue to service_role;
grant usage,select on sequence private.attachment_cleanup_queue_id_seq to service_role;
grant select,insert,delete on private.upload_authorization_events to service_role;
grant usage,select on sequence private.upload_authorization_events_id_seq to service_role;
grant execute on function public.finalize_post_attachment(bigint,text,text,text,int8,int4,text,int4,int4),public.finalize_message_attachment(bigint,text,text,text,int8,int4,int4,int4),public.finalize_avatar(text),public.finalize_space_image(bigint,text),public.request_attachment_removal(text,bigint) to authenticated;
revoke execute on function public.finalize_post_attachment(bigint,text,text,text,int8,int4,text,int4,int4),public.finalize_message_attachment(bigint,text,text,text,int8,int4,int4,int4),public.finalize_avatar(text),public.finalize_space_image(bigint,text),public.request_attachment_removal(text,bigint) from public,anon,service_role;
grant execute on function public.record_upload_authorization(bigint,text,text,int8),public.enqueue_due_storage_cleanup(),public.claim_storage_cleanup(int4),public.complete_storage_cleanup(bigint),public.fail_storage_cleanup(bigint,text),public.cleanup_deleted_content(),public.reconcile_cached_counts() to service_role;
revoke execute on function public.record_upload_authorization(bigint,text,text,int8),public.enqueue_due_storage_cleanup(),public.claim_storage_cleanup(int4),public.complete_storage_cleanup(bigint),public.fail_storage_cleanup(bigint,text),public.cleanup_deleted_content(),public.reconcile_cached_counts() from public,anon,authenticated;
