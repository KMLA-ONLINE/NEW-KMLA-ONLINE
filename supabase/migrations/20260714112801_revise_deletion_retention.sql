CREATE INDEX idx_comments_deleted_at ON public.comments USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);

CREATE INDEX idx_comments_parent ON public.comments USING btree (parent_id) WHERE (parent_id IS NOT NULL);

CREATE INDEX idx_notifications_read_at ON public.notifications USING btree (read_at, id) WHERE (read_at IS NOT NULL);

CREATE INDEX idx_posts_deleted_at ON public.posts USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.purge_read_notifications(p_older_than interval DEFAULT '60 days'::interval, p_limit integer DEFAULT 1000)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cutoff timestamptz;
  purged bigint;
begin
  perform private.require_service_role();
  if p_limit not between 1 and 5000 then raise exception 'limit must be between 1 and 5000'; end if;
  if p_older_than < interval '1 day' then raise exception 'purge cutoff must be at least 1 day'; end if;
  cutoff := now() - p_older_than;

  with targets as (
    select n.id from public.notifications n
    where n.read_at < cutoff
    order by n.read_at,n.id
    limit p_limit
  )
  delete from public.notifications n using targets t where n.id=t.id;
  get diagnostics purged = row_count;
  return purged;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.purge_deleted_content(p_older_than interval DEFAULT '7 days'::interval, p_limit integer DEFAULT 100)
 RETURNS TABLE(purged_posts bigint, purged_comments bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cutoff timestamptz;
  target_posts bigint[];
  target_comments bigint[];
  post_total bigint := 0;
  comment_total bigint := 0;
  orphan_total bigint := 0;
  removed bigint;
begin
  perform private.require_service_role();
  if p_limit not between 1 and 1000 then raise exception 'limit must be between 1 and 1000'; end if;
  if p_older_than < interval '1 day' then raise exception 'purge cutoff must be at least 1 day'; end if;
  cutoff := now() - p_older_than;

  select array_agg(t.id) into target_posts
  from (
    select p.id from public.posts p
    where p.deleted_at < cutoff
      and not exists(select 1 from public.post_attachments a where a.post_id=p.id)
    order by p.deleted_at
    limit p_limit
  ) t;

  if target_posts is not null then
    -- 글이 사라지면 그 댓글은 어차피 아무도 못 본다(can_access_post가 post.deleted_at을 본다).
    -- 살아 있는 댓글도 같이 간다 -- comments.post_id가 restrict라 남겨두면 글을 못 지운다.
    delete from public.comment_reactions cr using public.comments c
    where cr.comment_id=c.id and c.post_id=any(target_posts);
    delete from public.post_reactions where post_id=any(target_posts);
    -- parent_id가 restrict라 잎부터 벗겨야 한다. 답글->루트 2단계로는 임의 깊이를 못 지운다
    -- (cleanup_conversation이 messages에 같은 루프를 도는 것과 같은 이유).
    loop
      delete from public.comments c
      where c.post_id=any(target_posts)
        and not exists(select 1 from public.comments child where child.parent_id=c.id);
      get diagnostics removed = row_count;
      comment_total := comment_total + removed;
      exit when removed = 0;
    end loop;
    -- notifications / post_mentions / comment_mentions는 cascade라 알아서 따라간다.
    delete from public.posts where id=any(target_posts);
    get diagnostics post_total = row_count;
  end if;

  -- 살아 있는 글에 달린, 삭제된 지 오래된 댓글. 자식이 하나라도 있으면(살아 있든 죽었든) restrict
  -- 때문에 못 지운다 -- 그래서 잎만 걷는다. 자식이 전부 죽은 서브트리는 잎부터 차례로 걷혀 결국
  -- 통째로 사라지고, 살아 있는 답글이 하나라도 달린 tombstone은 계속 남는다(답글 사슬이 끊기면
  -- 안 되니 comments_select가 has_active_descendant로 그걸 계속 보여준다).
  --
  -- 배치를 id 배열로 **한 번** 고정하고 그 안에서만 벗기면 안 된다: 최상위 댓글 삭제가 서브트리를
  -- 통째로 같은 deleted_at으로 만들기 때문에 큰 트리는 배치 경계에서 잘리고, 뽑힌 p_limit개가 전부
  -- "자식이 배치 밖에 있는" 중간 노드이면 한 행도 못 지운 채 다음 실행이 같은 집합을 다시 고른다
  -- -- 영영 안 줄어든다. 매 라운드 잎을 다시 찾으면 한 겹씩 확실히 벗겨진다.
  loop
    select array_agg(t.id) into target_comments
    from (
      select c.id from public.comments c
      where c.deleted_at < cutoff
        and not exists(select 1 from public.comments child where child.parent_id=c.id)
      order by c.deleted_at
      limit p_limit - orphan_total
    ) t;
    exit when target_comments is null;

    -- soft_delete_comment가 이미 지웠지만, service_role이 직접 소프트 삭제한 행도 있을 수 있다.
    delete from public.comment_reactions where comment_id=any(target_comments);
    delete from public.comments where id=any(target_comments);
    get diagnostics removed = row_count;
    comment_total := comment_total + removed;
    orphan_total := orphan_total + removed;
    exit when orphan_total >= p_limit;
  end loop;

  return query select post_total, comment_total;
end;
$function$
;

REVOKE EXECUTE ON FUNCTION public.purge_read_notifications(interval,int4) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_read_notifications(interval,int4) TO service_role;

CREATE OR REPLACE FUNCTION private.has_active_descendant(p_comment_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recursive descendants(id,deleted_at) as (
    select c.id, c.deleted_at
    from public.comments c
    where c.parent_id = p_comment_id
    union
    select child.id, child.deleted_at
    from public.comments child
    join descendants d on child.parent_id = d.id
  )
  select exists (select 1 from descendants where deleted_at is null)
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
  target_space_id bigint;
  target_parent_id bigint;
  targets bigint[];
begin
  -- soft_delete_post와 같은 이유로 권한 조건을 SELECT에 합친다: "없는 댓글"과 "권한 없는 댓글"이
  -- 똑같이 0행이 되어 존재 여부 오라클을 없앤다.
  select p.space_id,c.parent_id into target_space_id,target_parent_id
  from public.comments c
  join public.posts p on p.id=c.post_id
  where c.id=p_id and c.deleted_at is null
    and (c.author_id=caller_id or private.can_manage_space(p.space_id))
  for update of c;
  if not found then return; end if;

  -- 최상위 댓글은 스레드 전체를 데리고 간다(글을 지우면 댓글이 딸려 가는 것과 같다). 답글은 자기
  -- 자신만 -- 그 아래 답글은 남의 대화고, 여기서 끊으면 사슬이 orphan이 된다.
  if target_parent_id is null then
    with recursive subtree(id) as (
      select p_id
      union
      select child.id from public.comments child join subtree parent on child.parent_id=parent.id
    )
    select array_agg(id) into targets from subtree;
  else
    targets := array[p_id];
  end if;

  delete from public.comment_reactions where comment_id=any(targets);

  -- 행을 지우지 않고 본문만 비운다. 살아 있는 답글이 남으면 tombstone으로 버텨야 트리가 끊기지
  -- 않는데(comments_select의 has_active_descendant), 그때 원문이 딸려 나가면 안 된다.
  -- 이미 tombstone인 행은 건드리지 않는다 -- 원래 삭제 시각과 삭제자를 덮어쓸 이유가 없다.
  --
  -- deleted_by는 **직접 지목한 행에만** 남긴다. 딸려 간 답글에까지 caller_id를 찍으면
  -- notify_on_comment_removed(deleted_by is not null and <> author_id)가 답글 작성자 전원에게
  -- comment_removed를 쏜다 -- "당신 댓글이 모더레이션으로 삭제됐다"는 뜻인데 실제로는 스레드가
  -- 접혔을 뿐이다. 여기서 null은 "몰라서 비운 것"이 아니라 **"캐스케이드로 딸려 갔다"는 표식**이고,
  -- 그 표식이 곧 알림을 끄는 스위치다. 누가 지웠는지는 조상 tombstone의 deleted_by가 갖고 있다.
  update public.comments c
  set content=null,
      deleted_at=now(),
      deleted_by=case when c.id=p_id then caller_id else null end
  where c.id=any(targets) and c.deleted_at is null;
end;
$function$
;

-- profiles의 auth_user_id / status_updated_by를 클라이언트 SELECT에서 회수한다. status_updated_by는
-- 심사자 신원이라, 본인 행이 status 무관하게 보이는 상황에서 테이블 전체 grant면 거절당한 학생이
-- 자기를 거절한 관리자를 특정할 수 있다(보복). 컬럼 단위로 다시 연다. (migra는 컬럼 grant를 diff에
-- 담지 못하므로 이 두 줄은 손으로 쓴다.)
revoke select on table public.profiles from authenticated;
grant select (
  id, name, role, type, student_number, class_no, cohort, gender, track, department,
  phone_number, avatar_url, cover_image_url, birthday, description, status, dorm_room,
  is_reenrolled, onboarding_completed_at, status_updated_at, created_at, updated_at, deleted_at
) on table public.profiles to authenticated;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.validate_comment_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.parent_id is not null then
    if not exists (
      select 1
      from public.comments as parent
      where parent.id = new.parent_id
        and parent.post_id = new.post_id
        and parent.deleted_at is null
    ) then
      raise exception 'comment parent must be an active comment on the same post';
    end if;
    -- 중첩 깊이를 30으로 막는다. 이 캡이 없으면 임의로 깊은 답글 사슬을 만들 수 있고, 그러면
    -- comments_select가 tombstone마다 부르는 has_active_descendant(사슬 끝까지 재귀)가 사슬 하나에
    -- O(N^2)로 폭발해 조회 한 번으로 DB를 태울 수 있다. 깊이를 여기서 막으면 그 재귀가 자연히
    -- 30단계로 유계가 된다 -- 함수 쪽에 깊이 캡을 두면 정확성이 깨지므로(깊은 tombstone이 조용히
    -- 사라져 트리가 끊긴다) 캡은 생성 시점인 여기 있어야 한다. 부모까지의 조상 수는 곧 부모의
    -- 깊이이고, 새 댓글은 그보다 한 단 깊다 -- 부모가 이미 30단계면 거절한다.
    if (
      with recursive ancestors(id, parent_id, depth) as (
        select c.id, c.parent_id, 1 from public.comments c where c.id = new.parent_id
        union all
        select c.id, c.parent_id, a.depth + 1
        from public.comments c join ancestors a on c.id = a.parent_id
        where a.depth < 30
      )
      select max(depth) from ancestors
    ) >= 30 then
      raise exception 'comment nesting too deep';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.join_space(p_space_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true); space_policy public.space_join_policy;
begin
  select join_policy into space_policy from public.spaces where id=p_space_id and deleted_at is null;
  if space_policy is null then raise exception 'space not found'; end if;
  -- 멤버십·밴 확인을 invite_only 분기보다 **먼저** 한다. 그래야 invite_only를 "없는 공간"과
  -- 똑같이 응답할 수 있다 -- 순차 id를 훑어 비공개 공간의 존재를 열거하는 오라클을 막는다.
  -- 이미 멤버/밴인 사람은 어차피 그 공간을 아는 사람이라 여기서 갈라도 새어 나갈 게 없다.
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=caller_id and banned_at is not null) then raise exception 'banned from this space'; end if;
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=caller_id) then return 'joined'; end if;
  -- 비멤버에게 invite_only는 존재 자체를 숨긴다(spaces_select가 숨기는 것과 같은 응답).
  if space_policy='invite_only' then raise exception 'space not found'; end if;
  if space_policy='request' then
    insert into public.space_join_requests(space_id,user_id) values(p_space_id,caller_id) on conflict do nothing;
    return 'requested';
  end if;
  insert into public.space_members(space_id,user_id,role) values(p_space_id,caller_id,'member') on conflict do nothing;
  if found then update public.spaces set member_count=member_count+1 where id=p_space_id; end if;
  return 'joined';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.leave_space(p_space_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true);
begin
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=caller_id and role='owner') then
    raise exception 'transfer ownership before leaving';
  end if;
  -- banned_at is null: 밴당한 사람이 leave로 자기 밴 기록(space_members 행)을 지우고 join_space로
  -- 재가입해 밴을 무효화하는 걸 막는다. 밴은 탈퇴로 풀리지 않는다.
  delete from public.space_members where space_id=p_space_id and user_id=caller_id and banned_at is null;
  if found then update public.spaces set member_count=greatest(member_count-1,0) where id=p_space_id; end if;
end;
$function$
;
