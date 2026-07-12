drop policy "space_categories_delete" on "public"."space_categories";

drop policy "space_categories_insert" on "public"."space_categories";

drop policy "space_categories_update" on "public"."space_categories";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.can_curate_space(p_space_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_space_member(p_space_id, array['owner','admin','manager']::public.member_role[])
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_space_ownership(p_space_id bigint, p_new_owner_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  target_role public.member_role;
begin
  if not private.is_space_member(p_space_id, array['owner']::public.member_role[]) then
    raise exception 'space owner required';
  end if;
  if p_new_owner_id=caller_id then return; end if;

  select role into target_role from public.space_members
  where space_id=p_space_id and user_id=p_new_owner_id and banned_at is null
  for update;
  if target_role is null then raise exception 'not a member of this space'; end if;
  if target_role<>'admin' then raise exception 'ownership can only be transferred to an admin'; end if;

  -- 순서가 중요하다. space_members_one_owner_key는 deferrable이 아닌 부분 유니크 인덱스라
  -- 커밋까지 미룰 수가 없다 -- 새 owner를 먼저 세우면 그 순간 owner가 둘이 되어 즉시 걸린다.
  -- 기존 owner를 먼저 내리면 잠깐 owner가 0명인데, 부분 유니크 인덱스는 0을 문제 삼지 않는다.
  -- "정확히 1명"을 보는 건 trg_validate_space_owner이고 그건 deferred라 커밋 시점에만 센다.
  update public.space_members set role='admin' where space_id=p_space_id and user_id=caller_id;
  update public.space_members set role='owner' where space_id=p_space_id and user_id=p_new_owner_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.can_post_in_space(p_space_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when (select s.post_policy from public.spaces s where s.id=p_space_id) = 'managers'
      then private.can_curate_space(p_space_id)
    else private.can_participate_space(p_space_id)
  end
$function$
;

CREATE OR REPLACE FUNCTION private.notify_on_role_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- 내가 바꾼 내 역할은 알릴 게 없다. transfer_space_ownership이 기존 owner를 admin으로
  -- 내리는 게 정확히 이 경우다 -- 방금 자기가 누른 버튼의 결과를 알림으로 다시 받는 건 잡음이다.
  -- notifications_no_self_notify는 이걸 못 잡는다: 그 제약은 actor_id를 보는데, 역할 변경 알림은
  -- actor를 아예 싣지 않기 때문이다(notifications_actor_shape_check가 금지한다).
  if new.user_id = private.current_profile_id() then return null; end if;

  insert into public.notifications(recipient_id,type,space_id,payload)
  values (new.user_id,'space_role_changed',new.space_id,
          jsonb_build_object('from',old.role,'to',new.role));
  return null;
end;
$function$
;

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
  -- can_manage_space가 아니라 can_curate_space다: 고정은 게시판을 정리하는 일이라 manager도 한다.
  -- (남의 글 삭제·익명 정지는 여전히 can_manage_space -- 그건 사람을 다루는 일이다.)
  if not private.can_curate_space(target_space_id) then
    raise exception 'space curator required';
  end if;

  update public.posts
  set pinned_at = case when p_pinned then now() else null end,
      pinned_by = case when p_pinned then caller_id else null end
  where id=p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_space_member_role(p_space_id bigint, p_user_id bigint, p_role public.member_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  target_role public.member_role;
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  select role into target_role from public.space_members
  where space_id=p_space_id and user_id=p_user_id and banned_at is null
  for update;
  if target_role is null then raise exception 'not a member of this space'; end if;

  -- owner는 이 함수로 세우지도 내리지도 못한다. 이 한 줄이 두 가지를 동시에 막는다.
  -- (1) admin이 owner를 끌어내리는 쿠데타. owner만이 자기 자리를 넘길 수 있다.
  -- (2) "남을 승격시킨다"가 조용히 "내 소유권을 넘긴다"가 되는 사고 -- owner는 space당 정확히
  --     1명이라(space_members_one_owner_key) 새 owner를 세우는 건 반드시 기존 owner를 내리는
  --     일이기도 하다. 그 맞바꿈은 transfer_space_ownership이 명시적으로 한다.
  if p_role='owner' or target_role='owner' then
    raise exception 'ownership transfer is a separate operation';
  end if;

  if target_role=p_role then return; end if;
  -- trg_notify_on_role_changed가 여기서 도는데, actor는 싣지 않는다
  -- (notifications_actor_shape_check가 강제 -- 행정 처분은 기관이 한다).
  update public.space_members set role=p_role where space_id=p_space_id and user_id=p_user_id;
end;
$function$
;


  create policy "space_categories_delete"
  on "public"."space_categories"
  as permissive
  for delete
  to authenticated
using (private.can_curate_space(space_id));



  create policy "space_categories_insert"
  on "public"."space_categories"
  as permissive
  for insert
  to authenticated
with check (private.can_curate_space(space_id));



  create policy "space_categories_update"
  on "public"."space_categories"
  as permissive
  for update
  to authenticated
using (private.can_curate_space(space_id))
with check (private.can_curate_space(space_id));




-- 손으로 붙인다. db diff는 grant를 뱉지 않는다.
--
-- can_curate_space는 space_categories의 insert/update/delete 정책이 부른다. RLS 정책 표현식의
-- 함수 호출은 **호출자 권한**으로 실행되므로, authenticated에 EXECUTE가 없으면 카테고리 관리가
-- 전부 "permission denied for function can_curate_space"로 죽는다.
revoke execute on function private.can_curate_space(bigint) from public, anon, authenticated, service_role;
grant execute on function private.can_curate_space(bigint) to authenticated;

revoke execute on function public.transfer_space_ownership(bigint,bigint) from public, anon, authenticated, service_role;
grant execute on function public.transfer_space_ownership(bigint,bigint) to authenticated;
