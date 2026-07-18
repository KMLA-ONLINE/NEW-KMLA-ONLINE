CREATE INDEX idx_post_reactions_post_created_at ON public.post_reactions USING btree (post_id, created_at, user_id);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_post_reactors(p_post_id bigint, p_reaction_type_id bigint DEFAULT NULL::bigint, p_after_user_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 30)
 RETURNS TABLE(user_id bigint, name text, avatar_url text, reaction_type_id bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  after_created_at timestamptz;
begin
  perform private.require_current_profile(true);
  if not private.can_access_post(p_post_id) then raise exception 'post access required'; end if;
  -- null 상한 가드. `p_limit < 1`은 null일 때 참이 아니라 null이라 그냥 지나가고, `limit null`은
  -- 상한이 없다는 뜻이라 접근 가능한 반응자를 한 번에 통째로 빨아낼 수 있다(다른 읽기 RPC와 동일).
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  if p_after_user_id is not null then
    select r.created_at into after_created_at
    from public.post_reactions r where r.post_id=p_post_id and r.user_id=p_after_user_id;
  end if;

  return query
  select r.user_id, pr.name, pr.avatar_url, r.reaction_type_id, r.created_at
  from public.post_reactions r
  join public.profiles pr on pr.id=r.user_id
  where r.post_id=p_post_id
    and (p_reaction_type_id is null or r.reaction_type_id=p_reaction_type_id)
    and (p_after_user_id is null or (r.created_at, r.user_id) < (after_created_at, p_after_user_id))
  order by r.created_at desc, r.user_id desc
  limit p_limit;
end;
$function$
;

-- diff는 함수 grant를 내보내지 않는다(00-privileges.sql 참고). CREATE OR REPLACE로 만든 함수는
-- 기본이 EXECUTE TO PUBLIC이라, 손으로 회수하고 authenticated에만 다시 준다 -- 스키마 파일과 동일하게.
revoke execute on function public.get_post_reactors(bigint,bigint,bigint,int4) from public, anon, authenticated, service_role;
grant execute on function public.get_post_reactors(bigint,bigint,bigint,int4) to authenticated;

