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
create policy profile_covers_select on storage.objects for select to authenticated using (
  bucket_id='profile-covers' and exists(select 1 from public.profiles p where p.cover_image_url=storage.objects.name and p.deleted_at is null)
);
create policy space_images_select on storage.objects for select to authenticated using (
  bucket_id='space-images' and exists(select 1 from public.spaces s where s.image_url=storage.objects.name and s.deleted_at is null)
);
create policy post_files_select on storage.objects for select to authenticated using (
  bucket_id='post-files' and exists(select 1 from public.post_attachments a where a.storage_path=storage.objects.name and private.can_access_post(a.post_id))
);
-- 첨부 버킷이 둘인 이유: 1:1 대화의 blob은 암호문이라 storage 입장에서는 전부
-- application/octet-stream이다. 그걸 message-files에 넣으면 그 버킷의 MIME 화이트리스트가
-- (image/svg+xml 차단을 포함해서) 통째로 무력해진다. 그래서 octet-stream만 받는 버킷을 따로
-- 두고, 그룹 채팅의 화이트리스트는 손대지 않은 채로 남겨둔다.
create policy message_files_select on storage.objects for select to authenticated using (
  bucket_id in ('message-files','message-files-encrypted') and (
    exists(select 1 from public.message_attachments a where a.storage_bucket=storage.objects.bucket_id and a.storage_path=storage.objects.name and private.can_access_message(a.message_id))
    or (
      split_part(storage.objects.name,'/',2)=(select auth.uid())::text
      and exists(
        select 1 from public.conversations c
        where c.id::text=split_part(storage.objects.name,'/',1)
          and private.is_conversation_member(c.id)
          and private.has_uuid_object_suffix(storage.objects.name,c.id::text||'/'||(select auth.uid())::text||'/')
      )
    )
  )
);
create policy avatars_insert on storage.objects for insert to authenticated with check (
  bucket_id='avatars' and exists(select 1 from public.profiles p where p.auth_user_id=(select auth.uid()) and p.deleted_at is null)
  and private.has_uuid_object_suffix(storage.objects.name,(select auth.uid())::text||'/')
);
create policy profile_covers_insert on storage.objects for insert to authenticated with check (
  bucket_id='profile-covers' and exists(select 1 from public.profiles p where p.auth_user_id=(select auth.uid()) and p.deleted_at is null)
  and private.has_uuid_object_suffix(storage.objects.name,(select auth.uid())::text||'/')
);
create policy space_images_insert on storage.objects for insert to authenticated with check (
  bucket_id='space-images' and exists(
    select 1 from public.spaces s
    where s.pub_id::text=split_part(storage.objects.name,'/',1)
      and s.deleted_at is null
      and private.can_manage_space(s.id)
      and private.has_uuid_object_suffix(storage.objects.name,s.pub_id::text||'/')
  )
);
-- 경로는 <space.pub_id>/<auth.uid()>/<uuid>다. blob을 글이 아니라 space에 매는 이유:
-- 글보다 먼저 업로드할 수 있어야 create_post_with_attachments가 글+첨부를 한 트랜잭션으로 끝낸다.
-- 글에 매면 작성 -> 업로드 -> 확정 3단계가 되고, 중간에 실패하면 첨부 없는 글이 남아 보상
-- 트랜잭션(soft delete)이 필요해진다 -- 그 보상도 실패할 수 있어 유령 글이 생긴다.
-- message_files_insert가 blob을 대화에 매는 것과 같은 구조이고, 보안 성질도 같다: 내가 참여하는
-- 공간의, 내 uid 경로에만 올릴 수 있다. 확정되지 않은 blob은 고아 청소가 걷어간다.
create policy post_files_insert on storage.objects for insert to authenticated with check (
  bucket_id='post-files' and split_part(storage.objects.name,'/',2)=(select auth.uid())::text and exists(
    select 1 from public.spaces s
    where s.pub_id::text=split_part(storage.objects.name,'/',1)
      and s.deleted_at is null
      and private.can_participate_space(s.id)
      and private.has_uuid_object_suffix(storage.objects.name,s.pub_id::text||'/'||(select auth.uid())::text||'/')
  )
);
-- 버킷을 클라이언트가 고르는 게 아니라 대화 타입이 정한다. 그래서 1:1 대화 경로에 평문
-- 파일을 올리는 것 자체가 불가능하다 -- 나중에 send RPC나 첨부 트리거에서 걸러지는 게 아니라,
-- 업로드가 애초에 통과하지 못한다.
create policy message_files_insert on storage.objects for insert to authenticated with check (
  bucket_id in ('message-files','message-files-encrypted')
  and split_part(storage.objects.name,'/',2)=(select auth.uid())::text
  and exists(
    select 1 from public.conversations c
    where c.id::text=split_part(storage.objects.name,'/',1)
      and private.is_conversation_member(c.id)
      and private.has_uuid_object_suffix(storage.objects.name,c.id::text||'/'||(select auth.uid())::text||'/')
      and bucket_id = case when c.type='direct' then 'message-files-encrypted' else 'message-files' end
  )
);

