-- public.notification_level lives in 00-foundation: 05-chat needs it, and this
-- file is applied after that one.

-- 알림의 종류. 이게 없으면 클라이언트가 어떤 FK가 채워졌는지로 종류를 유추해야 하는데, 그게 불가능
-- 하다: "내 글에 댓글", "내 댓글에 답글", "댓글에서 나를 멘션"은 (space_id, post_id, comment_id)가
-- 전부 채워진 완전히 같은 모양이다. 아이콘도 문구도 목적지도 다른데 구분할 수가 없다.
create type public.notification_type as enum (
  -- 콘텐츠. space_members.notification_setting이 게이트한다('off'면 없음, 'mentions'면 멘션만).
  'post_comment',
  'comment_reply',
  'post_mention',
  'comment_mention',
  -- 채팅. 메시지마다 행을 쌓지 않는다 -- 안 읽음은 chat_read_states에서 파생되고, 행을 쌓으면
  -- 같은 사실을 두 곳에 저장하면서 팬아웃이 터진다. 지속되어야 하는 건 멘션뿐이다.
  -- 아직 message_mentions 테이블이 없어 이 값을 만드는 트리거도 없다(아래 주의 참고). 값을 미리
  -- 두는 이유: enum에 값을 추가하는 마이그레이션은 같은 트랜잭션에서 그 값을 쓸 수 없어서
  -- (check 제약이 리터럴로 참조한다) 나중에 넣으려면 마이그레이션을 둘로 쪼개야 한다.
  'message_mention',
  -- 운영. 끌 수 없다 -- 가입 승인이나 정지 통보를 사용자가 안 받기로 선택할 수 있으면 안 된다.
  'space_join_request',
  'space_join_approved',
  'space_join_rejected',
  'space_invited',
  'space_role_changed',
  'space_anonymity_suspended',
  'post_removed',
  'comment_removed'
);

