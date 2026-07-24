set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.set_space_member_notification_default()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  select case when s.type='group' then 'all'::public.notification_setting else 'mentions'::public.notification_setting end
  into new.notification_setting
  from public.spaces s
  where s.id=new.space_id;
  return new;
end;
$function$
;

REVOKE EXECUTE ON FUNCTION private.set_space_member_notification_default() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_set_space_member_notification_default BEFORE INSERT ON public.space_members FOR EACH ROW EXECUTE FUNCTION private.set_space_member_notification_default();

