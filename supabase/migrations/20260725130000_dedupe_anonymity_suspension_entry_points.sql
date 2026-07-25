set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.require_anonymous_post_author(p_post_id bigint)
 RETURNS TABLE(space_id bigint, author_id bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_space_id bigint;
  target_author_id bigint;
  target_is_anonymous boolean;
begin
  perform private.require_current_profile(true);

  select p.space_id, p.author_id, p.is_anonymous
    into target_space_id, target_author_id, target_is_anonymous
  from public.posts p
  where p.id = p_post_id and p.deleted_at is null;
  if not found then raise exception 'post not found'; end if;
  if not target_is_anonymous then raise exception 'anonymous post required'; end if;
  if not private.can_manage_space(target_space_id) then raise exception 'space manager required'; end if;

  return query select target_space_id, target_author_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.require_anonymous_comment_author(p_comment_id bigint)
 RETURNS TABLE(space_id bigint, author_id bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_space_id bigint;
  target_author_id bigint;
  target_is_anonymous boolean;
begin
  perform private.require_current_profile(true);

  select p.space_id, c.author_id, c.is_anonymous
    into target_space_id, target_author_id, target_is_anonymous
  from public.comments c
  join public.posts p on p.id = c.post_id
  where c.id = p_comment_id and c.deleted_at is null;
  if not found then raise exception 'comment not found'; end if;
  if not target_is_anonymous then raise exception 'anonymous comment required'; end if;
  if not private.can_manage_space(target_space_id) then raise exception 'space manager required'; end if;

  return query select target_space_id, target_author_id;
end;
$function$
;

revoke execute on function private.require_anonymous_post_author(bigint), private.require_anonymous_comment_author(bigint)
from public, anon, authenticated, service_role;

drop function public.suspend_post_author_anonymity(bigint);
drop function public.suspend_comment_author_anonymity(bigint);

CREATE OR REPLACE FUNCTION public.suspend_post_author_anonymity(p_post_id bigint)
 RETURNS TABLE(suspended_days integer, strike_count integer, already_suspended boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target record;
begin
  select * into target from private.require_anonymous_post_author(p_post_id);
  return query select * from private.suspend_anonymity(target.space_id, target.author_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.suspend_comment_author_anonymity(p_comment_id bigint)
 RETURNS TABLE(suspended_days integer, strike_count integer, already_suspended boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target record;
begin
  select * into target from private.require_anonymous_comment_author(p_comment_id);
  return query select * from private.suspend_anonymity(target.space_id, target.author_id);
end;
$function$
;

revoke execute on function public.suspend_post_author_anonymity(bigint), public.suspend_comment_author_anonymity(bigint)
from public, anon, authenticated, service_role;
grant execute on function public.suspend_post_author_anonymity(bigint), public.suspend_comment_author_anonymity(bigint)
to authenticated;

CREATE OR REPLACE FUNCTION public.undo_post_anonymity_suspension(p_post_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target record;
begin
  select * into target from private.require_anonymous_post_author(p_post_id);
  perform private.undo_anonymity_suspension(target.space_id, target.author_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.undo_comment_anonymity_suspension(p_comment_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target record;
begin
  select * into target from private.require_anonymous_comment_author(p_comment_id);
  perform private.undo_anonymity_suspension(target.space_id, target.author_id);
end;
$function$
;
