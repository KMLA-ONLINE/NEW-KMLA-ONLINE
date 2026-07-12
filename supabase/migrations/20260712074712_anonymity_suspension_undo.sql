set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.undo_anonymity_suspension(p_space_id bigint, p_author_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_current_profile(true);
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  delete from public.space_anonymity_suspensions
  where space_id=p_space_id and user_id=p_author_id and strike_count <= 1;

  update public.space_anonymity_suspensions
  set suspended_until=now(), strike_count=strike_count-1
  where space_id=p_space_id and user_id=p_author_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.undo_comment_anonymity_suspension(p_comment_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_space_id bigint; target_author_id bigint;
begin
  select p.space_id, c.author_id into target_space_id, target_author_id
  from public.comments c join public.posts p on p.id=c.post_id
  where c.id=p_comment_id and c.deleted_at is null and c.is_anonymous;
  if not found then raise exception 'anonymous comment required'; end if;
  perform private.undo_anonymity_suspension(target_space_id, target_author_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.undo_post_anonymity_suspension(p_post_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.posts;
begin
  select * into target from public.posts
  where id=p_post_id and deleted_at is null and is_anonymous;
  if not found then raise exception 'anonymous post required'; end if;
  perform private.undo_anonymity_suspension(target.space_id, target.author_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION private.suspend_anonymity(p_space_id bigint, p_author_id bigint)
 RETURNS TABLE(suspended_days integer, strike_count integer, already_suspended boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  prior_strikes int4;
  prior_until timestamptz;
  effective_days int4;
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  select x.strike_count, x.suspended_until into prior_strikes, prior_until
  from public.space_anonymity_suspensions x
  where x.space_id=p_space_id and x.user_id=p_author_id
  for update;

  -- 이미 정지 중 -> 형량을 쌓지 않는다. 남은 기간과 누범 횟수만 돌려준다.
  if found and prior_until > now() then
    return query select
      ceil(extract(epoch from prior_until - now()) / 86400)::int4,
      prior_strikes,
      true;
    return;
  end if;

  -- 시간이 지났다고 누범을 자동으로 지우지 않는다. 그러면 띄엄띄엄 반복하는 사람이 영원히 초범으로
  -- 남는다. 오판이었다면 관리자가 reset_*_author_anonymity로 명시적으로 지운다.
  if not found then prior_strikes := 0; end if;

  -- 1일 → 2일 → 4일 → 8일 … 2배씩, 90일 상한.
  effective_days := least((2 ^ least(prior_strikes, 7))::int4, 90);

  insert into public.space_anonymity_suspensions(space_id,user_id,suspended_until,strike_count,suspended_by)
  values (p_space_id, p_author_id, now() + make_interval(days => effective_days), prior_strikes + 1, caller_id)
  on conflict (space_id,user_id) do update
  set suspended_until=excluded.suspended_until,
      strike_count=excluded.strike_count,
      suspended_by=excluded.suspended_by,
      created_at=now();

  return query select effective_days, prior_strikes + 1, false;
end;
$function$
;



-- db diff가 함수 grant를 놓친다. 없으면 default privilege에 막혀 새 RPC를 아무도 못 부르거나,
-- 반대로 PUBLIC에 열려 anon이 익명 정지를 취소할 수 있다.
revoke execute on function private.undo_anonymity_suspension(bigint,bigint) from public, anon, authenticated, service_role;
revoke execute on function public.undo_post_anonymity_suspension(bigint), public.undo_comment_anonymity_suspension(bigint) from public, anon, authenticated, service_role;
grant execute on function public.undo_post_anonymity_suspension(bigint), public.undo_comment_anonymity_suspension(bigint) to authenticated;
