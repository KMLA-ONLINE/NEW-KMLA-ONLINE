drop function if exists "public"."purge_read_notifications"(p_older_than interval, p_limit integer);

drop index if exists "public"."idx_notifications_read_at";

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at, id);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.purge_notifications(p_older_than interval DEFAULT '30 days'::interval, p_limit integer DEFAULT 1000)
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
  if p_limit is null or p_limit not between 1 and 5000 then raise exception 'limit must be between 1 and 5000'; end if;
  if p_older_than is null or p_older_than < interval '1 day' then raise exception 'purge cutoff must be at least 1 day'; end if;
  cutoff := now() - p_older_than;

  with targets as (
    select n.id from public.notifications n
    where n.created_at < cutoff
    order by n.created_at,n.id
    limit p_limit
  )
  delete from public.notifications n using targets t where n.id=t.id;
  get diagnostics purged = row_count;
  return purged;
end;
$function$
;

REVOKE EXECUTE ON FUNCTION public.purge_notifications(interval, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_notifications(interval, integer) TO service_role;
