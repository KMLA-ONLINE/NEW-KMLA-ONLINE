alter table "public"."comments" alter column "content" drop not null;

alter table "public"."comments" add constraint "comments_content_present" CHECK (((content IS NOT NULL) OR (deleted_at IS NOT NULL))) not valid;

alter table "public"."comments" validate constraint "comments_content_present";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.set_post_pinned(p_id bigint, p_pinned boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  target_space_id bigint;
begin
  select space_id into target_space_id
  from public.posts where id=p_id and deleted_at is null
  for update;
  if not found then return; end if;
  if not private.can_manage_space(target_space_id) then
    raise exception 'space manager required';
  end if;

  update public.posts
  set pinned_at = case when p_pinned then now() else null end,
      pinned_by = case when p_pinned then caller_id else null end
  where id=p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_comment(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  target_author_id bigint;
  target_space_id bigint;
begin
  select c.author_id, p.space_id into target_author_id, target_space_id
  from public.comments c
  join public.posts p on p.id=c.post_id
  where c.id=p_id and c.deleted_at is null
  for update of c;
  if not found then return; end if;
  if target_author_id<>caller_id and not private.can_manage_space(target_space_id) then
    raise exception 'comment author or space manager required';
  end if;

  delete from public.comment_reactions where comment_id=p_id;

  -- 행을 지우지 않고 본문만 비운다. 답글이 달려 있으면 tombstone으로 남아야 트리가 끊기지 않는데
  -- (comments_select의 has_active_descendant), 그때 원문이 딸려 나가면 안 된다.
  update public.comments
  set content=null, deleted_at=now(), deleted_by=caller_id
  where id=p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_post(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  target_author_id bigint;
  target_space_id bigint;
begin
  select author_id, space_id into target_author_id, target_space_id
  from public.posts where id=p_id and deleted_at is null
  for update;
  if not found then return; end if;
  if target_author_id<>caller_id and not private.can_manage_space(target_space_id) then
    raise exception 'post author or space manager required';
  end if;

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by)
  select a.storage_bucket,a.storage_path,caller_id
  from public.post_attachments a
  where a.post_id=p_id
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  delete from public.post_attachments where post_id=p_id;
  delete from public.post_reactions where post_id=p_id;

  -- 댓글은 손대지 않는다. can_access_post가 post.deleted_at을 보므로 comments_select가 알아서 막는다.
  update public.posts
  set deleted_at=now(), deleted_by=caller_id
  where id=p_id;
end;
$function$
;



-- db diff가 grant/revoke를 안 잡아서 손으로 붙인다. 이게 없으면 새 함수들의 EXECUTE가 Postgres
-- 기본값대로 PUBLIC에 열려 anon도 게시물을 지울 수 있다.
revoke execute on function public.set_post_pinned(bigint,boolean), public.soft_delete_post(bigint), public.soft_delete_comment(bigint) from public, anon, authenticated, service_role;
grant execute on function public.set_post_pinned(bigint,boolean), public.soft_delete_post(bigint), public.soft_delete_comment(bigint) to authenticated;
