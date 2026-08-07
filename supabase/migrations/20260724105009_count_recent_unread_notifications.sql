drop index if exists "public"."idx_notifications_unread";

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (recipient_id, created_at DESC) WHERE (read_at IS NULL);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  result bigint;
begin
  select count(*)::bigint into result
  from (
    select 1 from public.notifications n
    where n.recipient_id=caller_id and n.read_at is null and n.created_at >= now()-interval '24 hours'
    limit 100
  ) capped;
  return result;
end;
$function$
;


