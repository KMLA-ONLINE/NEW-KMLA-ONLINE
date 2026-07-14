set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.purge_space(p_space_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists(
    select 1 from public.post_attachments a join public.posts p on p.id=a.post_id
    where p.space_id=p_space_id
  ) or exists(select 1 from public.spaces where id=p_space_id and image_url is not null) then
    return false;
  end if;

  delete from public.comment_reactions r using public.comments c join public.posts p on p.id=c.post_id
  where r.comment_id=c.id and p.space_id=p_space_id;
  delete from public.post_reactions r using public.posts p
  where r.post_id=p.id and p.space_id=p_space_id;
  delete from public.notifications where space_id=p_space_id;

  -- comments.parent_id가 on delete restrict라 부모와 자식을 한 DELETE에 함께 담을 수 없다.
  -- 잎부터 벗겨 내려간다. 멘션은 comments/posts에 cascade로 매달려 같이 떨어진다.
  loop
    delete from public.comments c using public.posts p
    where c.post_id=p.id and p.space_id=p_space_id
      and not exists(select 1 from public.comments child where child.parent_id=c.id);
    exit when not found;
  end loop;

  delete from public.posts where space_id=p_space_id;
  delete from public.space_join_requests where space_id=p_space_id;
  delete from public.space_invites where space_id=p_space_id;
  delete from public.space_anonymity_suspensions where space_id=p_space_id;
  delete from public.space_categories where space_id=p_space_id;
  -- trg_validate_space_owner는 deferred라 커밋 시점에 센다. 그때는 spaces 행도 없어서 통과한다.
  delete from public.space_members where space_id=p_space_id;
  delete from public.spaces where id=p_space_id;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_space(p_type public.space_type, p_name text, p_description text DEFAULT NULL::text, p_pub_id text DEFAULT NULL::text, p_join_policy public.space_join_policy DEFAULT 'public'::public.space_join_policy, p_post_policy public.space_post_policy DEFAULT 'all'::public.space_post_policy, p_allow_anonymous_posts boolean DEFAULT true)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true); new_space_id bigint;
begin
  if p_type='group' then perform private.require_app_admin(); end if;
  if p_pub_id is not null and exists(select 1 from public.spaces where pub_id=p_pub_id) then
    raise exception 'pub id already taken';
  end if;

  insert into public.spaces(type,name,description,join_policy,post_policy,allow_anonymous_posts,created_by)
  values(p_type,btrim(p_name),nullif(btrim(coalesce(p_description,'')),''),p_join_policy,p_post_policy,p_allow_anonymous_posts,caller_id)
  returning id into new_space_id;

  insert into public.space_members(space_id,user_id,role) values(new_space_id,caller_id,'owner');
  -- pub_id를 안 넘기면 컬럼 default(랜덤 12자)를 그대로 둔다. coalesce가 그 값을 자기 자신으로
  -- 되쓰므로 슬러그 생성 규칙이 스키마 한 곳에만 산다.
  update public.spaces set pub_id=coalesce(p_pub_id,pub_id), member_count=1 where id=new_space_id;
  return new_space_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finalize_space_image(p_space_id bigint, p_storage_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare expected_prefix text;
begin
  perform private.require_current_profile(true);
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;
  select s.pub_id||'/' into expected_prefix from public.spaces s where s.id=p_space_id and s.deleted_at is null;
  if expected_prefix is null then raise exception 'space not found'; end if;
  if not private.has_uuid_object_suffix(p_storage_path,expected_prefix)
    or not exists(select 1 from storage.objects where bucket_id='space-images' and name=p_storage_path and created_at>=now()-interval '24 hours' and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp'))
    then raise exception 'invalid space image object'; end if;
  update public.spaces set image_url=p_storage_path where id=p_space_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.purge_due_spaces(p_limit integer DEFAULT 20)
 RETURNS TABLE(purged integer, skipped integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_id bigint;
begin
  perform private.require_service_role();
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  purged := 0;
  skipped := 0;
  for target_id in
    select id from public.spaces
    where deleted_at < now() - interval '7 days'
    order by deleted_at, id
    limit p_limit
  loop
    if private.purge_space(target_id) then purged := purged + 1; else skipped := skipped + 1; end if;
  end loop;
  return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_app_admin(p_profile_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_app_admin();
  if exists(select 1 from public.profiles where id=p_profile_id and role='admin' and deleted_at is null) then return; end if;
  update public.profiles set role='admin' where id=p_profile_id and status='accepted' and deleted_at is null;
  if not found then raise exception 'accepted profile required'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_space_join_policy(p_space_id bigint, p_join_policy public.space_join_policy)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare current_policy public.space_join_policy;
begin
  perform private.require_current_profile(true);
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  select join_policy into current_policy from public.spaces
  where id=p_space_id and deleted_at is null
  for update;
  if current_policy is null then raise exception 'space not found'; end if;
  if current_policy=p_join_policy then return; end if;

  if current_policy='request' and exists(select 1 from public.space_join_requests where space_id=p_space_id) then
    raise exception 'resolve pending join requests first';
  end if;

  update public.spaces set join_policy=p_join_policy where id=p_space_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_space(p_space_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_service_role();
  update public.spaces set deleted_at=now() where id=p_space_id and deleted_at is null;
  if not found then raise exception 'space not found'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.unset_app_admin(p_profile_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_app_admin();
  perform pg_advisory_xact_lock(hashtextextended('public.app_admin_set',0));
  if not exists(select 1 from public.profiles where id=p_profile_id and role='admin' and deleted_at is null) then
    raise exception 'app admin not found';
  end if;
  if (select count(*) from public.profiles where role='admin' and deleted_at is null) <= 1 then
    raise exception 'the last app admin cannot be demoted';
  end if;
  update public.profiles set role='user' where id=p_profile_id;
end $function$
;


-- db diff는 GRANT/REVOKE를 뱉지 않는다. 새 함수는 EXECUTE가 PUBLIC(=anon 포함)으로 열린 채
-- 태어나므로 직접 닫는다.
revoke execute on function private.purge_space(bigint) from public, anon, authenticated, service_role;

revoke execute on function public.set_app_admin(bigint), public.unset_app_admin(bigint), public.create_space(public.space_type,text,text,text,public.space_join_policy,public.space_post_policy,boolean), public.set_space_join_policy(bigint,public.space_join_policy), public.finalize_space_image(bigint,text) from public, anon, authenticated, service_role;
grant execute on function public.set_app_admin(bigint), public.unset_app_admin(bigint), public.create_space(public.space_type,text,text,text,public.space_join_policy,public.space_post_policy,boolean), public.set_space_join_policy(bigint,public.space_join_policy), public.finalize_space_image(bigint,text) to authenticated;

revoke execute on function public.soft_delete_space(bigint), public.purge_due_spaces(int4) from public, anon, authenticated, service_role;
grant execute on function public.soft_delete_space(bigint), public.purge_due_spaces(int4) to service_role;
