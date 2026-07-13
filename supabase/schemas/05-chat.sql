create type public.conversation_type as enum ('direct', 'group');

create table public.conversations (
  id bigserial primary key,
  type public.conversation_type not null,
  name text null,
  created_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Membership + one-per-pair uniqueness for direct conversations (peers are not stored in conversation_members).
create table public.direct_conversations (
  conversation_id bigint primary key references public.conversations (id) on delete restrict,
  user1_id bigint not null references public.profiles (id) on delete restrict,
  user2_id bigint not null references public.profiles (id) on delete restrict
);

-- Membership for group conversations only.
create table public.conversation_members (
  conversation_id bigint not null references public.conversations (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- 본문이 두 컬럼인 이유: 1:1 대화만 종단간 암호화되어 있고 그룹 대화는 평문 + RLS다
-- (docs/e2ee.md). 어느 쪽인지는 대화 타입이 정하며, CHECK로는 다른 테이블을 볼 수 없어
-- private.enforce_message_encryption_shape() 트리거가 강제한다.
--
-- content_ciphertext는 nonce(12) || AES-256-GCM이다. 서버는 이걸 열 수 없고, 그래서
-- 이 컬럼 위에서는 검색도, 미리보기 생성도, 길이 말고는 어떤 검증도 할 수 없다.
create table public.messages (
  id bigserial primary key,
  conversation_id bigint not null references public.conversations (id) on delete restrict,
  sender_id bigint not null references public.profiles (id) on delete restrict,
  parent_id bigint null references public.messages (id) on delete restrict,
  content text null,
  content_ciphertext bytea null,
  -- 검색 전용 정규화 형태(private.normalize_search). 그룹 평문 전용이다: 암호화 메시지는 content가
  -- null이라 이것도 null이 되어 인덱스에도 안 들어가고 서버는 여전히 본문을 못 본다. posts의 정규화
  -- 컬럼과 같은 함수를 쓰므로 게시글 검색과 채팅 검색이 같은 문자열을 같게 취급한다.
  content_normalized text generated always as (private.normalize_search(content)) stored,
  edited_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by bigint null references public.profiles (id) on delete set null,
  pinned_at timestamptz null,
  pinned_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- 메시지 키 봉투. 발신자가 수신자 한 명당 한 행씩 만든다.
--
-- 발신자 사본이 없는 이유: X25519 DH는 대칭이라(DH(a_비밀, b_공개) == DH(b_비밀, a_공개))
-- 수신자 앞으로 봉인된 이 행을 발신자도 그대로 연다. 1:1 대화면 메시지당 정확히 한 행이다.
--
-- 봉인 당시의 두 공개키를 같이 적어두는 것이 키 회전을 공짜로 만든다. 누가 복구 코드 없이
-- 비밀번호를 재설정하면 신원키가 갈리고, 옛 키 앞으로 봉인된 행은 열리지 않는다 -- 그리고
-- 열리지 않는다고 스스로 말한다. 그 사람의 공개키가 행에 적힌 것과 다르기 때문이다.
-- 새 메시지는 새 키로 봉인되어 그냥 동작한다. epoch도, 재키잉 핸드셰이크도, 두 클라이언트
-- 사이의 어떤 조율도 없다.
create table public.message_keys (
  message_id bigint not null references public.messages (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  wrapped_key bytea not null,
  sender_public_key bytea not null,
  recipient_public_key bytea not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- Which MIME types a message accepts, and how large each may be. The kind of each
-- one is universal and lives in public.mime_types.
--
-- message_attachments has a foreign key onto this table, so a type a message does
-- not accept cannot be stored at all, and the message-files bucket's
-- allowed_mime_types array is generated from these rows. Rows are seed data, so
-- they live in a migration.
create table public.message_attachment_mime_types (
  content_type text primary key references public.mime_types (content_type) on update cascade on delete restrict,
  max_bytes int8 not null,
  created_at timestamptz not null default now()
);

-- file_name이 두 컬럼인 이유: 파일명은 사실상 내용이다. "성적표.pdf"를 평문으로 남겨두면
-- 파일 본문만 암호화한 것이 반쪽이 된다. 암호화된 대화의 첨부는 이름도 메시지 키로 봉인해서
-- 온다.
--
-- 나머지 메타데이터(content_type, size_bytes, width/height/duration)는 서버가 본다.
-- content_type은 화이트리스트 FK와 클라이언트의 렌더러 선택에 필요해서 어쩔 수 없고,
-- 크기·해상도는 유출되는 값이 작다. docs/e2ee.md에 "서버가 여전히 아는 것"으로 적어둔다.
create table public.message_attachments (
  id bigserial primary key,
  message_id bigint not null references public.messages (id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  file_name text null,
  file_name_ciphertext bytea null,
  content_type text not null references public.message_attachment_mime_types (content_type) on update cascade on delete restrict,
  size_bytes int8 null,
  sort_order int4 not null default 0,
  width int4 null,
  height int4 null,
  duration_ms int4 null,
  created_at timestamptz not null default now()
);

create table public.message_reactions (
  message_id bigint not null references public.messages (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  primary key (message_id, user_id)
);

create table public.chat_read_states (
  conversation_id bigint not null references public.conversations (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  last_read_message_id bigint null references public.messages (id) on delete restrict,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- Muting is a user's preference about a conversation, not a property of it, and
-- not a boolean either: `muted_until` carries "for 8 hours" and "until I say
-- otherwise" ('infinity') in one column. `level` is orthogonal -- a loud group
-- chat can stay unmuted while only notifying on a mention.
--
-- Its own table rather than a column on chat_read_states, whose insert policy
-- demands a last_read_message_id: you must be able to mute a conversation you
-- have never opened. And not on conversation_members, which direct conversations
-- have no rows in.
create table public.chat_notification_settings (
  conversation_id bigint not null references public.conversations (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  muted_until timestamptz null,
  level public.notification_level not null default 'all',
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  primary key (conversation_id, user_id)
);

create index idx_direct_conversations_user1 on public.direct_conversations (user1_id);
create index idx_direct_conversations_user2 on public.direct_conversations (user2_id);
create index idx_conversation_members_user on public.conversation_members (user_id, conversation_id);
create index idx_messages_sender_created_at on public.messages (sender_id, created_at);
create index idx_messages_parent_created_at on public.messages (parent_id, created_at);
create index idx_messages_active_conversation_id on public.messages (conversation_id, id desc)
where deleted_at is null;
create index idx_messages_pinned on public.messages (conversation_id, pinned_at desc)
where pinned_at is not null and deleted_at is null;
create index idx_message_reactions_type_count on public.message_reactions (message_id, reaction_type_id);
create index idx_message_reactions_user_created_at on public.message_reactions (user_id, created_at);
create index idx_chat_read_states_user_last_read_at on public.chat_read_states (user_id, last_read_at);
create index idx_chat_notification_settings_user on public.chat_notification_settings (user_id, conversation_id);
create index idx_messages_content_search_gin on public.messages
  using gin (content_normalized extensions.gin_trgm_ops)
  where deleted_at is null;

alter table public.conversations
  add constraint conversations_shape_check check (
    (type = 'group' and name is not null and char_length(btrim(name)) between 1 and 100)
    or (type = 'direct' and name is null)
  );

alter table public.direct_conversations
  add constraint direct_conversations_users_check check (user1_id < user2_id),
  add constraint direct_conversations_users_key unique (user1_id, user2_id);

alter table public.messages
  add constraint messages_parent_check check (parent_id is null or parent_id <> id),
  add constraint messages_content_check check (content is null or char_length(btrim(content)) between 1 and 10000),
  -- 평문 상한 10000자를 UTF-8 최악(4바이트) + nonce + 태그로 잡은 천장. 서버는 암호문을
  -- 열 수 없으니 길이 말고는 아무것도 검사할 수 없다 -- 그래서 이 CHECK 하나가 서버가
  -- 이 컬럼에 대해 할 수 있는 검증의 전부다.
  add constraint messages_content_ciphertext_check check (
    content_ciphertext is null or octet_length(content_ciphertext) between 29 and 40060
  ),
  -- 평문과 암호문이 동시에 있는 메시지는 없다. 어느 쪽이어야 하는지는 대화 타입이 정하고
  -- private.enforce_message_encryption_shape()가 강제한다. 여기서는 둘 다인 경우만 막는다.
  add constraint messages_body_exclusive_check check (content is null or content_ciphertext is null),
  add constraint messages_deleted_state_check check (deleted_at is not null or deleted_by is null),
  add constraint messages_deleted_body_check check (deleted_at is null or (content is null and content_ciphertext is null)),
  add constraint messages_pinned_state_check check (pinned_at is not null or pinned_by is null);

alter table public.message_keys
  add constraint message_keys_wrapped_key_check check (octet_length(wrapped_key) between 48 and 128),
  add constraint message_keys_sender_public_key_check check (octet_length(sender_public_key) = 32),
  add constraint message_keys_recipient_public_key_check check (octet_length(recipient_public_key) = 32);

alter table public.message_attachment_mime_types
  add constraint message_attachment_mime_types_content_type_check check (char_length(btrim(content_type)) between 1 and 255),
  add constraint message_attachment_mime_types_max_bytes_check check (max_bytes > 0);

alter table public.message_attachments
  add constraint message_attachments_message_sort_key unique (message_id, sort_order),
  add constraint message_attachments_storage_key unique (storage_bucket, storage_path),
  add constraint message_attachments_bucket_check check (storage_bucket in ('message-files', 'message-files-encrypted')),
  add constraint message_attachments_storage_path_check check (
    char_length(storage_path) between 1 and 1024
    and storage_path !~ '(^|/)\.\.?(/|$)'
  ),
  add constraint message_attachments_file_name_check check (file_name is null or char_length(btrim(file_name)) between 1 and 255),
  -- 이름은 평문이거나 암호문이거나 둘 중 하나이고, 어느 쪽인지는 버킷이 정한다. 버킷이
  -- 대화 타입과 맞는지는 trg_enforce_message_attachment_shape가 본다 -- 그래서 이 두 개가
  -- 맞물리면 "암호화된 대화의 첨부는 이름도 암호화되어 있다"가 스키마로 강제된다.
  add constraint message_attachments_name_shape_check check (
    case when storage_bucket = 'message-files-encrypted'
      then file_name is null and file_name_ciphertext is not null
      else file_name is not null and file_name_ciphertext is null
    end
  ),
  add constraint message_attachments_file_name_ciphertext_check check (
    file_name_ciphertext is null or octet_length(file_name_ciphertext) between 29 and 1052
  ),
  add constraint message_attachments_content_type_check check (char_length(btrim(content_type)) between 1 and 255),
  add constraint message_attachments_size_check check (size_bytes is null or size_bytes >= 0),
  add constraint message_attachments_sort_order_check check (sort_order >= 0),
  add constraint message_attachments_duration_check check (duration_ms is null or duration_ms >= 0);

create function private.is_conversation_member(p_conversation_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_accepted_user() and (
    exists(
      select 1 from public.direct_conversations dc
      where dc.conversation_id=p_conversation_id
        and private.current_profile_id() in (dc.user1_id, dc.user2_id)
    )
    or exists(
      select 1 from public.conversation_members cm
      where cm.conversation_id=p_conversation_id and cm.user_id=private.current_profile_id()
    )
  )
$$;
create function private.can_access_message(p_message_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.messages m
    where m.id=p_message_id
      and m.deleted_at is null
      and private.is_conversation_member(m.conversation_id)
  )
$$;
-- A reply quotes exactly one message; it does not open a thread. So a reply may
-- itself be quoted, to any depth: C shows B, B shows A, and following the
-- previews walks the chain back. Nothing renders more than one level at a time,
-- so nothing needs the depth bounded.
create function private.is_valid_message_parent(p_parent_id bigint,p_conversation_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_parent_id is null or exists(
    select 1 from public.messages m
    where m.id=p_parent_id
      and m.deleted_at is null
      and m.conversation_id=p_conversation_id
  )
$$;
create function private.has_active_message_reply(p_message_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.messages where parent_id=p_message_id and deleted_at is null)
$$;
-- Which MIME types are allowed is answered by message_attachment_mime_types and
-- enforced by message_attachments' foreign key onto it. Only the ceiling on how
-- many attachments one message may carry needs a home of its own.
create function private.max_message_attachments()
returns int4 language sql immutable set search_path = '' as $$ select 10 $$;
-- 종단간 암호화의 경계. 1:1이면 암호문, 그룹이면 평문 -- RLS 정책과 트리거가 둘 다 이걸
-- 물어본다. 정책 표현식은 호출자 권한으로 실행되므로 authenticated에게 execute가 필요하다.
create function private.is_direct_conversation(p_conversation_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.conversations c where c.id=p_conversation_id and c.type='direct')
$$;
-- 이 메시지의 봉투를 호출자 관점에서 하나 고른다.
--
-- 규칙: 호출자 앞으로 봉인된 행이 있으면 그것. 없고 호출자가 발신자면 아무 행이나 -- DH가
-- 대칭이라 발신자는 자기가 만든 어떤 봉투든 열 수 있고, 그래서 자기 사본을 저장하지 않는다.
--
-- 함수로 뽑은 이유: 이 규칙이 list_conversations / get_chat_messages(본문 + 답장 원본) /
-- get_encrypted_message_bodies 네 곳에서 필요한데, 복붙해 두면 규칙을 바꿀 때 한 곳을 놓쳐도
-- 아무도 모른다 -- 예컨대 대화 목록의 미리보기만 옛 규칙으로 남아 조용히 안 열린다.
create function private.message_envelope(p_message_id bigint, p_sender_id bigint, p_caller_id bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'wrapped_key', encode(mk.wrapped_key,'base64'),
    'sender_public_key', encode(mk.sender_public_key,'base64'),
    'recipient_public_key', encode(mk.recipient_public_key,'base64')
  )
  from public.message_keys mk
  where mk.message_id=p_message_id
    and (mk.user_id=p_caller_id or p_sender_id=p_caller_id)
  order by (mk.user_id=p_caller_id) desc, mk.user_id
  limit 1
$$;
revoke execute on function private.message_envelope(bigint,bigint,bigint) from public, anon, authenticated, service_role;
revoke execute on function private.is_conversation_member(bigint), private.can_access_message(bigint), private.is_valid_message_parent(bigint,bigint), private.has_active_message_reply(bigint), private.max_message_attachments(), private.is_direct_conversation(bigint) from public, anon, service_role;
grant execute on function private.is_conversation_member(bigint), private.can_access_message(bigint), private.is_valid_message_parent(bigint,bigint), private.has_active_message_reply(bigint), private.is_direct_conversation(bigint) to authenticated;

create function private.validate_message_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_valid_message_parent(new.parent_id,new.conversation_id) then
    raise exception 'message parent must be an active top-level message in the same chat';
  end if;
  return new;
end;
$$;

create trigger trg_validate_message_parent
before insert or update of conversation_id, parent_id on public.messages
for each row execute function private.validate_message_parent();

-- 대화 타입이 본문의 형태를 정한다. CHECK로는 다른 테이블을 볼 수 없어서 트리거로 온다.
-- 정책이 아니라 테이블에 거는 이유는 enforce_message_attachment_shape와 같다:
-- service_role의 쓰기는 RPC를 지나지 않는다.
--
-- 1:1에서 암호문이 null인 것은 허용한다 -- 첨부만 있는 메시지에는 본문이 없다. "본문이든
-- 첨부든 하나는 있어야 한다"는 send RPC가 본다.
create function private.enforce_message_encryption_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_direct_conversation(new.conversation_id) then
    if new.content is not null then
      raise exception 'direct conversations are end-to-end encrypted: send content_ciphertext, not content';
    end if;
  elsif new.content_ciphertext is not null then
    raise exception 'group conversations are not encrypted: send content, not content_ciphertext';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_message_encryption_shape
before insert or update of conversation_id, content, content_ciphertext on public.messages
for each row execute function private.enforce_message_encryption_shape();

create function private.mark_message_edited()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare body_changed boolean;
begin
  if new.content is not null then
    new.content := nullif(btrim(new.content), '');
  end if;

  body_changed := new.content is distinct from old.content
    or new.content_ciphertext is distinct from old.content_ciphertext;

  -- 삭제는 편집이 아니다. soft_delete_message()도 본문을 비우는 UPDATE라서, 이 구분이
  -- 없으면 아래 편집 시간창이 그걸 붙잡아 15분 지난 자기 메시지를 지울 수 없게 만든다.
  -- (deleted_at에는 authenticated 컬럼 grant가 없다 -- security definer RPC와
  --  service_role만 세울 수 있고, 그 RPC가 발신자 본인인지 이미 확인한다.)
  if new.deleted_at is not null and old.deleted_at is null then
    return new;
  end if;

  -- 편집으로 본문을 비우는 것은 삭제를 가장한 우회다. messages_pin_update가 아무 멤버에게나 active
  -- row UPDATE를 열어주는데 그 정책엔 content is not null 조건이 없어(messages_update에는 있다),
  -- 발신자가 15분 내에 {"content": null}이나 공백만(위 nullif로 null이 된다)으로 PATCH하면
  -- deleted_at 없이 본문만 사라진 좀비 메시지가 된다 -- soft_delete_message를 거치지 않아 첨부·반응·
  -- 봉투 정리도 건너뛴다. 삭제(deleted_at 설정)는 위에서 이미 빠졌으니, 여기 오면 본문은 반드시 남아야 한다.
  if new.content is null and new.content_ciphertext is null then
    raise exception 'a message body cannot be emptied by an edit; delete it instead';
  end if;

  -- messages_pin_update lets any conversation member update an active
  -- message row (for pinning), which as a side effect widens row-level
  -- visibility for this UPDATE command as a whole. Column grants alone
  -- can't re-narrow that back down, so content edits are only actually
  -- authorized here: sender, within the edit window.
  if body_changed
    and (old.sender_id <> private.current_profile_id() or old.created_at < now() - interval '15 minutes')
  then
    raise exception 'not allowed to edit this message';
  end if;

  if old.deleted_at is null and new.deleted_at is null and body_changed then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_mark_message_edited
before update of content, content_ciphertext on public.messages
for each row execute function private.mark_message_edited();

-- pinned_by is trigger-derived rather than client-writable, so pinning
-- can't be spoofed as someone else and unpinning always clears it.
--
-- 값이 실제로 바뀔 때만 손댄다. `update of pinned_at` 트리거는 SET 목록에 컬럼이 있기만 하면
-- 새 값과 옛 값이 같아도 발화하므로, 이 가드가 없으면 `set pinned_at = pinned_at` 한 줄로
-- 아무 대화 멤버나 남이 고정한 메시지의 pinned_by를 조용히 자기 이름으로 바꿔칠 수 있다
-- (messages_pin_update 정책이 멤버 전원에게 행을 열어 준다).
create function private.stamp_message_pinned_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pinned_at is not distinct from old.pinned_at then
    new.pinned_by := old.pinned_by;
  elsif new.pinned_at is null then
    new.pinned_by := null;
  else
    new.pinned_by := private.current_profile_id();
  end if;
  return new;
end;
$$;

create trigger trg_stamp_message_pinned_by
before update of pinned_at on public.messages
for each row execute function private.stamp_message_pinned_by();

create function private.mark_message_reaction_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_mark_message_reaction_updated
before update of reaction_type_id on public.message_reactions
for each row execute function private.mark_message_reaction_updated();

create function private.mark_chat_notification_settings_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_mark_chat_notification_settings_updated
before update of muted_until, level on public.chat_notification_settings
for each row execute function private.mark_chat_notification_settings_updated();

create function private.validate_chat_read_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_read_message_id is not null and not exists (
    select 1
    from public.messages m
    where m.id = new.last_read_message_id
      and m.deleted_at is null
      and m.conversation_id = new.conversation_id
  ) then
    raise exception 'last read message must be active and in the same chat';
  end if;

  if tg_op = 'UPDATE'
    and old.last_read_message_id is not null
    and (new.last_read_message_id is null or new.last_read_message_id < old.last_read_message_id)
  then
    raise exception 'last read message may only move forward';
  end if;

  new.last_read_at := now();
  return new;
end;
$$;

create trigger trg_validate_chat_read_state
before insert or update of conversation_id, last_read_message_id on public.chat_read_states
for each row execute function private.validate_chat_read_state();

create function private.add_conversation_creator_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'group' and new.created_by is not null then
    insert into public.conversation_members(conversation_id,user_id)
    values(new.id,new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_add_conversation_creator_member
after insert on public.conversations
for each row execute function private.add_conversation_creator_member();

create function private.mark_sender_chat_read()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_read_states
  set last_read_message_id=new.id
  where conversation_id=new.conversation_id
    and user_id=new.sender_id
    and (last_read_message_id is null or last_read_message_id<new.id);
  if not found then
    begin
      insert into public.chat_read_states(conversation_id,user_id,last_read_message_id)
      values(new.conversation_id,new.sender_id,new.id);
    exception when unique_violation then
      update public.chat_read_states
      set last_read_message_id=new.id
      where conversation_id=new.conversation_id
        and user_id=new.sender_id
        and (last_read_message_id is null or last_read_message_id<new.id);
    end;
  end if;
  return new;
end;
$$;

create trigger trg_mark_sender_chat_read
after insert on public.messages
for each row execute function private.mark_sender_chat_read();

-- Grouping is an images-only affordance: a photo grid reads as one moment, while
-- a pdf and an mp3 sharing a bubble have neither a shared meaning nor a shared
-- renderer. Enforced on the table rather than only inside the send RPC, because
-- service_role writes never pass through that RPC.
create function private.enforce_message_attachment_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from (select distinct message_id from new_rows) touched
    cross join lateral (
      select
        count(*) as total,
        count(*) filter (where mime.kind <> 'image') as non_image_count
      from public.message_attachments a
      join public.mime_types mime on mime.content_type = a.content_type
      where a.message_id = touched.message_id
    ) shape
    where shape.total > private.max_message_attachments()
      or (shape.total > 1 and shape.non_image_count > 0)
  ) then
    raise exception 'a message carries at most % attachments, and only images may share one', private.max_message_attachments();
  end if;

  -- 암호화된 대화의 첨부는 암호화 전용 버킷에만 산다. 버킷을 가른 이유는 09-storage에
  -- 있다: 암호문은 전부 octet-stream이라 message-files의 MIME 화이트리스트를 무력화한다.
  -- 여기서 막지 않으면 그룹 첨부를 암호화 버킷에 올려 그 화이트리스트를 우회할 수 있다.
  if exists (
    select 1
    from new_rows a
    join public.messages m on m.id = a.message_id
    join public.conversations c on c.id = m.conversation_id
    where a.storage_bucket <> case when c.type = 'direct' then 'message-files-encrypted' else 'message-files' end
  ) then
    raise exception 'attachment bucket does not match the conversation encryption';
  end if;

  return null;
end;
$$;

create trigger trg_enforce_message_attachment_shape
after insert on public.message_attachments
referencing new table as new_rows
for each statement execute function private.enforce_message_attachment_shape();

revoke execute on function private.validate_message_parent() from public, anon, authenticated, service_role;
revoke execute on function private.enforce_message_encryption_shape() from public, anon, authenticated, service_role;
revoke execute on function private.mark_message_edited() from public, anon, authenticated, service_role;
revoke execute on function private.stamp_message_pinned_by() from public, anon, authenticated, service_role;
revoke execute on function private.mark_message_reaction_updated() from public, anon, authenticated, service_role;
revoke execute on function private.validate_chat_read_state() from public, anon, authenticated, service_role;
revoke execute on function private.add_conversation_creator_member() from public, anon, authenticated, service_role;
revoke execute on function private.mark_sender_chat_read() from public, anon, authenticated, service_role;
revoke execute on function private.enforce_message_attachment_shape() from public, anon, authenticated, service_role;
revoke execute on function private.mark_chat_notification_settings_updated() from public, anon, authenticated, service_role;

alter table public.conversations enable row level security;
alter table public.direct_conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_keys enable row level security;
alter table public.message_attachment_mime_types enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_reactions enable row level security;
alter table public.chat_read_states enable row level security;
alter table public.chat_notification_settings enable row level security;
create policy conversations_select on public.conversations for select to authenticated using (private.is_conversation_member(id));
create policy conversations_insert on public.conversations for insert to authenticated with check (type='group' and created_by=private.current_profile_id() and private.is_accepted_user());
create policy direct_conversations_select on public.direct_conversations for select to authenticated using (private.is_conversation_member(conversation_id));
create policy conversation_members_select on public.conversation_members for select to authenticated using (private.is_conversation_member(conversation_id));
create policy conversation_members_insert on public.conversation_members for insert to authenticated with check (private.is_conversation_member(conversation_id) and exists(select 1 from public.conversations c where c.id=conversation_id and c.type='group') and exists(select 1 from public.profiles p where p.id=user_id and p.status='accepted' and p.deleted_at is null));
create policy messages_select on public.messages for select to authenticated using ((deleted_at is null or private.has_active_message_reply(id)) and private.is_conversation_member(conversation_id));
-- 이 두 정책은 그룹 대화 전용이다. 1:1은 여기로 들어올 수 없다: 둘 다 `content is not null`을
-- 요구하는데 암호화된 대화의 content는 언제나 null이고, content_ciphertext에는 authenticated
-- 컬럼 grant가 아예 없다. 암호화된 쓰기는 send_encrypted_message / edit_encrypted_message가
-- 유일한 문이며, trg_enforce_message_encryption_shape가 그 사실을 말이 되는 에러로 알려준다.
create policy messages_insert on public.messages for insert to authenticated with check (sender_id=private.current_profile_id() and content is not null and private.is_valid_message_parent(parent_id,conversation_id) and private.is_conversation_member(conversation_id));
create policy messages_update on public.messages for update to authenticated using (deleted_at is null and sender_id=private.current_profile_id() and created_at>=now()-interval '15 minutes' and private.is_conversation_member(conversation_id)) with check (deleted_at is null and sender_id=private.current_profile_id() and content is not null and created_at>=now()-interval '15 minutes' and private.is_conversation_member(conversation_id));
-- 봉투는 대화 참여자 모두에게 보인다. 개인키 없이는 아무 쓸모가 없는 blob이고, 발신자는
-- DH 대칭성 덕에 수신자 앞으로 봉인된 행을 그대로 열어 자기가 보낸 메시지를 다시 읽는다.
create policy message_keys_select on public.message_keys for select to authenticated using (private.can_access_message(message_id));
-- Pinning is open to any conversation member (not just the sender), unlike
-- content edits above. private.mark_message_edited() independently guards
-- content against this broader row-level visibility.
create policy messages_pin_update on public.messages for update to authenticated using (deleted_at is null and private.is_conversation_member(conversation_id)) with check (deleted_at is null and private.is_conversation_member(conversation_id));
-- Readable by clients on purpose: the composer builds its accept filter, its size
-- guard and its renderer choice from these rows instead of hardcoding a copy.
create policy message_attachment_mime_types_select on public.message_attachment_mime_types for select to authenticated using (private.is_accepted_user());
create policy message_attachments_select on public.message_attachments for select to authenticated using (private.can_access_message(message_id));
create policy message_reactions_select on public.message_reactions for select to authenticated using (private.can_access_message(message_id));
create policy message_reactions_insert on public.message_reactions for insert to authenticated with check (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy message_reactions_update on public.message_reactions for update to authenticated using (user_id=private.current_profile_id() and private.can_access_message(message_id)) with check (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy message_reactions_delete on public.message_reactions for delete to authenticated using (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy chat_read_states_select on public.chat_read_states for select to authenticated using (user_id=private.current_profile_id() and private.is_conversation_member(conversation_id));
create policy chat_read_states_insert on public.chat_read_states for insert to authenticated with check (user_id=private.current_profile_id() and last_read_message_id is not null and private.is_conversation_member(conversation_id));
create policy chat_read_states_update on public.chat_read_states for update to authenticated using (user_id=private.current_profile_id() and private.is_conversation_member(conversation_id)) with check (user_id=private.current_profile_id() and last_read_message_id is not null and private.is_conversation_member(conversation_id));
-- Own row only, and only for a conversation you are in. Unmuting is muted_until
-- back to null, so there is no delete.
create policy chat_notification_settings_select on public.chat_notification_settings for select to authenticated using (user_id=private.current_profile_id() and private.is_conversation_member(conversation_id));
create policy chat_notification_settings_insert on public.chat_notification_settings for insert to authenticated with check (user_id=private.current_profile_id() and private.is_conversation_member(conversation_id));
create policy chat_notification_settings_update on public.chat_notification_settings for update to authenticated using (user_id=private.current_profile_id() and private.is_conversation_member(conversation_id)) with check (user_id=private.current_profile_id() and private.is_conversation_member(conversation_id));

grant select on public.conversations, public.direct_conversations, public.conversation_members, public.messages, public.message_keys, public.message_attachment_mime_types, public.message_attachments, public.message_reactions, public.chat_read_states, public.chat_notification_settings to authenticated;
grant insert (type,name,created_by) on public.conversations to authenticated;
grant insert (conversation_id,user_id) on public.conversation_members to authenticated;
grant insert (conversation_id,sender_id,parent_id,content) on public.messages to authenticated;
grant update (content) on public.messages to authenticated;
grant update (pinned_at) on public.messages to authenticated;
grant insert (message_id,user_id,reaction_type_id) on public.message_reactions to authenticated;
grant update (reaction_type_id) on public.message_reactions to authenticated;
grant delete on public.message_reactions to authenticated;
grant insert (conversation_id,user_id,last_read_message_id) on public.chat_read_states to authenticated;
grant update (last_read_message_id) on public.chat_read_states to authenticated;
grant insert (conversation_id,user_id,muted_until,level) on public.chat_notification_settings to authenticated;
grant update (muted_until,level) on public.chat_notification_settings to authenticated;
grant usage, select on sequence public.conversations_id_seq, public.messages_id_seq to authenticated;

grant select, insert, update, delete on public.conversations, public.direct_conversations, public.conversation_members, public.messages, public.message_keys, public.message_attachment_mime_types, public.message_attachments, public.message_reactions, public.chat_read_states, public.chat_notification_settings to service_role;
grant usage, select on sequence public.conversations_id_seq, public.messages_id_seq, public.message_attachments_id_seq to service_role;

create function public.create_direct_conversation(p_peer_id bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); u1 bigint; u2 bigint; conv_id bigint;
begin
  if p_peer_id = caller_id then raise exception 'cannot open a direct chat with yourself'; end if;
  if not exists(select 1 from public.profiles where id=p_peer_id and status='accepted' and deleted_at is null) then
    raise exception 'peer must be an accepted user';
  end if;
  u1 := least(caller_id,p_peer_id);
  u2 := greatest(caller_id,p_peer_id);
  select dc.conversation_id into conv_id from public.direct_conversations dc where dc.user1_id=u1 and dc.user2_id=u2;
  if conv_id is not null then return conv_id; end if;
  insert into public.conversations(type) values('direct') returning id into conv_id;
  begin
    insert into public.direct_conversations(conversation_id,user1_id,user2_id) values(conv_id,u1,u2);
  exception when unique_violation then
    delete from public.conversations where id=conv_id;
    select dc.conversation_id into conv_id from public.direct_conversations dc where dc.user1_id=u1 and dc.user2_id=u2;
  end;
  return conv_id;
end;
$$;

create function public.list_conversations()
returns table(
  conversation_id bigint,
  type public.conversation_type,
  name text,
  display_name text,
  display_initials text,
  avatar_url text,
  last_message_id bigint,
  last_message_content text,
  -- 1:1 대화의 미리보기는 서버가 만들 수 없다. 암호문과 봉투를 내려보내고 클라이언트가 푼다.
  last_message_content_ciphertext text,
  last_message_key jsonb,
  last_message_has_attachment boolean,
  last_message_sender_id bigint,
  last_message_sender_name text,
  last_message_created_at timestamptz,
  unread_count bigint,
  member_count bigint,
  muted_until timestamptz,
  notification_level public.notification_level,
  created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  return query
  with my_conversations as (
    select dc.conversation_id, case when dc.user1_id=caller_id then dc.user2_id else dc.user1_id end as peer_id
    from public.direct_conversations dc
    where caller_id in (dc.user1_id, dc.user2_id)
    union all
    select cm.conversation_id, null::bigint as peer_id
    from public.conversation_members cm
    where cm.user_id=caller_id
  )
  select
    c.id as conversation_id,
    c.type,
    c.name,
    case when c.type='direct' then peer.name else c.name end as display_name,
    upper(left(regexp_replace(coalesce(case when c.type='direct' then peer.name else c.name end,'?'),'\s+','','g'),2)) as display_initials,
    case when c.type='direct' then peer.avatar_url else null end as avatar_url,
    last_message.id as last_message_id,
    last_message.content as last_message_content,
    encode(last_message.content_ciphertext,'base64') as last_message_content_ciphertext,
    last_message.envelope as last_message_key,
    coalesce(last_message.has_attachment,false) as last_message_has_attachment,
    last_message.sender_id as last_message_sender_id,
    last_sender.name as last_message_sender_name,
    last_message.created_at as last_message_created_at,
    coalesce(unread.unread_count,0) as unread_count,
    case when c.type='direct' then 2::bigint else coalesce(member_counts.member_count,0) end as member_count,
    -- Raw, not `muted_until > now()`: this function is stable, and the caller has
    -- to re-evaluate the deadline as it passes anyway.
    settings.muted_until,
    coalesce(settings.level,'all') as notification_level,
    c.created_at
  from my_conversations mc
  join public.conversations c on c.id=mc.conversation_id
  left join public.profiles peer on peer.id=mc.peer_id
  left join lateral (
    select m.id,m.sender_id,m.content,m.content_ciphertext,m.created_at,
      exists(select 1 from public.message_attachments a where a.message_id=m.id) as has_attachment,
      private.message_envelope(m.id,m.sender_id,caller_id) as envelope
    from public.messages m
    where m.conversation_id=c.id and m.deleted_at is null
    order by m.id desc
    limit 1
  ) last_message on true
  left join public.profiles last_sender on last_sender.id=last_message.sender_id
  left join public.chat_read_states read_state on read_state.conversation_id=c.id and read_state.user_id=caller_id
  left join public.chat_notification_settings settings on settings.conversation_id=c.id and settings.user_id=caller_id
  left join lateral (
    select count(*)::bigint as unread_count
    from public.messages m
    where m.conversation_id=c.id and m.deleted_at is null and m.sender_id<>caller_id
      and (read_state.last_read_message_id is null or m.id>read_state.last_read_message_id)
  ) unread on true
  left join lateral (
    select count(*)::bigint as member_count from public.conversation_members cm2 where cm2.conversation_id=c.id
  ) member_counts on true
  order by last_message.id desc nulls last, c.created_at desc, c.id desc;
end;
$$;

-- 내비 뱃지용 전역 안 읽은 메시지 수. list_conversations()의 unread_count 합과 같은 값이지만,
-- 그 함수는 마지막 메시지·멤버 수·알림 설정까지 lateral join하는 무거운 놈이라 모든 페이지에
-- 붙는 뱃지 숫자 하나를 위해 부를 수는 없다.
--
-- 대화마다 100에서 세기를 멈춘다. 뱃지는 99+ 위를 구분하지 않으니 정확도 손실이 없고, 안 읽은 게
-- 수천 개 쌓인 대화가 있어도 비용에 상한이 생긴다. 그래서 안 읽은 수를 컬럼으로 비정규화할 이유가
-- 없다 -- chat_read_states의 커서가 그대로 진실이고, 카운터와 달리 커서는 드리프트하지 않는다.
--
-- 캡을 전역 limit 하나로 두면 안 된다. 조인 위에 얹힌 limit은 스캔을 멈추지 못한다 -- 플래너가
-- 해시 조인을 고르면 활성 메시지 전체로 해시를 다 만든 뒤에야 첫 행이 나오기 때문이다. lateral로
-- 대화별로 걸어야 nested loop가 강제되고, 그때 limit이 각 인덱스 스캔을 실제로 끊는다.
-- (idx_messages_active_conversation_id = (conversation_id, id desc) where deleted_at is null)
create function public.get_unread_message_count()
returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  result bigint;
begin
  with my_cursors as (
    select mc.conversation_id, rs.last_read_message_id
    from (
      select dc.conversation_id
      from public.direct_conversations dc
      where caller_id in (dc.user1_id, dc.user2_id)
      union all
      select cm.conversation_id
      from public.conversation_members cm
      where cm.user_id=caller_id
    ) mc
    -- 커서 행이 아예 없으면(한 번도 열지 않은 대화) last_read_message_id가 null -- 전부 안 읽음이다.
    left join public.chat_read_states rs on rs.conversation_id=mc.conversation_id and rs.user_id=caller_id
  )
  select coalesce(sum(capped.unread_count),0)::bigint into result
  from my_cursors c
  cross join lateral (
    select count(*)::bigint as unread_count
    from (
      select 1
      from public.messages m
      where m.conversation_id=c.conversation_id and m.deleted_at is null and m.sender_id<>caller_id
        and (c.last_read_message_id is null or m.id>c.last_read_message_id)
      limit 100
    ) rows_capped
  ) capped;

  return result;
end;
$$;

-- 암호화된 대화에서는 content가 언제나 null이고 content_ciphertext + message_key가 대신 온다.
-- message_key는 이 메시지의 봉투다: 호출자 앞으로 봉인된 행이 있으면 그것, 없고 호출자가
-- 발신자면 아무 행이나(DH 대칭성 때문에 발신자는 자기가 만든 어떤 봉투든 연다).
--
-- 답장 미리보기(parent_message)도 봉투를 같이 들고 온다. 원본이 페이지 밖으로 스크롤돼
-- 나가면 클라이언트 캐시에 없을 수 있는데, 그때 "메시지를 불러올 수 없음"으로 무너지면
-- 안 되기 때문이다.
create function public.get_chat_messages(p_conversation_id bigint,p_before_id bigint default null,p_limit int4 default 50)
returns table(
  message_id bigint,
  conversation_id bigint,
  sender_id bigint,
  sender jsonb,
  parent_message jsonb,
  content text,
  content_ciphertext text,
  message_key jsonb,
  is_edited boolean,
  edited_at timestamptz,
  deleted_at timestamptz,
  pinned_at timestamptz,
  pinned_by jsonb,
  created_at timestamptz,
  attachments jsonb,
  reactions jsonb,
  reads jsonb
) language plpgsql stable security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if p_conversation_id is null then raise exception 'conversation target required'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  if not private.is_conversation_member(p_conversation_id) then raise exception 'conversation membership required'; end if;

  return query
  with page as (
    select m.*
    from public.messages m
    where m.conversation_id=p_conversation_id
      and (m.deleted_at is null or exists(select 1 from public.messages child where child.parent_id=m.id and child.deleted_at is null))
      and (p_before_id is null or m.id<p_before_id)
    order by m.id desc
    limit p_limit
  )
  select
    page.id as message_id,
    page.conversation_id,
    page.sender_id,
    jsonb_build_object('id',sender.id,'name',sender.name,'avatar_url',sender.avatar_url) as sender,
    case when parent.id is null then null else jsonb_build_object('id',parent.id,'sender_id',parent.sender_id,'sender_name',parent_sender.name,'content',parent.content,'content_ciphertext',encode(parent.content_ciphertext,'base64'),'message_key',private.message_envelope(parent.id,parent.sender_id,caller_id),'created_at',parent.created_at) end as parent_message,
    page.content,
    encode(page.content_ciphertext,'base64') as content_ciphertext,
    private.message_envelope(page.id,page.sender_id,caller_id) as message_key,
    (page.edited_at is not null) as is_edited,
    page.edited_at,
    page.deleted_at,
    page.pinned_at,
    case when pinner.id is null then null else jsonb_build_object('id',pinner.id,'name',pinner.name) end as pinned_by,
    page.created_at,
    coalesce(attachments.items,'[]'::jsonb) as attachments,
    coalesce(reactions.items,'[]'::jsonb) as reactions,
    coalesce(reads.items,'[]'::jsonb) as reads
  from page
  join public.profiles sender on sender.id=page.sender_id
  left join public.messages parent on parent.id=page.parent_id
  left join public.profiles parent_sender on parent_sender.id=parent.sender_id
  left join public.profiles pinner on pinner.id=page.pinned_by
  left join lateral (
    select jsonb_agg(jsonb_build_object('id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,'file_name_ciphertext',encode(a.file_name_ciphertext,'base64'),'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,'width',a.width,'height',a.height,'duration_ms',a.duration_ms,'created_at',a.created_at) order by a.sort_order,a.id) as items
    from public.message_attachments a
    join public.mime_types mime on mime.content_type=a.content_type
    where a.message_id=page.id
  ) attachments on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('user_id',mr.user_id,'user_name',rp.name,'reaction_type_id',rt.id,'reaction_key',rt.key,'reaction_name',rt.name,'reaction_icon',rt.icon,'created_at',mr.created_at,'updated_at',mr.updated_at) order by mr.created_at,mr.user_id) as items
    from public.message_reactions mr join public.reaction_types rt on rt.id=mr.reaction_type_id join public.profiles rp on rp.id=mr.user_id
    where mr.message_id=page.id
  ) reactions on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('user_id',rs.user_id,'user_name',reader.name,'read_at',rs.last_read_at) order by rs.last_read_at,rs.user_id) as items
    from public.chat_read_states rs join public.profiles reader on reader.id=rs.user_id
    where rs.conversation_id=page.conversation_id
      and rs.last_read_message_id is not null
      and rs.last_read_message_id>=page.id
  ) reads on true
  order by page.id asc;
end;
$$;

create function public.soft_delete_message(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); target_sender_id bigint;
begin
  -- 내 메시지만 잡는다(sender면 당연히 멤버다). 이 조건이 없으면 "없는 메시지 -> 조용한 리턴"과
  -- "남의 메시지 -> 예외"가 갈려, 비멤버가 임의 id로 메시지 존재·활성 여부를 알아내는 오라클이 된다.
  select sender_id into target_sender_id from public.messages
  where id=p_id and deleted_at is null and sender_id=caller_id
  for update;
  if target_sender_id is null then return; end if;

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by)
  select a.storage_bucket,a.storage_path,caller_id
  from public.message_attachments a
  where a.message_id=p_id
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  delete from public.message_attachments where message_id=p_id;
  delete from public.message_reactions where message_id=p_id;
  -- 본문이 사라진 메시지의 봉투는 아무것도 열지 않는다. 남겨두면 삭제된 메시지에 대해
  -- "누가 누구에게 봉인했는가"만 영원히 남는 셈이라, 지우는 쪽이 맞다.
  delete from public.message_keys where message_id=p_id;

  update public.messages
  set content=null,content_ciphertext=null,deleted_at=now(),deleted_by=caller_id
  where id=p_id;
end;
$$;

-- 그룹 대화 전용이다. 1:1은 서버가 암호문을 열 수 없으니 서버에서 검색할 방법이 없다 --
-- 조용히 0건을 주면 "검색이 안 되네" 대신 "그런 메시지 없네"로 읽히므로, 명시적으로 거절한다.
-- 1:1 검색은 public.get_encrypted_message_bodies()로 받아 클라이언트가 푼다.
create function public.search_messages(p_query text,p_conversation_id bigint)
returns table(message_id bigint,content_snippet text,sender_name text,created_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare normalized_query text := private.normalize_search(p_query);
begin
  if p_conversation_id is null then raise exception 'conversation target required'; end if;
  if p_query is null or char_length(btrim(p_query)) not between 1 and 200 or coalesce(normalized_query,'')='' then raise exception 'query must contain 1 to 200 characters'; end if;
  -- 멤버십을 **먼저** 본다. is_direct_conversation은 security definer라 RLS를 지나쳐 대화 타입을
  -- 답해 주므로, 이 순서가 뒤집히면 비멤버가 "예외가 뜨는가 / 빈 결과가 오는가"로 임의의
  -- conversation_id(bigserial이라 순차 추측된다)가 1:1인지를 스캔할 수 있다. 내용은 안 새지만
  -- 어떤 id가 DM인지가 샌다.
  if not private.is_conversation_member(p_conversation_id) then raise exception 'conversation membership required'; end if;
  if private.is_direct_conversation(p_conversation_id) then
    raise exception 'direct conversations are end-to-end encrypted: search them on the client';
  end if;
  -- content_normalized(생성 컬럼)로 비교해 그 위의 trgm 인덱스를 탄다. 검색어의 %,_는
  -- escape_like로 무력화한다 -- 안 그러면 '30%'가 와일드카드로 해석돼 1:1 클라이언트 검색과
  -- 다른 결과를 낸다. 둘 다 소문자로 접혀 있으니 ilike가 아니라 like다.
  return query select m.id,left(m.content,300),p.name,m.created_at
  from public.messages m join public.profiles p on p.id=m.sender_id
  where m.conversation_id=p_conversation_id
    and m.deleted_at is null
    and m.content is not null
    and m.content_normalized like '%'||private.escape_like(normalized_query)||'%'
  order by m.created_at desc,m.id desc limit 50;
end;
$$;

-- 1:1 검색을 위한 대량 읽기. 서버가 암호문을 열 수 없으므로 클라이언트가 통째로 받아 스스로
-- 푸는 것 말고 방법이 없다 -- Signal도 WhatsApp도 iMessage도 같은 이유로 로컬에서 찾는다.
-- (검색 가능 암호화는 토큰 빈도를 흘리는데, 짧은 메시지의 trigram 빈도는 사실상 평문이라
--  이 앱에서는 지키려던 것을 그대로 내주는 셈이 된다.)
--
-- get_chat_messages를 쓸 수 없어 따로 있는 함수다: 그쪽은 sender·parent·첨부·반응·읽음을
-- 전부 lateral join하고 100개에서 끊기므로, 대화 전체를 훑는 데 쓰면 조인 비용과 왕복 횟수가
-- 둘 다 터진다. 여기서는 복호화에 필요한 최소한만 주고 한 번에 1000개까지 준다
-- (PostgREST의 max_rows가 1000이라 그 위로는 어차피 잘린다).
--
-- 봉투가 없는 행(키를 갈아엎기 전의 옛 메시지)도 그대로 내려간다. 그건 아무도 못 여는
-- 메시지이고, 조용히 빼면 클라이언트가 "몇 개를 훑었는지"를 잘못 세게 된다.
create function public.get_encrypted_message_bodies(
  p_conversation_id bigint,
  p_before_id bigint default null,
  p_limit int4 default 500
)
returns table(
  message_id bigint,
  sender_id bigint,
  created_at timestamptz,
  content_ciphertext text,
  message_key jsonb
)
language plpgsql stable security definer set search_path='' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if p_conversation_id is null then raise exception 'conversation target required'; end if;
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'limit must be between 1 and 1000'; end if;
  if not private.is_conversation_member(p_conversation_id) then raise exception 'conversation membership required'; end if;
  if not private.is_direct_conversation(p_conversation_id) then
    raise exception 'conversation is not end-to-end encrypted: use search_messages';
  end if;

  return query
  select
    m.id,
    m.sender_id,
    m.created_at,
    encode(m.content_ciphertext,'base64'),
    private.message_envelope(m.id,m.sender_id,caller_id)
  from public.messages m
  where m.conversation_id=p_conversation_id
    and m.deleted_at is null
    and m.content_ciphertext is not null
    and (p_before_id is null or m.id<p_before_id)
  order by m.id desc
  limit p_limit;
end $$;

-- 메시지 키를 봉인해 줄 대상. 발신자는 뺀다 -- DH 대칭성 덕에 발신자는 수신자 앞으로 봉인된
-- 행을 그대로 열 수 있어서, 자기 사본을 저장할 이유가 없다.
create function private.conversation_recipients(p_conversation_id bigint,p_sender_id bigint)
returns table(user_id bigint) language sql stable security definer set search_path='' as $$
  select case when dc.user1_id=p_sender_id then dc.user2_id else dc.user1_id end
  from public.direct_conversations dc
  where dc.conversation_id=p_conversation_id and p_sender_id in (dc.user1_id,dc.user2_id)
  union
  select cm.user_id
  from public.conversation_members cm
  where cm.conversation_id=p_conversation_id and cm.user_id<>p_sender_id
$$;
revoke execute on function private.conversation_recipients(bigint,bigint) from public, anon, authenticated, service_role;

-- 암호화된 대화의 유일한 전송 경로.
--
--   p_content_ciphertext  base64. 첨부만 있는 메시지면 null.
--   p_keys                [{user_id, wrapped_key, sender_public_key, recipient_public_key}], 전부 base64.
--   p_attachments         send_message_with_attachments와 같은 모양이되 file_name 대신
--                         file_name_ciphertext(base64)를 받는다.
--
-- 첨부 blob은 암호문이라 storage의 mimetype은 언제나 application/octet-stream이다. 즉
-- content_type은 발신자가 "원래 뭐였는지" 신고한 값이고, 화이트리스트와 대조는 하지만 파일
-- 자체와 대조할 방법이 없다. 복호화한 blob을 신고된 MIME으로만 렌더하고 그 URL로 절대
-- 네비게이트하지 말아야 하는 이유다 -- docs/e2ee.md.
create function public.send_encrypted_message(
  p_conversation_id bigint,
  p_content_ciphertext text default null,
  p_keys jsonb default '[]'::jsonb,
  p_parent_id bigint default null,
  p_attachments jsonb default '[]'::jsonb
)
returns bigint language plpgsql security definer set search_path='' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  message_id bigint;
  expected_prefix text := p_conversation_id::text||'/'||(select auth.uid())::text||'/';
  sender_key bytea;
  ciphertext bytea := case when p_content_ciphertext is null then null else decode(p_content_ciphertext,'base64') end;
  attachment_count int4;
begin
  if not private.is_conversation_member(p_conversation_id) then raise exception 'conversation membership required'; end if;
  if not private.is_direct_conversation(p_conversation_id) then raise exception 'conversation is not end-to-end encrypted'; end if;
  if not private.is_valid_message_parent(p_parent_id,p_conversation_id) then raise exception 'active parent message in chat required'; end if;

  if p_attachments is null or jsonb_typeof(p_attachments)<>'array' then raise exception 'attachments must be a json array'; end if;
  if p_keys is null or jsonb_typeof(p_keys)<>'array' then raise exception 'keys must be a json array'; end if;
  attachment_count := jsonb_array_length(p_attachments);
  if ciphertext is null and attachment_count=0 then raise exception 'message needs a body or an attachment'; end if;
  if attachment_count>private.max_message_attachments() then
    raise exception 'a message carries at most % attachments', private.max_message_attachments();
  end if;

  select k.identity_public_key into sender_key from public.user_keys k where k.user_id=caller_id;
  if sender_key is null then raise exception 'sender has no key vault'; end if;

  -- 봉투가 정확히 "이 대화의, 나 아닌 참여자 전원"을 덮어야 한다. 덜 덮으면 상대가 못 여는
  -- 메시지가 조용히 생기고, 더 덮으면 대화 밖 사람 앞으로 봉인한 셈이 된다.
  if exists(
    select r.user_id from private.conversation_recipients(p_conversation_id,caller_id) r
    except
    select (item.value->>'user_id')::bigint from jsonb_array_elements(p_keys) as item(value)
  ) or exists(
    select (item.value->>'user_id')::bigint from jsonb_array_elements(p_keys) as item(value)
    except
    select r.user_id from private.conversation_recipients(p_conversation_id,caller_id) r
  ) then
    raise exception 'message keys must cover exactly the other members of the conversation';
  end if;

  -- 봉인에 쓰인 공개키가 지금의 공개키와 다르면 그 사이에 누가 키를 갈아엎은 것이다. 그대로
  -- 넣으면 아무도 못 여는 메시지가 영구히 남는다. 클라이언트는 키를 다시 읽고 재시도한다.
  if exists(
    select 1
    from jsonb_array_elements(p_keys) as item(value)
    left join public.user_keys k on k.user_id=(item.value->>'user_id')::bigint
    where k.identity_public_key is null
      or k.identity_public_key is distinct from decode(item.value->>'recipient_public_key','base64')
      or sender_key is distinct from decode(item.value->>'sender_public_key','base64')
  ) then
    raise exception 'message keys are stale: re-read the recipient identity keys and retry';
  end if;

  insert into public.messages(conversation_id,sender_id,parent_id,content_ciphertext)
  values(p_conversation_id,caller_id,p_parent_id,ciphertext)
  returning id into message_id;

  insert into public.message_keys(message_id,user_id,wrapped_key,sender_public_key,recipient_public_key)
  select
    message_id,
    (item.value->>'user_id')::bigint,
    decode(item.value->>'wrapped_key','base64'),
    decode(item.value->>'sender_public_key','base64'),
    decode(item.value->>'recipient_public_key','base64')
  from jsonb_array_elements(p_keys) as item(value);

  if attachment_count>0 then
    -- size_bytes는 storage에 실제로 앉아 있는 바이트 수(= 평문 + nonce 12 + 태그 16)라서
    -- 평문 기준 상한인 max_bytes에 그 오버헤드를 더해 비교한다.
    if exists(
      select 1
      from jsonb_array_elements(p_attachments) as item(value)
      left join public.message_attachment_mime_types allowed on allowed.content_type=item.value->>'content_type'
      where allowed.content_type is null
        or item.value->>'storage_path' is null
        or not private.has_uuid_object_suffix(item.value->>'storage_path',expected_prefix)
        or item.value->>'file_name_ciphertext' is null
        or (item.value->>'size_bytes')::int8 is null
        or (item.value->>'size_bytes')::int8<0
        or (item.value->>'size_bytes')::int8>allowed.max_bytes+28
        or not exists(
          select 1 from storage.objects o
          where o.bucket_id='message-files-encrypted'
            and o.name=item.value->>'storage_path'
            and o.created_at>=now()-interval '24 hours'
            and o.metadata->>'mimetype'='application/octet-stream'
            and (o.metadata->>'size')::int8=(item.value->>'size_bytes')::int8
        )
    ) then raise exception 'invalid message attachment'; end if;

    if attachment_count>1 and exists(
      select 1
      from jsonb_array_elements(p_attachments) as item(value)
      join public.mime_types mime on mime.content_type=item.value->>'content_type'
      where mime.kind<>'image'
    ) then raise exception 'only image attachments may share one message'; end if;

    insert into public.message_attachments(message_id,storage_bucket,storage_path,file_name_ciphertext,content_type,size_bytes,sort_order,width,height,duration_ms)
    select
      message_id,'message-files-encrypted',
      item.value->>'storage_path',
      decode(item.value->>'file_name_ciphertext','base64'),
      item.value->>'content_type',
      (item.value->>'size_bytes')::int8,
      (item.position-1)::int4,
      (item.value->>'width')::int4,
      (item.value->>'height')::int4,
      (item.value->>'duration_ms')::int4
    from jsonb_array_elements(p_attachments) with ordinality as item(value,position);
  end if;

  return message_id;
end $$;

-- 편집은 같은 메시지 키를 다시 쓴다(새 nonce로). 첨부가 그 키로 봉인돼 있어서, 키를 갈면
-- 이미 storage에 올라간 blob들이 열리지 않게 된다. 그래서 봉투(message_keys)는 건드리지
-- 않으며, 이 함수는 애초에 봉투를 받지도 않는다.
create function public.edit_encrypted_message(p_id bigint,p_content_ciphertext text)
returns void language plpgsql security definer set search_path='' as $$
declare caller_id bigint := private.require_current_profile(true); target public.messages;
begin
  -- 내가 멤버인 대화의 메시지만 잡는다. 이 조건이 없으면 비멤버가 임의의 message_id로 "존재하나 /
  -- 1:1인가 / 내가 보냈나"를 예외 메시지 차이로 스캔할 수 있다(search_messages와 같은 방어).
  select * into target from public.messages
  where id=p_id and deleted_at is null and private.is_conversation_member(conversation_id)
  for update;
  if target.id is null then raise exception 'message not found'; end if;
  if not private.is_direct_conversation(target.conversation_id) then raise exception 'conversation is not end-to-end encrypted'; end if;
  if target.sender_id<>caller_id then raise exception 'message sender required'; end if;
  if target.created_at<now()-interval '15 minutes' then raise exception 'not allowed to edit this message'; end if;
  if p_content_ciphertext is null then raise exception 'message body required'; end if;

  -- edited_at은 trg_mark_message_edited가 찍는다.
  update public.messages set content_ciphertext=decode(p_content_ciphertext,'base64') where id=p_id;
end $$;

-- p_attachments is a json array, ordered as the sender arranged them; the array
-- index becomes sort_order. Each element:
--   {storage_path, file_name, content_type, size_bytes, width?, height?, duration_ms?}
--
-- Every element is re-checked against the object actually sitting in storage,
-- because the upload happened client-side and nothing about it is trusted.
create function public.send_message_with_attachments(p_conversation_id bigint,p_attachments jsonb,p_parent_id bigint default null,p_content text default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(true); message_id bigint; expected_prefix text:=p_conversation_id::text||'/'||(select auth.uid())::text||'/'; normalized_content text; attachment_count int4;
begin
  if not private.is_conversation_member(p_conversation_id) then raise exception 'conversation membership required'; end if;
  if not private.is_valid_message_parent(p_parent_id,p_conversation_id) then raise exception 'active parent message in chat required'; end if;
  normalized_content:=nullif(btrim(p_content),'');
  if normalized_content is not null and char_length(normalized_content)>10000 then raise exception 'message content must be 1 to 10000 characters'; end if;

  if p_attachments is null or jsonb_typeof(p_attachments)<>'array' then raise exception 'attachments must be a json array'; end if;
  attachment_count:=jsonb_array_length(p_attachments);
  if attachment_count<1 or attachment_count>private.max_message_attachments() then
    raise exception 'a message carries 1 to % attachments', private.max_message_attachments();
  end if;

  -- A content_type a message does not accept joins to nothing, so
  -- `allowed.content_type is null` is also how a disallowed MIME type is rejected.
  if exists(
    select 1
    from jsonb_array_elements(p_attachments) as item(value)
    left join public.message_attachment_mime_types allowed on allowed.content_type=item.value->>'content_type'
    where allowed.content_type is null
      or item.value->>'storage_path' is null
      or not private.has_uuid_object_suffix(item.value->>'storage_path',expected_prefix)
      or char_length(btrim(coalesce(item.value->>'file_name','')))=0
      or (item.value->>'size_bytes')::int8 is null
      or (item.value->>'size_bytes')::int8<0
      or (item.value->>'size_bytes')::int8>allowed.max_bytes
      or not exists(
        select 1 from storage.objects o
        where o.bucket_id='message-files'
          and o.name=item.value->>'storage_path'
          and o.created_at>=now()-interval '24 hours'
          and o.metadata->>'mimetype'=item.value->>'content_type'
          and (o.metadata->>'size')::int8=(item.value->>'size_bytes')::int8
      )
  ) then raise exception 'invalid message attachment'; end if;

  -- trg_enforce_message_attachment_shape re-checks this on the table. Checked
  -- here too so the caller gets the reason rather than a trigger's error.
  if attachment_count>1 and exists(
    select 1
    from jsonb_array_elements(p_attachments) as item(value)
    join public.mime_types mime on mime.content_type=item.value->>'content_type'
    where mime.kind<>'image'
  ) then raise exception 'only image attachments may share one message'; end if;

  insert into public.messages(conversation_id,sender_id,parent_id,content)
  values(p_conversation_id,caller_id,p_parent_id,normalized_content)
  returning id into message_id;

  insert into public.message_attachments(message_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height,duration_ms)
  select
    message_id,'message-files',
    item.value->>'storage_path',
    btrim(item.value->>'file_name'),
    item.value->>'content_type',
    (item.value->>'size_bytes')::int8,
    (item.position-1)::int4,
    (item.value->>'width')::int4,
    (item.value->>'height')::int4,
    (item.value->>'duration_ms')::int4
  from jsonb_array_elements(p_attachments) with ordinality as item(value,position);

  return message_id;
end $$;

create function public.remove_group_member(p_conversation_id bigint,p_user_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(select 1 from public.conversations where id=p_conversation_id and type='group') then raise exception 'group conversation required'; end if;
  if caller_id<>p_user_id
    and not exists(select 1 from public.conversations where id=p_conversation_id and created_by=caller_id)
    and not exists(select 1 from public.profiles where id=caller_id and role='admin')
    then raise exception 'not allowed to remove member'; end if;
  delete from public.chat_read_states where conversation_id=p_conversation_id and user_id=p_user_id;
  delete from public.chat_notification_settings where conversation_id=p_conversation_id and user_id=p_user_id;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.conversation_id=p_conversation_id and mr.user_id=p_user_id;
  delete from public.conversation_members where conversation_id=p_conversation_id and user_id=p_user_id;
end;
$$;

revoke execute on function public.create_direct_conversation(bigint), public.list_conversations(), public.get_unread_message_count(), public.get_chat_messages(bigint,bigint,int4), public.get_encrypted_message_bodies(bigint,bigint,int4), public.soft_delete_message(bigint), public.search_messages(text,bigint), public.send_message_with_attachments(bigint,jsonb,bigint,text), public.send_encrypted_message(bigint,text,jsonb,bigint,jsonb), public.edit_encrypted_message(bigint,text), public.remove_group_member(bigint,bigint) from public, anon, authenticated, service_role;
grant execute on function public.create_direct_conversation(bigint), public.list_conversations(), public.get_unread_message_count(), public.get_chat_messages(bigint,bigint,int4) to authenticated;
grant execute on function public.soft_delete_message(bigint) to authenticated;
grant execute on function public.search_messages(text,bigint), public.get_encrypted_message_bodies(bigint,bigint,int4) to authenticated;
grant execute on function public.send_message_with_attachments(bigint,jsonb,bigint,text) to authenticated;
grant execute on function public.send_encrypted_message(bigint,text,jsonb,bigint,jsonb), public.edit_encrypted_message(bigint,text) to authenticated;
grant execute on function public.remove_group_member(bigint,bigint) to authenticated;

create function public.cleanup_conversation(p_conversation_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_service_role();
  if exists(select 1 from public.message_attachments a join public.messages m on m.id=a.message_id where m.conversation_id=p_conversation_id) then
    raise exception 'message attachments must be removed before purging conversation';
  end if;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.conversation_id=p_conversation_id;
  delete from public.message_keys mk using public.messages m where mk.message_id=m.id and m.conversation_id=p_conversation_id;
  delete from public.chat_read_states where conversation_id=p_conversation_id;
  delete from public.chat_notification_settings where conversation_id=p_conversation_id;

  -- Replies nest to any depth and messages.parent_id restricts deletes, so peel
  -- the leaves off until none are left. Deleting replies then roots would only
  -- ever work for a single level.
  loop
    delete from public.messages m
    where m.conversation_id=p_conversation_id
      and not exists(select 1 from public.messages child where child.parent_id=m.id);
    exit when not found;
  end loop;
  delete from public.direct_conversations where conversation_id=p_conversation_id;
  delete from public.conversation_members where conversation_id=p_conversation_id;
  delete from public.conversations where id=p_conversation_id;
end $$;

grant execute on function public.cleanup_conversation(bigint) to service_role;
revoke execute on function public.cleanup_conversation(bigint) from public, anon, authenticated;
