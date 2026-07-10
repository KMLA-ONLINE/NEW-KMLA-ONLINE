-- Caps every invite at 30 days: an omitted expiry now defaults to that ceiling
-- rather than living forever, and an explicit expiry beyond it is rejected. This
-- closes the standing-shared-link hole (a leaked link that never expires) and
-- makes the accept-side expiry check the enforcement of a real bound. The usual
-- per-invite default (e.g. a week for a 1:1) is UI policy, not enforced here.
--
-- Body-only change to create_space_invite -- the signature is unchanged, so the
-- execute grant survives and needs no restoring.

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.create_space_invite(p_space_id bigint, p_target_user_id bigint DEFAULT NULL::bigint, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true); new_token text; expires timestamptz;
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;
  if p_target_user_id is not null and not exists(
    select 1 from public.profiles where id=p_target_user_id and status='accepted' and deleted_at is null
  ) then raise exception 'invite target must be an accepted user'; end if;
  -- 어떤 초대도 30일을 넘겨 살지 못한다. 미지정이면 그 상한을 기본값으로 쓴다
  -- ('영원한 초대'를 없애는 게 상한의 목적이라 null을 무기한으로 두지 않는다).
  -- '보통 며칠'이라는 기본값은 정책이라 호출자(UI)가 정한다.
  expires := coalesce(p_expires_at, now() + interval '30 days');
  if expires <= now() or expires > now() + interval '30 days' then
    raise exception 'invite expiry must be within 30 days';
  end if;
  new_token := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.space_invites(space_id,token,target_user_id,created_by,expires_at)
  values(p_space_id,new_token,p_target_user_id,caller_id,expires);
  return new_token;
end;
$function$
;


