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

create policy avatars_select on storage.objects for select to authenticated using (
  bucket_id='avatars' and exists(select 1 from public.profiles p where p.avatar_url=storage.objects.name and p.deleted_at is null)
);
create policy space_images_select on storage.objects for select to authenticated using (
  bucket_id='space-images' and exists(select 1 from public.spaces s where s.image_url=storage.objects.name and s.deleted_at is null)
);
create policy post_files_select on storage.objects for select to authenticated using (
  bucket_id='post-files' and exists(select 1 from public.post_attachments a where a.storage_path=storage.objects.name and private.can_access_post(a.post_id))
);
create policy message_files_select on storage.objects for select to authenticated using (
  bucket_id='message-files' and (
    exists(select 1 from public.message_attachments a where a.storage_path=storage.objects.name and private.can_access_message(a.message_id))
    or (
      split_part(storage.objects.name,'/',2)=(select auth.uid())::text and exists(
        select 1 from public.chat_room_members crm
        where crm.room_id::text=split_part(storage.objects.name,'/',1)
          and private.is_room_member(crm.room_id)
          and storage.objects.name ~ ('^'||crm.room_id::text||'/'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      )
    )
  )
);
create policy avatars_insert on storage.objects for insert to authenticated with check (
  bucket_id='avatars' and exists(select 1 from public.profiles p where p.auth_user_id=(select auth.uid()) and p.deleted_at is null)
  and storage.objects.name ~ ('^'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
create policy space_images_insert on storage.objects for insert to authenticated with check (
  bucket_id='space-images' and exists(
    select 1 from public.spaces s
    where s.pub_id::text=split_part(storage.objects.name,'/',1)
      and s.deleted_at is null
      and private.can_manage_space(s.id)
      and storage.objects.name ~ ('^'||s.pub_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  )
);
create policy post_files_insert on storage.objects for insert to authenticated with check (
  bucket_id='post-files' and split_part(storage.objects.name,'/',2)=(select auth.uid())::text and exists(
    select 1 from public.posts p
    where p.pub_id::text=split_part(storage.objects.name,'/',1)
      and p.author_id=private.current_profile_id()
      and p.deleted_at is null
      and private.can_access_post(p.id)
      and storage.objects.name ~ ('^'||p.pub_id::text||'/'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  )
);
create policy message_files_insert on storage.objects for insert to authenticated with check (
  bucket_id='message-files' and split_part(storage.objects.name,'/',2)=(select auth.uid())::text and exists(
    select 1 from public.chat_room_members crm
    where crm.room_id::text=split_part(storage.objects.name,'/',1)
      and private.is_room_member(crm.room_id)
      and storage.objects.name ~ ('^'||crm.room_id::text||'/'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  )
);

create function public.request_attachment_removal(p_attachment_kind text,p_attachment_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(true); bucket text; path text; target_message_id bigint;
begin
  if p_attachment_kind='post' then
    select a.storage_bucket,a.storage_path into bucket,path from public.post_attachments a join public.posts p on p.id=a.post_id where a.id=p_attachment_id and p.author_id=caller_id and p.deleted_at is null;
  elsif p_attachment_kind='message' then
    select a.storage_bucket,a.storage_path,a.message_id into bucket,path,target_message_id from public.message_attachments a join public.messages m on m.id=a.message_id where a.id=p_attachment_id and m.sender_id=caller_id and m.deleted_at is null and private.is_room_member(m.room_id);
  else raise exception 'invalid attachment kind'; end if;
  if path is null then raise exception 'attachment not found or not owned'; end if;

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by) values(bucket,path,caller_id)
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  if p_attachment_kind='post' then
    delete from public.post_attachments where id=p_attachment_id and storage_path=path;
  else
    delete from public.message_attachments where id=p_attachment_id and storage_path=path;
    delete from public.message_reactions where message_id=target_message_id;

    update public.messages m
    set content=null,deleted_at=now(),deleted_by=caller_id
    where m.id=target_message_id
      and m.deleted_at is null
      and m.content is null
      and not exists(select 1 from public.message_attachments a where a.message_id=m.id);
  end if;
end $$;

create function public.enqueue_due_storage_cleanup()
returns bigint language plpgsql security definer set search_path='' as $$
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


revoke all on table private.attachment_cleanup_queue from public,anon,authenticated;
revoke all on sequence private.attachment_cleanup_queue_id_seq from public,anon,authenticated;
grant select,insert,update,delete on private.attachment_cleanup_queue to service_role;
grant usage,select on sequence private.attachment_cleanup_queue_id_seq to service_role;
grant execute on function public.request_attachment_removal(text,bigint) to authenticated;
revoke execute on function public.request_attachment_removal(text,bigint) from public, anon, service_role;
grant execute on function public.enqueue_due_storage_cleanup(),public.claim_storage_cleanup(int4),public.complete_storage_cleanup(bigint),public.fail_storage_cleanup(bigint,text) to service_role;
revoke execute on function public.enqueue_due_storage_cleanup(),public.claim_storage_cleanup(int4),public.complete_storage_cleanup(bigint),public.fail_storage_cleanup(bigint,text) from public,anon,authenticated;
