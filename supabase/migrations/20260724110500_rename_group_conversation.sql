-- 그룹 대화 이름 변경 RPC. 그룹 멤버면 누구나 자유롭게 바꿀 수 있다(생성자/운영진 제한 없음).
set check_function_bodies = off;

create function public.rename_group_conversation(p_conversation_id bigint,p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare next_name text := btrim(coalesce(p_name,''));
begin
  perform private.require_current_profile(true);
  if char_length(next_name) < 1 or char_length(next_name) > 100 then raise exception 'group name must be 1 to 100 characters'; end if;
  if not exists(select 1 from public.conversations where id=p_conversation_id and type='group') then raise exception 'group conversation required'; end if;
  if not private.is_conversation_member(p_conversation_id) then raise exception 'not a member of this conversation'; end if;
  update public.conversations set name=next_name where id=p_conversation_id;
end;
$$;

revoke execute on function public.rename_group_conversation(bigint,text) from public, anon, authenticated, service_role;
grant execute on function public.rename_group_conversation(bigint,text) to authenticated;