create table public.notifications (
  id bigserial primary key,
  recipient_id bigint not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  -- 행위자. 모더레이션/행정 알림은 null이다 -- notifications_actor_shape_check 참고.
  actor_id bigint null references public.profiles (id) on delete set null,
  -- 행위자가 익명으로 한 행동인가. true면 list_notifications가 actor를 통째로 지운다.
  -- 원본(posts/comments)에서 매번 읽지 않고 여기 박아 두는 이유: is_anonymous는 작성 후 불변이라
  -- drift가 없고, 원본이 하드 삭제돼도 "가려야 한다"는 판단은 남아 있어야 한다.
  actor_is_anonymous boolean not null default false,
  space_id bigint null references public.spaces (id) on delete cascade,
  post_id bigint null references public.posts (id) on delete cascade,
  comment_id bigint null references public.comments (id) on delete cascade,
  message_id bigint null references public.messages (id) on delete cascade,
  -- FK로 표현되지 않는 소량의 사실만 담는다(바뀐 역할, 정지 만료 시각). 렌더된 문구는 절대 넣지
  -- 않는다: 문구를 박으면 작성자가 개명해도 옛 이름을 계속 실어 나르고, 문구 수정이 데이터
  -- 마이그레이션이 되며, 무엇보다 댓글 미리보기를 캐시하는 순간 삭제된 댓글의 원문이 여기로
  -- 되살아난다 -- comments.content를 nullable로 만들어 막았던 바로 그 유출이다.
  payload jsonb null,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

alter table public.notifications
  -- 내 행동으로 나한테 알림이 오지 않는다.
  add constraint notifications_no_self_notify check (actor_id is null or actor_id <> recipient_id),
  add constraint notifications_anonymous_needs_actor check (not actor_is_anonymous or actor_id is not null),
  -- 종류별 대상 모양을 못 박는다. 트리거가 잘못된 행을 만들면 런타임이 아니라 여기서 걸린다.
  add constraint notifications_target_shape_check check (
    case type
      when 'post_comment'    then space_id is not null and post_id is not null and comment_id is not null and message_id is null
      when 'comment_reply'   then space_id is not null and post_id is not null and comment_id is not null and message_id is null
      when 'comment_mention' then space_id is not null and post_id is not null and comment_id is not null and message_id is null
      when 'comment_removed' then space_id is not null and post_id is not null and comment_id is not null and message_id is null
      when 'post_mention'    then space_id is not null and post_id is not null and comment_id is null and message_id is null
      when 'post_removed'    then space_id is not null and post_id is not null and comment_id is null and message_id is null
      when 'message_mention' then message_id is not null and space_id is null and post_id is null and comment_id is null
      -- 나머지 운영 알림은 전부 공간 단위다.
      else space_id is not null and post_id is null and comment_id is null and message_id is null
    end
  ),
  -- 모더레이션/행정 알림은 행위자를 밝히지 않는다. 스키마는 이미
  -- space_anonymity_suspensions.suspended_by와 posts/comments.deleted_by의 select를 회수해 뒀다
  -- ("누가 걸었는지까지 알면 보복 대상이 된다"). 알림에 actor를 실으면 그 결정이 통째로 무효가 된다.
  -- 가입 승인·거절·역할 변경은 애초에 누가 했는지를 저장하는 컬럼이 없다 -- 없는 걸 흘릴 수도 없다.
  add constraint notifications_actor_shape_check check (
    type not in (
      'space_join_approved','space_join_rejected','space_role_changed',
      'space_anonymity_suspended','post_removed','comment_removed'
    )
    or actor_id is null
  );

-- 알림함은 최신순 keyset. bigserial은 단조 증가라 커서가 id 하나로 끝난다(글은 고정 때문에
-- (created_at, id) 복합 커서가 필요했지만 알림엔 고정이 없다).
create index idx_notifications_recipient on public.notifications (recipient_id, id desc);
create index idx_notifications_unread on public.notifications (recipient_id) where read_at is null;

-- 한 댓글은 한 사람에게 알림을 하나만 만든다. 답글이면서 멘션이면 멘션이 이긴다
-- (notify_on_comment_mention이 종류만 올린다). 이 인덱스가 없으면 댓글 하나로 알림이 두 개 뜬다.
-- comment_removed는 predicate 밖이라 여기 걸리지 않는다 -- 삭제는 별개의 사건이고, 멘션 알림을
-- 삭제 알림으로 덮어쓰면 안 된다.
create unique index uq_notifications_comment_event on public.notifications (recipient_id, comment_id)
where comment_id is not null and type in ('post_comment','comment_reply','comment_mention');

-- 글 멘션은 사람당 글당 한 번. 작성자가 멘션을 지웠다 다시 달아 알림을 재발송하는 걸 막는다.
create unique index uq_notifications_post_mention on public.notifications (recipient_id, post_id)
where type = 'post_mention';

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (private.is_accepted_user() and recipient_id=private.current_profile_id());
create policy notifications_update on public.notifications for update to authenticated using (private.is_accepted_user() and recipient_id=private.current_profile_id()) with check (private.is_accepted_user() and recipient_id=private.current_profile_id());

-- actor_id는 주지 않는다. 익명 댓글의 알림에 actor_id가 실려 있으면 글쓴이가 그걸 그냥 select해서
-- 익명을 깬다 -- posts/comments의 author_id를 회수한 게 알림함을 우회로로 통째로 무효가 된다.
-- 읽기는 list_notifications()로만 간다. 어차피 딥링크(/groups/{space.pub_id}/posts/{post.pub_id})는
-- 내부 bigint만으로는 만들 수가 없어서 직접 select로는 갈 곳을 못 정한다.
-- 여기 여는 컬럼은 두 가지 용도뿐이다: (1) '읽음 표시' UPDATE의 WHERE가 참조하는 컬럼
-- (Postgres는 UPDATE ... WHERE에 쓰인 컬럼에도 SELECT 권한을 요구한다), (2) 나중에 realtime으로
-- 뱃지를 올릴 때 필요한 최소치. insert grant는 없다 -- 알림은 트리거(security definer)만 만든다.
grant select (id, type, read_at, created_at) on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;
grant usage, select on sequence public.notifications_id_seq to service_role;

-- 읽기가 RPC인 이유는 두 가지다(list_space_posts와 같은 구조).
-- 1) 익명. actor_id의 select grant를 회수했으므로 행위자를 붙여줄 수 있는 건 security definer
--    함수뿐이고, 그 함수가 actor_is_anonymous면 actor를 null로 지운다.
-- 2) 딥링크. 라우트는 pub_id로 가는데 테이블엔 내부 bigint뿐이라 직접 select로는 이동할 곳을
--    만들 수가 없다.
-- post_removed/comment_removed는 이미 삭제된 대상을 가리킨다. security definer라 RLS를 지나쳐
-- 제목을 읽을 수 있고, 그래도 되는 이유는 수신자가 곧 그 글의 작성자이기 때문이다(자기가 쓴 제목).
create function public.list_notifications(p_before_id bigint default null, p_limit int4 default 20)
returns table(
  id bigint,
  type public.notification_type,
  actor jsonb,
  actor_is_anonymous boolean,
  space jsonb,
  post jsonb,
  comment jsonb,
  conversation jsonb,
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
    case when cv.id is null then null
         else jsonb_build_object('id',cv.id,'name',cv.name) end,
    n.payload,
    n.read_at,
    n.created_at
  from public.notifications n
  left join public.profiles a on a.id=n.actor_id
  left join public.spaces s on s.id=n.space_id
  left join public.posts p on p.id=n.post_id
  left join public.comments c on c.id=n.comment_id
  left join public.messages m on m.id=n.message_id
  left join public.conversations cv on cv.id=m.conversation_id
  where n.recipient_id=caller_id
    and (p_before_id is null or n.id < p_before_id)
  order by n.id desc
  limit p_limit;
end;
$$;

-- 내비 뱃지용. 뱃지는 99+ 위를 구분하지 않으므로 100에서 세기를 멈춘다(get_unread_message_count와
-- 같은 계약). 채팅 쪽에서 cross join lateral이 필요했던 이유 -- LIMIT이 해시 조인 위에 있으면
-- 해시를 다 만든 뒤에야 잘라서 상한이 소용없다 -- 는 여기 없다. 조인이 없어서 LIMIT이
-- idx_notifications_unread 스캔 바로 위에 앉는다.
create function public.get_unread_notification_count()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id bigint := private.require_current_profile(true);
  result bigint;
begin
  select count(*)::bigint into result
  from (
    select 1 from public.notifications n
    where n.recipient_id=caller_id and n.read_at is null
    limit 100
  ) capped;
  return result;
end;
$$;

revoke execute on function public.list_notifications(bigint,int4), public.get_unread_notification_count() from public, anon, authenticated, service_role;
grant execute on function public.list_notifications(bigint,int4), public.get_unread_notification_count() to authenticated;

-- 알림을 만드는 건 전부 트리거다. RPC가 아닌 이유: comments/post_mentions/comment_mentions에는
-- insert 컬럼 grant가 있어 클라이언트가 테이블에 직접 쓴다. 생성을 RPC에만 걸면 테이블로 바로
-- 질러서 알림 없이 댓글을 다는 우회가 가능하다(trg_enforce_anonymous_allowed가 RPC가 아니라
-- 트리거인 것과 같은 이유). 트리거는 security definer라 authenticated에 insert grant를 주지 않고도
-- notifications에 쓴다.

-- 내 글에 달린 댓글 / 내 댓글에 달린 답글.
create function private.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_space_id bigint;
  post_author_id bigint;
  parent_author_id bigint;
begin
  select p.space_id, p.author_id into target_space_id, post_author_id
  from public.posts p where p.id=new.post_id and p.deleted_at is null;
  if target_space_id is null then return null; end if;

  if new.parent_id is not null then
    select c.author_id into parent_author_id
    from public.comments c where c.id=new.parent_id and c.deleted_at is null;
  end if;

  insert into public.notifications(recipient_id,type,actor_id,actor_is_anonymous,space_id,post_id,comment_id)
  select distinct on (r.recipient_id)
    r.recipient_id, r.type, new.author_id, new.is_anonymous, target_space_id, new.post_id, new.id
  from (
    -- 답글이 글 댓글보다 구체적이라 이긴다. 내 글에 달린 내 댓글에 답글이 달리면 알림은 하나다.
    select parent_author_id as recipient_id, 'comment_reply'::public.notification_type as type, 1 as priority
    union all
    select post_author_id, 'post_comment'::public.notification_type, 2
  ) r
  join public.space_members sm
    on sm.space_id=target_space_id and sm.user_id=r.recipient_id and sm.banned_at is null
  where r.recipient_id is not null
    and r.recipient_id <> new.author_id
    -- 'off'는 껐다는 뜻이고 'mentions'는 멘션만 받겠다는 뜻이다. 댓글은 'all'만 받는다.
    and sm.notification_setting='all'
  order by r.recipient_id, r.priority
  on conflict do nothing;

  return null;
end;
$$;

-- 글 멘션. 우선순위 문제가 없다 -- 새 글 자체는 알림을 만들지 않으므로 덮어쓸 행이 없다.
create function private.notify_on_post_mention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications(recipient_id,type,actor_id,actor_is_anonymous,space_id,post_id)
  select new.user_id,'post_mention',p.author_id,p.is_anonymous,p.space_id,p.id
  from public.posts p
  join public.space_members sm
    on sm.space_id=p.space_id and sm.user_id=new.user_id and sm.banned_at is null
  where p.id=new.post_id
    and p.deleted_at is null
    and p.author_id<>new.user_id
    and sm.notification_setting in ('mentions','all')
  -- uq_notifications_post_mention: 사람당 글당 한 번.
  on conflict do nothing;
  return null;
end;
$$;

-- 댓글 멘션. 댓글 insert가 먼저 돌아 이미 post_comment/comment_reply 알림을 만들어 뒀을 수 있다
-- (comment_mentions는 comments를 FK로 참조하므로 순서가 보장된다). 그 행의 종류만 멘션으로 올린다.
-- read_at은 건드리지 않는다: 작성자가 멘션을 지웠다 다시 달아 알림을 재발송하는 걸 막는다.
create function private.notify_on_comment_mention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications(recipient_id,type,actor_id,actor_is_anonymous,space_id,post_id,comment_id)
  select new.user_id,'comment_mention',c.author_id,c.is_anonymous,p.space_id,c.post_id,c.id
  from public.comments c
  join public.posts p on p.id=c.post_id and p.deleted_at is null
  join public.space_members sm
    on sm.space_id=p.space_id and sm.user_id=new.user_id and sm.banned_at is null
  where c.id=new.comment_id
    and c.deleted_at is null
    and c.author_id<>new.user_id
    and sm.notification_setting in ('mentions','all')
  on conflict (recipient_id, comment_id)
    where comment_id is not null and type in ('post_comment','comment_reply','comment_mention')
  do update set type='comment_mention';
  return null;
end;
$$;

-- 관리자가 남의 글/댓글을 지웠을 때만. 본인이 지운 건 알릴 게 없다(soft_delete_*가 deleted_by를
-- 호출자로 스탬프하고, 작성자 아니면 매니저만 지울 수 있다).
-- actor는 싣지 않는다 -- posts/comments.deleted_by는 select grant에서 이미 빠져 있다.
create function private.notify_on_post_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_by is null or new.deleted_by=new.author_id then return null; end if;
  insert into public.notifications(recipient_id,type,space_id,post_id)
  values (new.author_id,'post_removed',new.space_id,new.id);
  return null;
end;
$$;

create function private.notify_on_comment_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_space_id bigint;
begin
  if new.deleted_by is null or new.deleted_by=new.author_id then return null; end if;
  select p.space_id into target_space_id from public.posts p where p.id=new.post_id;
  if target_space_id is null then return null; end if;
  insert into public.notifications(recipient_id,type,space_id,post_id,comment_id)
  values (new.author_id,'comment_removed',target_space_id,new.post_id,new.id);
  return null;
end;
$$;

-- 가입 요청이 도착했다(매니저에게). 운영 알림이라 notification_setting을 보지 않는다.
create function private.notify_on_join_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications(recipient_id,type,actor_id,space_id)
  select sm.user_id,'space_join_request',new.user_id,new.space_id
  from public.space_members sm
  where sm.space_id=new.space_id
    and sm.role in ('owner','admin')
    and sm.banned_at is null
    and sm.user_id<>new.user_id;
  return null;
end;
$$;

-- 승인도 거절도 space_join_requests의 DELETE다(approve_join_request가 요청을 지우고 멤버로 올린다.
-- 거절·본인 취소는 정책이 허용하는 직접 delete다). 그래서 세 경우를 구분해야 한다.
--
-- 왜 constraint trigger + deferred인가: approve_join_request는 DELETE 다음 줄에서 space_members를
-- INSERT한다. 보통의 AFTER ROW 트리거는 DELETE 문이 끝나면 바로 돌아서 그 시점엔 멤버십이 아직
-- 없고, 그래서 승인을 거절로 오인한다. 커밋까지 미루면 트랜잭션의 최종 상태를 본다.
-- (같은 파일의 trg_validate_space_owner가 같은 이유로 deferred다.)
create function private.notify_on_join_request_resolved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 본인이 취소한 요청은 알릴 게 없다. security definer여도 auth.uid()는 호출자 그대로다.
  if old.user_id=private.current_profile_id() then return null; end if;
  -- 공간이 통째로 사라졌으면(하드 삭제) 보낼 곳이 없다.
  if not exists(select 1 from public.spaces where id=old.space_id) then return null; end if;

  insert into public.notifications(recipient_id,type,space_id)
  values (
    old.user_id,
    case when exists(
      select 1 from public.space_members sm
      where sm.space_id=old.space_id and sm.user_id=old.user_id and sm.banned_at is null
    ) then 'space_join_approved'::public.notification_type
    else 'space_join_rejected'::public.notification_type end,
    old.space_id
  );
  return null;
end;
$$;

-- 대상 지정 초대만 알린다. 공유 링크(target_user_id is null)는 받는 사람이 정해져 있지 않다.
create function private.notify_on_space_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_user_id is null or new.created_by is null then return null; end if;
  if new.created_by=new.target_user_id then return null; end if;
  insert into public.notifications(recipient_id,type,actor_id,space_id)
  values (new.target_user_id,'space_invited',new.created_by,new.space_id);
  return null;
end;
$$;

-- 역할을 바꾸는 경로는 아직 없다(space_members_update 정책은 본인 행의 notification_setting/
-- pinned_at만 연다. 매니저용 RPC가 아직 없다). 트리거를 먼저 두는 이유는 그 경로가 생기는 날
-- 알림이 자동으로 따라오게 하려는 것 -- 그때 이 파일을 다시 열 필요가 없다.
create function private.notify_on_role_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications(recipient_id,type,space_id,payload)
  values (new.user_id,'space_role_changed',new.space_id,
          jsonb_build_object('from',old.role,'to',new.role));
  return null;
end;
$$;

-- 익명 정지 통보. actor는 싣지 않는다 -- space_anonymity_suspensions.suspended_by의 select를 이미
-- 회수해 뒀고("누가 걸었는지까지 알면 보복 대상이 된다"), 알림에 실으면 그 결정이 무효가 된다.
-- 해제(undo_anonymity_suspension)는 suspended_until을 과거로 되돌리므로 WHEN 절이 걸러낸다.
-- 이미 정지 중인 사람에게 또 걸면 suspend_anonymity가 아무것도 UPDATE하지 않아 여기도 안 돈다.
create function private.notify_on_anonymity_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications(recipient_id,type,space_id,payload)
  values (new.user_id,'space_anonymity_suspended',new.space_id,
          jsonb_build_object('suspended_until',new.suspended_until));
  return null;
end;
$$;

create trigger trg_notify_on_comment
after insert on public.comments
for each row execute function private.notify_on_comment();

create trigger trg_notify_on_post_mention
after insert on public.post_mentions
for each row execute function private.notify_on_post_mention();

create trigger trg_notify_on_comment_mention
after insert on public.comment_mentions
for each row execute function private.notify_on_comment_mention();

create trigger trg_notify_on_post_removed
after update of deleted_at on public.posts
for each row when (old.deleted_at is null and new.deleted_at is not null)
execute function private.notify_on_post_removed();

create trigger trg_notify_on_comment_removed
after update of deleted_at on public.comments
for each row when (old.deleted_at is null and new.deleted_at is not null)
execute function private.notify_on_comment_removed();

create trigger trg_notify_on_join_request
after insert on public.space_join_requests
for each row execute function private.notify_on_join_request();

create constraint trigger trg_notify_on_join_request_resolved
after delete on public.space_join_requests
deferrable initially deferred
for each row execute function private.notify_on_join_request_resolved();

create trigger trg_notify_on_space_invite
after insert on public.space_invites
for each row execute function private.notify_on_space_invite();

create trigger trg_notify_on_role_changed
after update of role on public.space_members
for each row when (old.role is distinct from new.role)
execute function private.notify_on_role_changed();

create trigger trg_notify_on_anonymity_suspended
after insert or update of suspended_until on public.space_anonymity_suspensions
for each row when (new.suspended_until > now())
execute function private.notify_on_anonymity_suspended();

revoke execute on function
  private.notify_on_comment(), private.notify_on_post_mention(), private.notify_on_comment_mention(),
  private.notify_on_post_removed(), private.notify_on_comment_removed(),
  private.notify_on_join_request(), private.notify_on_join_request_resolved(),
  private.notify_on_space_invite(), private.notify_on_role_changed(),
  private.notify_on_anonymity_suspended()
from public, anon, authenticated, service_role;
