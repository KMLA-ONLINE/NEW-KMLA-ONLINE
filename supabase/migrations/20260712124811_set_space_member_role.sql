set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.set_space_member_role(p_space_id bigint, p_user_id bigint, p_role public.member_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  caller_role public.member_role;
  target_role public.member_role;
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  select role into caller_role from public.space_members where space_id=p_space_id and user_id=caller_id;
  select role into target_role from public.space_members
  where space_id=p_space_id and user_id=p_user_id and banned_at is null
  for update;
  if target_role is null then raise exception 'not a member of this space'; end if;

  -- 소유권 이양은 별개의 일이다. owner는 space당 정확히 1명이라(space_members_one_owner_key +
  -- trg_validate_space_owner) 새 owner를 세우려면 기존 owner를 같은 트랜잭션에서 내려야 한다.
  -- 그걸 여기서 하면 "남을 승격시킨다"가 조용히 "내 소유권을 넘긴다"가 된다.
  if p_role='owner' or target_role='owner' then
    raise exception 'ownership transfer is a separate operation';
  end if;

  -- admin은 같은 급(admin)을 만들지도 내리지도 못한다. owner만 admin을 세우고 내린다.
  -- 안 그러면 admin끼리 서로 강등하는 진흙탕이 열린다(먼저 누르는 쪽이 이긴다).
  if caller_role='admin' and (target_role='admin' or p_role='admin') then
    raise exception 'only the space owner can change admin roles';
  end if;

  if target_role=p_role then return; end if;
  -- trg_notify_on_role_changed가 여기서 도는데, actor는 싣지 않는다
  -- (notifications_actor_shape_check가 강제 -- 행정 처분은 기관이 한다).
  update public.space_members set role=p_role where space_id=p_space_id and user_id=p_user_id;
end;
$function$
;



-- db diff는 함수 grant를 뱉지 않는다. 없으면 EXECUTE가 PUBLIC 기본값으로 열린 채 배포된다.
revoke execute on function public.set_space_member_role(bigint,bigint,public.member_role) from public, anon, authenticated, service_role;
grant execute on function public.set_space_member_role(bigint,bigint,public.member_role) to authenticated;