-- p_owner_type says which table owns the attachment, 'post' or 'message'. Not to
-- be confused with public.attachment_kind, which says what the attachment is.
create function public.request_attachment_removal(p_owner_type text,p_attachment_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(true); bucket text; path text; target_message_id bigint;
begin
  if p_owner_type='post' then
    select a.storage_bucket,a.storage_path into bucket,path from public.post_attachments a join public.posts p on p.id=a.post_id where a.id=p_attachment_id and p.author_id=caller_id and p.deleted_at is null;
  elsif p_owner_type='message' then
    select a.storage_bucket,a.storage_path,a.message_id into bucket,path,target_message_id from public.message_attachments a join public.messages m on m.id=a.message_id where a.id=p_attachment_id and m.sender_id=caller_id and m.deleted_at is null and private.can_access_message(m.id);
  else raise exception 'attachment owner type must be post or message'; end if;
  if path is null then raise exception 'attachment not found or not owned'; end if;

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by) values(bucket,path,caller_id)
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  if p_owner_type='post' then
    delete from public.post_attachments where id=p_attachment_id and storage_path=path;
  else
    delete from public.message_attachments where id=p_attachment_id and storage_path=path;

    -- 마지막 첨부를 뗐는데 본문도 없으면(평문이든 암호문이든) 남는 게 없으니 메시지째 삭제된다.
    update public.messages m
    set content=null,content_ciphertext=null,deleted_at=now(),deleted_by=caller_id
    where m.id=target_message_id
      and m.deleted_at is null
      and m.content is null
      and m.content_ciphertext is null
      and not exists(select 1 from public.message_attachments a where a.message_id=m.id);

    -- 반응과 봉투는 **메시지가 실제로 죽었을 때만** 지운다. 조건 없이 지우면 사진 세 장 중
    -- 하나만 뗀 사람이 그 메시지에 달린 반응을 전부 날려 버린다 -- 메시지도 본문도 나머지
    -- 첨부도 멀쩡히 살아 있는데.
    if found then
      delete from public.message_reactions where message_id=target_message_id;
      delete from public.message_keys where message_id=target_message_id;
    end if;
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
    and o.bucket_id in ('avatars','profile-covers','space-images','post-files','message-files','message-files-encrypted')
    and not exists(select 1 from public.profiles p where o.bucket_id='avatars' and p.avatar_url=o.name)
    and not exists(select 1 from public.profiles p where o.bucket_id='profile-covers' and p.cover_image_url=o.name)
    and not exists(select 1 from public.spaces s where o.bucket_id='space-images' and s.image_url=o.name)
    and not exists(select 1 from public.post_attachments a where o.bucket_id='post-files' and a.storage_path=o.name)
    and not exists(select 1 from public.message_attachments a where o.bucket_id in ('message-files','message-files-encrypted') and a.storage_bucket=o.bucket_id and a.storage_path=o.name)
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
  elsif bucket in ('message-files','message-files-encrypted') then delete from public.message_attachments where storage_bucket=bucket and storage_path=path;
  elsif bucket='avatars' then update public.profiles set avatar_url=null where avatar_url=path;
  elsif bucket='profile-covers' then update public.profiles set cover_image_url=null where cover_image_url=path;
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
