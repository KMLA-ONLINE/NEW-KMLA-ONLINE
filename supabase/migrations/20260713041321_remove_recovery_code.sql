alter table "public"."user_keys" drop constraint "user_keys_recovery_wrapped_user_key_check";

drop function if exists "public"."create_user_keys"(p_identity_public_key text, p_wrapped_user_key text, p_wrapped_identity_secret_key text, p_recovery_wrapped_user_key text);

drop function if exists "public"."reseal_user_keys"(p_wrapped_user_key text, p_recovery_wrapped_user_key text);

drop function if exists "public"."rotate_user_keys"(p_identity_public_key text, p_wrapped_user_key text, p_wrapped_identity_secret_key text, p_recovery_wrapped_user_key text);

drop function if exists "public"."get_my_key_vault"();

alter table "public"."user_keys" drop column "recovery_wrapped_user_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.create_user_keys(p_identity_public_key text, p_wrapped_user_key text, p_wrapped_identity_secret_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(false);
begin
  insert into public.user_keys (
    user_id, identity_public_key, wrapped_user_key, wrapped_identity_secret_key
  )
  values (
    caller_id,
    decode(p_identity_public_key, 'base64'),
    decode(p_wrapped_user_key, 'base64'),
    decode(p_wrapped_identity_secret_key, 'base64')
  );
exception when unique_violation then
  raise exception 'key vault already exists';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reseal_user_keys(p_wrapped_user_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(false);
begin
  update public.user_keys
  set wrapped_user_key = decode(p_wrapped_user_key, 'base64'),
      updated_at = now()
  where user_id = caller_id;
  if not found then raise exception 'key vault not found'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rotate_user_keys(p_identity_public_key text, p_wrapped_user_key text, p_wrapped_identity_secret_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(false);
begin
  update public.user_keys
  set identity_public_key = decode(p_identity_public_key, 'base64'),
      wrapped_user_key = decode(p_wrapped_user_key, 'base64'),
      wrapped_identity_secret_key = decode(p_wrapped_identity_secret_key, 'base64'),
      updated_at = now()
  where user_id = caller_id;
  if not found then raise exception 'key vault not found'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_key_vault()
 RETURNS TABLE(identity_public_key text, wrapped_user_key text, wrapped_identity_secret_key text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(false);
begin
  return query
  select
    encode(k.identity_public_key, 'base64'),
    encode(k.wrapped_user_key, 'base64'),
    encode(k.wrapped_identity_secret_key, 'base64')
  from public.user_keys k
  where k.user_id = caller_id;
end;
$function$
;

-- migra는 함수 grant를 내지 않는다. 위 네 함수는 파라미터가 바뀌어 drop+recreate됐으므로
-- 예전 grant가 사라졌고, 00-foundation의 default-privilege 회수 때문에 지금은 아무도 실행할 수
-- 없다. authenticated에게 다시 열지 않으면 로그인·가입·비밀번호 변경·계정 회수가 전부 죽는다.
-- (tests/00-privileges.sql이 이 회귀를 잡는다.)
revoke execute on function public.create_user_keys(text,text,text), public.reseal_user_keys(text), public.rotate_user_keys(text,text,text), public.get_my_key_vault() from public, anon, service_role;
grant execute on function public.create_user_keys(text,text,text), public.reseal_user_keys(text), public.rotate_user_keys(text,text,text), public.get_my_key_vault() to authenticated;

