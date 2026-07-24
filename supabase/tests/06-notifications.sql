-- 알림. supabase/schemas/06-notifications.sql
--
-- 지금은 읽기 RPC의 상한 계약 하나만 찌른다. 이 파일이 없어서 list_notifications의 p_limit 가드가
-- null을 못 막는 채로 있었다 -- `p_limit not between 1 and 50`은 null이면 참이 아니라 null이라
-- 가드를 지나가고, `limit null`은 상한이 없다는 뜻이다.

begin;

do $$
declare
  user1 uuid := '11111111-1111-4111-8111-eeeeeeeeeeee';
  profile1 bigint;
begin
  insert into auth.users (id, email) values (user1, 'noti-check-1@example.com');
  select id into profile1 from public.profiles where auth_user_id = user1;
  update public.profiles set type = 'teacher', status = 'accepted' where id = profile1;
  perform set_config('request.jwt.claim.sub', user1::text, true);

  -- -------------------------------------------------------------------------
  -- 상한은 null도 막아야 한다: `limit null`은 상한이 없다는 뜻이다
  -- -------------------------------------------------------------------------
  -- 막지 않으면 호출 한 번으로 내 알림을 전부 가져간다. 페이지네이션이 있는 읽기 RPC의 공통 계약이다
  -- (03-content의 list_space_posts·list_feed_posts·get_post_comments도 같은 검사를 받는다).
  begin
    perform public.list_notifications(null, null);
    raise exception 'list_notifications must reject a null limit';
  exception when others then
    if sqlerrm not like '%limit must be between 1 and 50%' then raise; end if;
  end;

  -- 정상 상한은 그대로 통과한다(가드가 유효한 호출까지 막아버리는 회귀를 잡는다).
  perform public.list_notifications(null, 20);
end $$;

do $$
declare
  user1 uuid := '11111111-1111-4111-8111-ffffffffffff';
  profile1 bigint;
  space1 bigint;
begin
  insert into auth.users (id, email) values (user1, 'noti-retention-check@example.com');
  select id into profile1 from public.profiles where auth_user_id=user1;
  update public.profiles set type='teacher', status='accepted' where id=profile1;
  insert into public.spaces (type,name) values ('group','notification retention') returning id into space1;
  insert into public.space_members (space_id,user_id,role) values (space1,profile1,'owner');
  insert into public.notifications (recipient_id,type,space_id,read_at,created_at) values
    (profile1,'space_role_changed',space1,null,now()-interval '31 days'),
    (profile1,'space_role_changed',space1,now(),now()-interval '31 days'),
    (profile1,'space_role_changed',space1,now(),now()-interval '29 days'),
    (profile1,'space_role_changed',space1,null,now()-interval '1 hour');

  perform set_config('request.jwt.claim.sub',user1::text,true);
  if public.get_unread_notification_count() <> 1 then
    raise exception 'unread badge must only count notifications from the last 24 hours';
  end if;

  perform set_config('request.jwt.claim.role','service_role',true);
  if public.purge_notifications() <> 2 then
    raise exception 'notification retention purge failed';
  end if;
  if (select count(*) from public.notifications where recipient_id=profile1) <> 2
    or not exists(
      select 1 from public.notifications
      where recipient_id=profile1 and created_at > now()-interval '30 days'
    )
  then
    raise exception 'notifications must be removed by creation time after 30 days';
  end if;
end $$;

rollback;
