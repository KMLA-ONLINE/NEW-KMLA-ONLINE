create function private.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.profiles p
    where p.auth_user_id = (select auth.uid())
      and p.type = 'teacher'
      and p.deleted_at is null
  )
$$;

revoke execute on function private.is_teacher() from public, anon, service_role;
grant execute on function private.is_teacher() to authenticated;

drop policy "spaces_select" on "public"."spaces";

set check_function_bodies = off;

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
  -- 선생님은 기존 공간을 스스로 찾아 들어가지 않는다. 초대 수락과 관리자의 가입 승인은
  -- 별도 흐름이라 그대로 열어 둔다. 비멤버에게는 invite_only와 같은 응답으로 공간을 숨긴다.
  if private.is_teacher() then raise exception 'space not found'; end if;
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


  create policy "spaces_select"
  on "public"."spaces"
  as permissive
  for select
  to authenticated
using (((deleted_at IS NULL) AND (((join_policy = ANY (ARRAY['public'::public.space_join_policy, 'request'::public.space_join_policy])) AND ( SELECT private.is_accepted_user() AS is_accepted_user) AND (NOT ( SELECT private.is_teacher() AS is_teacher))) OR private.is_space_member(id))));


