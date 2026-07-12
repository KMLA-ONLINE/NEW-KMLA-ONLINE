-- 알림함에서 채팅으로 가는 결합을 끊는다.
--
-- notifications는 'message_mention' enum 값과 messages를 향한 FK(message_id)를 들고 있었지만
-- **그 값을 만드는 트리거가 한 번도 없었다.** 항상 null인 컬럼, 도달 불가능한 check 분기,
-- list_notifications의 죽은 조인 두 개, 그리고 그것을 모델링하는 프론트 타입이 대가였다.
--
-- 이제는 만들 수도 없다: 1:1 대화는 종단간 암호화되어 서버가 본문을 못 읽으므로 멘션을 탐지할
-- 방법이 없고(docs/e2ee.md), 애초에 1:1에는 멘션할 제3자가 없다. 그룹 대화의 멘션이 필요해지면
-- 알림함이 아니라 채팅 자신의 푸시로 가야 한다 -- 채팅은 이미 자기 체계를 갖고 있다
-- (chat_read_states 커서 / get_unread_message_count 뱃지 / chat_notification_settings 음소거).
-- 같은 사실을 두 곳에 쌓으면 메시지를 읽어도 알림함의 그 줄은 안 읽음으로 남는다.
--
-- Postgres에는 ALTER TYPE ... DROP VALUE가 없다. 그래서 타입을 통째로 갈아끼우고, 그 전에
-- enum 리터럴을 참조하는 것들(함수 시그니처, check 제약, 부분 유니크 인덱스)을 먼저 내린다.

-- 1) enum을 반환 타입에 쓰는 함수. drop이 grant도 같이 가져가므로 아래에서 다시 준다.
drop function if exists public.list_notifications(bigint, int4);

-- 2) WHERE 절이 enum 리터럴을 참조하는 부분 인덱스.
drop index if exists public.uq_notifications_comment_event;
drop index if exists public.uq_notifications_post_mention;

-- 3) enum 리터럴을 참조하는 check 제약.
alter table public.notifications drop constraint notifications_target_shape_check;
alter table public.notifications drop constraint notifications_actor_shape_check;

-- 4) 타입 교체.
alter type public.notification_type rename to notification_type__old;

create type public.notification_type as enum (
  'post_comment',
  'comment_reply',
  'post_mention',
  'comment_mention',
  'space_join_request',
  'space_join_approved',
  'space_join_rejected',
  'space_invited',
  'space_role_changed',
  'space_anonymity_suspended',
  'post_removed',
  'comment_removed'
);

alter table public.notifications
  alter column "type" type public.notification_type
  using "type"::text::public.notification_type;

drop type public.notification_type__old;

-- 5) messages를 향한 FK. 이 컬럼에 값이 들어간 적은 한 번도 없다.
alter table public.notifications drop column message_id;

-- 6) 인덱스·제약 복구 (message_id 절만 빠졌다).
create unique index uq_notifications_comment_event on public.notifications (recipient_id, comment_id)
where comment_id is not null and type in ('post_comment', 'comment_reply', 'comment_mention');

create unique index uq_notifications_post_mention on public.notifications (recipient_id, post_id)
where type = 'post_mention';

alter table public.notifications
  add constraint notifications_target_shape_check check (
    case type
      when 'post_comment'    then space_id is not null and post_id is not null and comment_id is not null
      when 'comment_reply'   then space_id is not null and post_id is not null and comment_id is not null
      when 'comment_mention' then space_id is not null and post_id is not null and comment_id is not null
      when 'comment_removed' then space_id is not null and post_id is not null and comment_id is not null
      when 'post_mention'    then space_id is not null and post_id is not null and comment_id is null
      when 'post_removed'    then space_id is not null and post_id is not null and comment_id is null
      else space_id is not null and post_id is null and comment_id is null
    end
  ),
  add constraint notifications_actor_shape_check check (
    type not in (
      'space_join_approved','space_join_rejected','space_role_changed',
      'space_anonymity_suspended','post_removed','comment_removed'
    )
    or actor_id is null
  );

-- 7) list_notifications 복구. messages/conversations 조인과 conversation 반환 컬럼이 빠졌다.
create or replace function public.list_notifications(p_before_id bigint default null, p_limit int4 default 20)
returns table(
  id bigint,
  type public.notification_type,
  actor jsonb,
  actor_is_anonymous boolean,
  space jsonb,
  post jsonb,
  comment jsonb,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id bigint := private.require_current_profile(true);
begin
  if p_limit not between 1 and 50 then raise exception 'limit must be between 1 and 50'; end if;

  return query
  select
    n.id,
    n.type,
    case when n.actor_is_anonymous or a.id is null then null
         else jsonb_build_object('id',a.id,'name',a.name,'avatar_url',a.avatar_url) end,
    n.actor_is_anonymous,
    case when s.id is null then null
         else jsonb_build_object('pub_id',s.pub_id,'name',s.name,'type',s.type) end,
    case when p.id is null then null
         else jsonb_build_object('pub_id',p.pub_id,'title',p.title) end,
    -- 삭제된 댓글은 soft_delete_comment가 content를 이미 비웠다. 알림이 원문을 되살리지 않는다.
    case when c.id is null then null
         else jsonb_build_object('id',c.id,'content',c.content,'is_deleted',c.deleted_at is not null) end,
    n.payload,
    n.read_at,
    n.created_at
  from public.notifications n
  left join public.profiles a on a.id=n.actor_id
  left join public.spaces s on s.id=n.space_id
  left join public.posts p on p.id=n.post_id
  left join public.comments c on c.id=n.comment_id
  where n.recipient_id=caller_id
    and (p_before_id is null or n.id < p_before_id)
  order by n.id desc
  limit p_limit;
end;
$$;

-- drop이 grant를 가져갔고, ACL이 빈 함수는 암묵적으로 EXECUTE TO PUBLIC이라 회수까지 해야 한다.
-- (tests/00-privileges.sql이 둘 다 잡는다.)
revoke execute on function public.list_notifications(bigint, int4) from public, anon, service_role;
grant execute on function public.list_notifications(bigint, int4) to authenticated;
