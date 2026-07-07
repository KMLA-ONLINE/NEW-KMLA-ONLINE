drop policy "comments_select" on "public"."comments";

alter table "public"."post_attachments" drop constraint "post_attachments_alt_check";

drop function if exists "private"."has_active_direct_reply"(p_comment_id bigint);

alter table "public"."post_attachments" drop column "alt";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.has_active_descendant(p_comment_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recursive descendants as (
    select c.id, c.deleted_at, 1 as depth
    from public.comments c
    where c.parent_id = p_comment_id
    union all
    select child.id, child.deleted_at, d.depth + 1
    from public.comments child
    join descendants d on child.parent_id = d.id
    where d.depth < 50
  )
  select exists (select 1 from descendants where deleted_at is null)
$function$
;

CREATE OR REPLACE FUNCTION private.validate_comment_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.parent_id is not null and not exists (
    select 1
    from public.comments as parent
    where parent.id = new.parent_id
      and parent.post_id = new.post_id
      and parent.deleted_at is null
  ) then
    raise exception 'comment parent must be an active comment on the same post';
  end if;
  return new;
end;
$function$
;


  create policy "comments_select"
  on "public"."comments"
  as permissive
  for select
  to authenticated
using ((private.can_access_post(post_id) AND ((deleted_at IS NULL) OR private.has_active_descendant(id))));




-- Function execute grants (migra does not emit these reliably).
revoke execute on function private.has_active_descendant(bigint) from public, anon, service_role;
grant execute on function private.has_active_descendant(bigint) to authenticated;
