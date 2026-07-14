create table public.posts (
  id bigserial primary key,
  pub_id uuid not null default gen_random_uuid(),
  space_id bigint not null references public.spaces (id) on delete restrict,
  author_id bigint not null references public.profiles (id) on delete restrict,
  title text not null,
  content text not null,
  -- 검색 전용 정규화 형태. 표시엔 안 쓰고 title/content에서 private.normalize_search로 파생만
  -- 하므로 원본·인덱스·RPC 검색어와 절대 어긋날 수 없다(규칙은 그 함수 한 곳). 저장형(stored)이라
  -- 2자 검색처럼 인덱스가 못 돕는 구간도 정규식 재계산 없이 컬럼만 훑어 훨씬 싸다.
  title_normalized text generated always as (private.normalize_search(title)) stored,
  content_normalized text generated always as (private.normalize_search(content)) stored,
  is_anonymous boolean not null default false,
  -- 이 글이 속한 그룹 게시판/말머리(선택). 카테고리 삭제 시 글은 남고 미분류로 떨어진다.
  -- 같은 space의 카테고리여야 한다 -- FK로 못 잡아 trg_validate_post_category가 검증.
  category_id bigint null references public.space_categories (id) on delete set null,
  pinned_at timestamptz null,
  pinned_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by bigint null references public.profiles (id) on delete set null
);

-- post 첨부가 받아들이는 MIME과 타입별 크기 상한. message_attachment_mime_types와 같은 역할이고,
-- post_attachments가 여기로 FK를 걸어 "글이 받지 않는 타입은 저장 자체가 불가능"하게 만든다.
-- 행은 seed라 마이그레이션에 산다.
create table public.post_attachment_mime_types (
  content_type text primary key references public.mime_types (content_type) on update cascade on delete restrict,
  max_bytes int8 not null,
  created_at timestamptz not null default now()
);

create table public.post_attachments (
  id bigserial primary key,
  post_id bigint not null references public.posts (id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text not null references public.post_attachment_mime_types (content_type) on update cascade on delete restrict,
  size_bytes int8 null,
  sort_order int4 not null default 0,
  width int4 null,
  height int4 null,
  created_at timestamptz not null default now()
);

create table public.comments (
  id bigserial primary key,
  post_id bigint not null references public.posts (id) on delete restrict,
  author_id bigint not null references public.profiles (id) on delete restrict,
  parent_id bigint null references public.comments (id) on delete restrict,
  -- 답글이 달린 댓글은 소프트 삭제돼도 tombstone으로 남아 계속 select된다(comments_select의
  -- has_active_descendant). content가 not null이면 그 tombstone이 원문을 그대로 실어 나르므로
  -- nullable이어야 하고, soft_delete_comment가 비운다. 살아있는 댓글은 아래 check로 본문을 강제한다
  -- (insert grant에 deleted_at이 없어 클라이언트가 빈 댓글을 만들 수는 없다).
  content text null,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by bigint null references public.profiles (id) on delete set null,
  constraint comments_content_present check (content is not null or deleted_at is not null)
);

-- 본문에서 언급된 사람. 본문을 파싱하지 않는다 -- 에디터가 고른 대상의 profile id를 그대로 저장한다.
-- 파싱하려면 유니크 handle이 필요한데 profiles엔 name뿐이고 유니크도 아니라 동명이인을 가를 수가
-- 없다(게다가 코드블록·이메일 오탐이 따라붙는다). 이 테이블이 없으면 space_members의 기본
-- notification_setting인 'mentions'가 "아무 알림도 안 받음"과 같은 뜻이 된다.
--
-- 익명 글/댓글도 멘션할 수 있다: 이 행은 "누가 언급됐나"만 담고 "누가 언급했나"는 담지 않는다.
-- 작성자는 여전히 posts/comments.author_id에만 있고 거기 select grant는 회수돼 있다.
create table public.post_mentions (
  post_id bigint not null references public.posts (id) on delete cascade,
  user_id bigint not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comment_mentions (
  comment_id bigint not null references public.comments (id) on delete cascade,
  user_id bigint not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index idx_posts_active_space_created_at on public.posts (space_id, created_at desc, id desc)
where deleted_at is null;
create index idx_posts_active_space_category on public.posts (space_id, category_id, created_at desc, id desc)
where deleted_at is null;
create index idx_posts_pinned on public.posts (space_id, pinned_at desc)
where pinned_at is not null and deleted_at is null;
create index idx_posts_deleted_at on public.posts (deleted_at)
where deleted_at is not null;

create index idx_comments_tree on public.comments (post_id, parent_id, created_at);
create index idx_comments_deleted_at on public.comments (deleted_at)
where deleted_at is not null;
-- idx_comments_tree는 post_id가 선두라 "이 댓글의 자식"(parent_id 단독)에 못 쓴다. 그 조회는
-- has_active_descendant가 comments_select 안에서 tombstone마다, soft_delete_comment와
-- purge_deleted_content가 재귀/잎벗기기마다 돈다 -- 없으면 매 레벨이 comments 전체 스캔이다.
create index idx_comments_parent on public.comments (parent_id)
where parent_id is not null;
-- 멘션은 (owner, user)가 PK라 "이 글의 멘션"은 이미 빠르다. 역방향("나를 언급한 것들")만 인덱스가 없다.
create index idx_post_mentions_user on public.post_mentions (user_id);
create index idx_comment_mentions_user on public.comment_mentions (user_id);
create index idx_posts_title_search_gin on public.posts
  using gin (title_normalized extensions.gin_trgm_ops)
  where deleted_at is null;
create index idx_posts_content_search_gin on public.posts
  using gin (content_normalized extensions.gin_trgm_ops)
  where deleted_at is null;

-- A post's comment and reaction counts are read with count(*), not cached on the
-- row. Clients write comments and post_reactions straight to the table under
-- column grants, so there is no RPC to hang a counter on and a cache would need
-- triggers -- which would take a row lock on the post for every comment, and
-- serialise the two hundred people answering one announcement. The read contract
-- is identical either way, so the cache can arrive the day a measurement asks for
-- it. spaces.member_count is cached because join/leave do go through an RPC.
alter table public.posts
  add constraint posts_pub_id_key unique (pub_id),
  add constraint posts_title_check check (char_length(btrim(title)) between 1 and 200),
  add constraint posts_content_check check (char_length(btrim(content)) between 1 and 50000),
  add constraint posts_deleted_state_check check (deleted_at is not null or deleted_by is null),
  add constraint posts_pin_state_check check (
    pinned_at is not null or pinned_by is null
  );

alter table public.post_attachments
  add constraint post_attachments_post_sort_key unique (post_id, sort_order),
  add constraint post_attachments_storage_key unique (storage_bucket, storage_path),
  add constraint post_attachments_bucket_check check (storage_bucket = 'post-files'),
  add constraint post_attachments_storage_path_check check (
    char_length(storage_path) between 1 and 1024
    and storage_path !~ '(^|/)\.\.?(/|$)'
  ),
  add constraint post_attachments_file_name_check check (char_length(btrim(file_name)) between 1 and 255),
  add constraint post_attachments_content_type_check check (char_length(btrim(content_type)) between 1 and 255),
  add constraint post_attachments_size_check check (size_bytes is null or size_bytes >= 0),
  add constraint post_attachments_sort_order_check check (sort_order >= 0);

alter table public.comments
  add constraint comments_parent_check check (parent_id is null or parent_id <> id),
  add constraint comments_content_check check (char_length(btrim(content)) between 1 and 10000),
  add constraint comments_deleted_state_check check (deleted_at is not null or deleted_by is null);

create function private.can_access_post(p_post_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.posts p where p.id=p_post_id and p.deleted_at is null and private.can_participate_space(p.space_id))
$$;
create function private.can_access_comment(p_comment_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.comments c where c.id=p_comment_id and c.deleted_at is null and private.can_access_post(c.post_id))
$$;
-- Comments nest to arbitrary depth, so a soft-deleted comment must stay visible (as a tombstone)
-- while any descendant at any depth is still active, otherwise the reply chain to it would orphan.
create function private.has_active_descendant(p_comment_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  with recursive descendants(id,deleted_at) as (
    select c.id, c.deleted_at
    from public.comments c
    where c.parent_id = p_comment_id
    union
    select child.id, child.deleted_at
    from public.comments child
    join descendants d on child.parent_id = d.id
  )
  select exists (select 1 from descendants where deleted_at is null)
$$;
create function private.max_post_attachments()
returns int4 language sql immutable set search_path = '' as $$ select 10 $$;
-- 멘션 하나가 알림 하나다. 상한이 없으면 글 한 개로 전교생에게 알림을 쏠 수 있다.
create function private.max_mentions()
returns int4 language sql immutable set search_path = '' as $$ select 20 $$;
revoke execute on function private.can_access_post(bigint), private.can_access_comment(bigint), private.has_active_descendant(bigint), private.max_post_attachments(), private.max_mentions() from public, anon, service_role;
grant execute on function private.can_access_post(bigint), private.can_access_comment(bigint), private.has_active_descendant(bigint) to authenticated;

-- post_mentions와 comment_mentions는 소유자 컬럼 이름만 다르고(post_id / comment_id) 규칙이 같다.
-- 소유자 컬럼명을 tg_argv로 받아 한 함수로 처리한다 -- 테이블마다 같은 함수를 복사하는 것보다
-- 규칙이 하나뿐임이 분명해진다. tg_table_name은 %I로 인용하고 search_path는 비어 있어 주입 여지가 없다.
create function private.enforce_mention_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner_column text := tg_argv[0];
  owner_id bigint := (to_jsonb(new) ->> owner_column)::bigint;
  existing int4;
begin
  execute format('select count(*) from public.%I where %I = $1', tg_table_name, owner_column)
  into existing using owner_id;
  if existing >= private.max_mentions() then
    raise exception 'at most % people can be mentioned', private.max_mentions();
  end if;
  return new;
end;
$$;
revoke execute on function private.enforce_mention_limit() from public, anon, authenticated, service_role;

create trigger trg_enforce_post_mention_limit
before insert on public.post_mentions
for each row execute function private.enforce_mention_limit('post_id');

create trigger trg_enforce_comment_mention_limit
before insert on public.comment_mentions
for each row execute function private.enforce_mention_limit('comment_id');

-- set_post_attachments가 이미 개수를 검사하지만, 테이블에서도 다시 막는다(service_role 직접 삽입 등).
-- 메시지와 달리 글은 이미지와 파일을 섞을 수 있어서(카드가 이미지 그리드와 파일 목록을 함께 렌더한다)
-- "여럿이면 전부 이미지" 규칙은 없고 개수 상한만 있다.
create function private.enforce_post_attachment_shape()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1
    from (select distinct post_id from new_rows) touched
    where (select count(*) from public.post_attachments a where a.post_id = touched.post_id)
          > private.max_post_attachments()
  ) then
    raise exception 'a post carries at most % attachments', private.max_post_attachments();
  end if;
  return null;
end;
$$;
revoke execute on function private.enforce_post_attachment_shape() from public, anon, authenticated, service_role;

create function private.validate_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    if not exists (
      select 1
      from public.comments as parent
      where parent.id = new.parent_id
        and parent.post_id = new.post_id
        and parent.deleted_at is null
    ) then
      raise exception 'comment parent must be an active comment on the same post';
    end if;
    -- 중첩 깊이를 30으로 막는다. 이 캡이 없으면 임의로 깊은 답글 사슬을 만들 수 있고, 그러면
    -- comments_select가 tombstone마다 부르는 has_active_descendant(사슬 끝까지 재귀)가 사슬 하나에
    -- O(N^2)로 폭발해 조회 한 번으로 DB를 태울 수 있다. 깊이를 여기서 막으면 그 재귀가 자연히
    -- 30단계로 유계가 된다 -- 함수 쪽에 깊이 캡을 두면 정확성이 깨지므로(깊은 tombstone이 조용히
    -- 사라져 트리가 끊긴다) 캡은 생성 시점인 여기 있어야 한다. 부모까지의 조상 수는 곧 부모의
    -- 깊이이고, 새 댓글은 그보다 한 단 깊다 -- 부모가 이미 30단계면 거절한다.
    if (
      with recursive ancestors(id, parent_id, depth) as (
        select c.id, c.parent_id, 1 from public.comments c where c.id = new.parent_id
        union all
        select c.id, c.parent_id, a.depth + 1
        from public.comments c join ancestors a on c.id = a.parent_id
        where a.depth < 30
      )
      select max(depth) from ancestors
    ) >= 30 then
      raise exception 'comment nesting too deep';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_validate_comment_parent
before insert or update of post_id, parent_id on public.comments
for each row execute function private.validate_comment_parent();

revoke execute on function private.validate_comment_parent() from public, anon, authenticated, service_role;

-- 글의 카테고리는 반드시 같은 space의 것이어야 한다(단일 FK로는 교차 컬럼 검증 불가).
create function private.validate_post_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.space_categories sc
    where sc.id = new.category_id and sc.space_id = new.space_id
  ) then
    raise exception 'post category must belong to the same space';
  end if;
  return new;
end;
$$;

create trigger trg_validate_post_category
before insert or update of space_id, category_id on public.posts
for each row execute function private.validate_post_category();

revoke execute on function private.validate_post_category() from public, anon, authenticated, service_role;

-- posts.updated_at / comments.updated_at은 컬럼도 있고 읽기 RPC가 내려주기까지 하는데 여태 아무도
-- 쓰지 않아 **영원히 null**이었다 -- "수정됨" 표시가 원리적으로 불가능했다. 클라이언트가 채우게
-- 하지 않는 건 맞다(소급해 꾸밀 수 있다). 그래서 update 컬럼 grant에서 빼 두고 서버가 찍는다.
-- BEFORE 트리거가 NEW를 고치는 건 컬럼 grant와 무관하다 -- grant는 문장의 SET 절만 본다.
--
-- messages와 달리 여기서 권한을 재검증하지 않는 이유: posts_update/comments_update는 작성자
-- 본인 하나뿐인 정책이라 행 가시성을 넓히는 두 번째 permissive 정책이 없다. messages에는 pin
-- 정책이 있어서 trg_mark_message_edited가 발신자 여부를 다시 봐야 했다.
create function private.mark_post_edited()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.title := btrim(new.title);
  new.content := btrim(new.content);
  -- 카테고리 이동도 작성자가 한 변경이라 수정으로 친다(글에서 그 사람이 바꿀 수 있는 건 이 셋뿐이다).
  -- INSERT에도 걸어 작성 시 앞뒤 공백을 지우지만(수정 때만 트리밍되던 비대칭 제거) updated_at은
  -- UPDATE일 때만 찍는다 -- 방금 만든 글은 수정된 적이 없다. old는 INSERT에 없으므로 tg_op 가드가
  -- 없으면 new.x is distinct from (null)이 참이 되어 갓 만든 글에 updated_at이 찍힌다.
  if tg_op = 'UPDATE' and (
       new.title is distinct from old.title
    or new.content is distinct from old.content
    or new.category_id is distinct from old.category_id
  ) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create function private.mark_comment_edited()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.content is not null then
    new.content := nullif(btrim(new.content), '');
  end if;
  -- soft_delete_comment도 content를 건드리므로(원문을 비운다) 이 트리거가 돈다. 삭제는 수정이
  -- 아니니 스탬프하지 않는다 -- 안 그러면 tombstone의 updated_at이 "삭제한 시각"이 돼 버린다.
  if old.deleted_at is null and new.deleted_at is null and new.content is distinct from old.content then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- pinned_at(set_post_pinned)이나 deleted_at(soft_delete_post)만 바꾸는 UPDATE는 이 컬럼들을
-- 언급하지 않으므로 트리거가 돌지 않는다 -- 고정이 "수정됨"을 찍지 않는다.
create trigger trg_mark_post_edited
before insert or update of title, content, category_id on public.posts
for each row execute function private.mark_post_edited();

create trigger trg_mark_comment_edited
before update of content on public.comments
for each row execute function private.mark_comment_edited();

revoke execute on function private.mark_post_edited(), private.mark_comment_edited() from public, anon, authenticated, service_role;

create trigger trg_enforce_post_attachment_shape
after insert on public.post_attachments
referencing new table as new_rows
for each statement execute function private.enforce_post_attachment_shape();

alter table public.posts enable row level security;
alter table public.post_attachment_mime_types enable row level security;
alter table public.post_attachments enable row level security;
alter table public.comments enable row level security;
alter table public.post_mentions enable row level security;
alter table public.comment_mentions enable row level security;
create policy post_attachment_mime_types_select on public.post_attachment_mime_types for select to authenticated using (private.is_accepted_user());
create policy posts_select on public.posts for select to authenticated using (deleted_at is null and private.can_participate_space(space_id));
-- can_participate_space가 아니라 can_post_in_space다: post_policy='managers'인 공지형 그룹에서는
-- 멤버여도 메인 글을 못 쓴다(댓글은 comments_insert가 can_access_post로 여전히 열어 둔다).
create policy posts_insert on public.posts for insert to authenticated with check (author_id=private.current_profile_id() and private.can_post_in_space(space_id));
create policy posts_update on public.posts for update to authenticated using (deleted_at is null and author_id=private.current_profile_id() and private.can_participate_space(space_id)) with check (deleted_at is null and author_id=private.current_profile_id() and private.can_participate_space(space_id));
create policy post_attachments_select on public.post_attachments for select to authenticated using (private.can_access_post(post_id));

create policy comments_select on public.comments for select to authenticated using (private.can_access_post(post_id) and (deleted_at is null or private.has_active_descendant(id)));
-- 부모 생존은 여기서 안 본다 -- trg_validate_comment_parent가 모든 insert 경로에서 본다.
create policy comments_insert on public.comments for insert to authenticated with check (author_id=private.current_profile_id() and private.can_access_post(post_id));
create policy comments_update on public.comments for update to authenticated using (deleted_at is null and author_id=private.current_profile_id() and private.can_access_post(post_id)) with check (deleted_at is null and author_id=private.current_profile_id() and private.can_access_post(post_id));

-- 멘션은 작성자만 달고, 대상은 그 공간의 멤버여야 한다. 멤버 검사가 없으면 읽지도 못하는 글의
-- 알림을 받게 되고(딥링크를 눌러도 403), 나아가 아무 공간에서나 아무에게나 알림을 쏘는 통로가 된다.
-- update는 없다: 멘션은 붙이거나 떼거나 둘 중 하나다.
create policy post_mentions_select on public.post_mentions for select to authenticated using (private.can_access_post(post_id));
create policy post_mentions_insert on public.post_mentions for insert to authenticated with check (
  exists(
    select 1 from public.posts p
    where p.id=post_mentions.post_id and p.author_id=private.current_profile_id() and p.deleted_at is null
  )
  and exists(
    select 1 from public.posts p join public.space_members sm on sm.space_id=p.space_id
    where p.id=post_mentions.post_id and sm.user_id=post_mentions.user_id and sm.banned_at is null
  )
);
create policy post_mentions_delete on public.post_mentions for delete to authenticated using (
  exists(
    select 1 from public.posts p
    where p.id=post_mentions.post_id and p.author_id=private.current_profile_id() and p.deleted_at is null
  )
);

create policy comment_mentions_select on public.comment_mentions for select to authenticated using (private.can_access_comment(comment_id));
create policy comment_mentions_insert on public.comment_mentions for insert to authenticated with check (
  exists(
    select 1 from public.comments c
    where c.id=comment_mentions.comment_id and c.author_id=private.current_profile_id() and c.deleted_at is null
  )
  and exists(
    select 1 from public.comments c
    join public.posts p on p.id=c.post_id
    join public.space_members sm on sm.space_id=p.space_id
    where c.id=comment_mentions.comment_id and sm.user_id=comment_mentions.user_id and sm.banned_at is null
  )
);
create policy comment_mentions_delete on public.comment_mentions for delete to authenticated using (
  exists(
    select 1 from public.comments c
    where c.id=comment_mentions.comment_id and c.author_id=private.current_profile_id() and c.deleted_at is null
  )
);

-- 익명이 익명이려면 author_id를 클라이언트가 못 읽어야 한다. 테이블 전체 select를 주면
-- `select author_id from posts where is_anonymous`로 익명 글 작성자 명단이 그대로 나온다 --
-- is_anonymous는 표시 플래그일 뿐 RLS가 author_id를 가려주지 않는다.
-- 그래서 select를 컬럼 단위로 좁혀 author_id/deleted_by(모더레이터 신원)/pinned_by를 회수하고,
-- 작성자 정보는 아래 읽기 RPC들이 익명이면 null로 지워서 내려준다. RLS 정책과 트리거는 테이블
-- 소유자 권한으로 돌므로 이 회수에 영향받지 않는다.
grant select (id,pub_id,space_id,title,content,is_anonymous,category_id,pinned_at,created_at,updated_at) on public.posts to authenticated;
grant select (id,post_id,parent_id,content,is_anonymous,created_at,updated_at,deleted_at) on public.comments to authenticated;
grant select on public.post_attachments, public.post_attachment_mime_types to authenticated;
grant insert (space_id,author_id,title,content,is_anonymous,category_id) on public.posts to authenticated;
-- is_anonymous는 update에서 뺀다. 작성 시점에만 정해지고 그 뒤로는 불변이다 -- 익명으로 쓴 글을
-- 나중에 실명으로 까거나(작성자가 후회해도 이미 익명을 믿고 반응한 사람들이 있다) 실명 글을
-- 익명으로 숨기는(이미 본 사람은 아는데 새로 보는 사람만 못 보는, 반쪽짜리 익명) 전환을 둘 다 막는다.
-- 댓글은 update grant가 content 하나뿐이라 이미 불변이다.
grant update (title,content,category_id) on public.posts to authenticated;
grant insert (post_id,author_id,parent_id,content,is_anonymous) on public.comments to authenticated;
grant update (content) on public.comments to authenticated;
-- 멘션은 update가 없다(붙이거나 떼거나 둘 중 하나). insert는 컬럼 단위라 created_at을 클라이언트가
-- 정할 수 없다 -- 정할 수 있으면 멘션 시각을 소급해 꾸밀 수 있다.
grant select, delete on public.post_mentions, public.comment_mentions to authenticated;
grant insert (post_id,user_id) on public.post_mentions to authenticated;
grant insert (comment_id,user_id) on public.comment_mentions to authenticated;
grant usage, select on sequence public.posts_id_seq, public.comments_id_seq to authenticated;
grant select, insert, update, delete on public.posts, public.post_attachment_mime_types, public.post_attachments, public.comments, public.post_mentions, public.comment_mentions to service_role;
grant usage, select on sequence public.posts_id_seq, public.post_attachments_id_seq, public.comments_id_seq to service_role;

-- 읽기 경로가 RPC인 이유는 두 가지다.
-- 1) 익명. author_id의 select grant를 회수했으므로 작성자를 붙여줄 수 있는 건 security definer
--    함수뿐이고, 그 함수가 is_anonymous면 author를 null로 지운다. is_mine은 익명이어도 true다 --
--    자기 글엔 수정/삭제가 떠야 하고, 그 사실은 남에게 새지 않는다(남에겐 false).
-- 2) 카운트. 댓글/반응 수는 캐시하지 않고 count(*)로 세는데, 클라이언트가 글마다 따로 세면 N+1이다.
--    한 번에 묶어 내린다(list_conversations가 unread를 묶는 것과 같은 이유).
create function private.post_author(p_author_id bigint, p_is_anonymous boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_is_anonymous then null else
    (select jsonb_build_object('id',pr.id,'name',pr.name,'avatar_url',pr.avatar_url)
     from public.profiles pr where pr.id=p_author_id)
  end
$$;
revoke execute on function private.post_author(bigint,boolean) from public, anon, authenticated, service_role;
-- 반응 요약 헬퍼(private.post_reaction_summary / comment_reaction_summary)는 post_reactions·
-- comment_reactions를 참조하므로 04-reactions.sql에 산다(그 테이블들이 이 파일보다 늦게 생긴다).
-- list_space_posts·get_post·get_post_comments가 lateral join으로 호출한다.

-- 그룹 피드. 로더를 붙일 때 밟기 쉬운 함정이 둘 있다.
--
-- 1) **고정 글은 첫 페이지에만** 얹혀 오고 시간순 스트림에는 없다(아래 union). 그래서 반환 행 수가
--    p_limit보다 클 수 있고, `rows.length === p_limit`으로 "다음 페이지가 있나"를 판단하면 고정 글
--    수만큼 부풀어 **틀린다**. 세야 하는 건 pinned_at is null인 스트림 쪽이고, 다음 커서도 그 스트림의
--    마지막 글이다(정렬이 고정 먼저라 배열의 끝은 언제나 스트림의 가장 오래된 글이다).
-- 2) **비멤버에게는 예외를 던진다**(can_participate_space). 공개 그룹은 가입 전에도 목록에 보이므로
--    (spaces_select), 가입 전 화면에서 이걸 그냥 부르면 로더가 500으로 터진다 -- 멤버인지 먼저 갈라
--    빈 목록을 주든 안내를 띄우든 해야 한다.
create function public.list_space_posts(
  p_space_id bigint,
  p_category_id bigint default null,
  p_before_id bigint default null,
  p_limit int4 default 20
)
returns table(
  post_id bigint,
  pub_id uuid,
  title text,
  content text,
  is_anonymous boolean,
  author jsonb,
  is_mine boolean,
  category jsonb,
  pinned_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  comment_count bigint,
  reaction_count bigint,
  top_reactions jsonb,
  my_reaction_id bigint,
  attachments jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  before_created_at timestamptz;
begin
  if not private.can_participate_space(p_space_id) then raise exception 'space membership required'; end if;
  -- null을 빼먹으면 `limit null`이 되어 상한이 통째로 사라진다(null < 1은 참이 아니라 null이라
  -- 이 가드를 그냥 지나간다). 그러면 클라이언트가 p_limit=null 한 번으로 접근 가능한 글/댓글을
  -- 전부 빨아낼 수 있다 -- 05-chat의 읽기 RPC들이 처음부터 `p_limit is null`을 함께 본 이유다.
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  -- 커서는 id 하나지만 정렬은 (created_at, id)다. 그 글의 created_at을 찾아 행 비교로 쓰면
  -- idx_posts_active_space_created_at을 그대로 탄다.
  if p_before_id is not null then
    select p.created_at into before_created_at from public.posts p where p.id=p_before_id;
  end if;

  return query
  with page as (
    -- 고정 글은 첫 페이지에만 얹고, 시간순 스트림에서는 빼서 두 번 나오지 않게 한다(FB와 동일).
    select p.*, 0 as sort_group
    from public.posts p
    where p_before_id is null
      and p.space_id=p_space_id and p.deleted_at is null and p.pinned_at is not null
      and (p_category_id is null or p.category_id=p_category_id)
    union all
    (
      select p.*, 1 as sort_group
      from public.posts p
      where p.space_id=p_space_id and p.deleted_at is null and p.pinned_at is null
        and (p_category_id is null or p.category_id=p_category_id)
        and (p_before_id is null or (p.created_at, p.id) < (before_created_at, p_before_id))
      order by p.created_at desc, p.id desc
      limit p_limit
    )
  )
  select
    page.id,
    page.pub_id,
    page.title,
    page.content,
    page.is_anonymous,
    private.post_author(page.author_id, page.is_anonymous),
    page.author_id=caller_id,
    case when cat.id is null then null else
      jsonb_build_object('id',cat.id,'name',cat.name,'sort_order',cat.sort_order) end,
    page.pinned_at,
    page.created_at,
    page.updated_at,
    coalesce(counts.comment_count,0),
    coalesce(counts.reaction_count,0),
    coalesce(summary.top_reactions,'[]'::jsonb),
    summary.my_reaction_id,
    coalesce(files.items,'[]'::jsonb)
  from page
  left join public.space_categories cat on cat.id=page.category_id
  left join lateral (
    select
      (select count(*) from public.comments c where c.post_id=page.id and c.deleted_at is null) as comment_count,
      (select count(*) from public.post_reactions r where r.post_id=page.id) as reaction_count
  ) counts on true
  left join lateral (select * from private.post_reaction_summary(page.id, caller_id)) summary on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,
      'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,
      'width',a.width,'height',a.height
    ) order by a.sort_order, a.id) as items
    from public.post_attachments a
    join public.mime_types mime on mime.content_type=a.content_type
    where a.post_id=page.id
  ) files on true
  order by page.sort_group, page.pinned_at desc nulls last, page.created_at desc, page.id desc;
end;
$$;

-- 홈 피드. 멤버인 모든 space의 글을 고정글 우선 없이 최신순 한 흐름으로 합친다. security definer
-- 함수라 RLS가 아니라 아래 space_members 조인이 접근 경계다 -- 탈퇴/차단된 공간의 글은 여기서
-- 빠진다. 작성자·반응·첨부의 반환 계약은 list_space_posts와 같고, 홈에서 출처를 표시할 space만
-- 추가한다.
--
-- list_space_posts의 두 함정이 여기엔 **없다**. 고정 union이 없으므로 `행 수 == p_limit`이 그대로
-- "다음 페이지 있음"이고, 멤버십은 조인이라 비멤버여도 예외가 아니라 빈 목록이 나온다.
--
-- 다만 pinned_at은 같이 내려오되 **이 피드에서는 정렬에 쓰지 않는다** -- 고정은 한 그룹 안에서의
-- 개념이라 여러 그룹을 가로지르는 흐름에선 "무슨 기준으로 맨 위"인지 말할 수가 없다. 그래서 이 값을
-- 그대로 "고정됨" 배지로 옮기면 맨 위에 있지도 않은 글에 고정 배지가 붙는 거짓말이 된다. 매퍼가
-- 출처 space가 있는 행에서 고정을 떨어뜨리는 이유다(app/lib/feed/map-post.ts).
create function public.list_feed_posts(
  p_before_id bigint default null,
  p_limit int4 default 20
)
returns table(
  post_id bigint,
  pub_id uuid,
  title text,
  content text,
  is_anonymous boolean,
  author jsonb,
  is_mine boolean,
  category jsonb,
  space jsonb,
  pinned_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  comment_count bigint,
  reaction_count bigint,
  top_reactions jsonb,
  my_reaction_id bigint,
  attachments jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  before_created_at timestamptz;
begin
  -- null을 빼먹으면 `limit null`이 되어 상한이 통째로 사라진다(null < 1은 참이 아니라 null이라
  -- 이 가드를 그냥 지나간다). 그러면 클라이언트가 p_limit=null 한 번으로 접근 가능한 글/댓글을
  -- 전부 빨아낼 수 있다 -- 05-chat의 읽기 RPC들이 처음부터 `p_limit is null`을 함께 본 이유다.
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  -- 커서는 id 하나지만 전체 피드는 (created_at, id) 내림차순이다. 시간도 함께 찾아 행 비교를
  -- 쓰면 각 space의 idx_posts_active_space_created_at을 그대로 이용할 수 있다.
  if p_before_id is not null then
    select p.created_at into before_created_at from public.posts p where p.id=p_before_id;
  end if;

  return query
  select
    p.id,
    p.pub_id,
    p.title,
    p.content,
    p.is_anonymous,
    private.post_author(p.author_id, p.is_anonymous),
    p.author_id=caller_id,
    case when cat.id is null then null else
      jsonb_build_object('id',cat.id,'name',cat.name,'sort_order',cat.sort_order) end,
    jsonb_build_object('name',s.name,'type',s.type,'pub_id',s.pub_id),
    p.pinned_at,
    p.created_at,
    p.updated_at,
    coalesce(counts.comment_count,0),
    coalesce(counts.reaction_count,0),
    coalesce(summary.top_reactions,'[]'::jsonb),
    summary.my_reaction_id,
    coalesce(files.items,'[]'::jsonb)
  from public.posts p
  join public.spaces s on s.id=p.space_id and s.deleted_at is null
  join public.space_members sm
    on sm.space_id=p.space_id and sm.user_id=caller_id and sm.banned_at is null
  left join public.space_categories cat on cat.id=p.category_id
  left join lateral (
    select
      (select count(*) from public.comments c where c.post_id=p.id and c.deleted_at is null) as comment_count,
      (select count(*) from public.post_reactions r where r.post_id=p.id) as reaction_count
  ) counts on true
  left join lateral (select * from private.post_reaction_summary(p.id, caller_id)) summary on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,
      'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,
      'width',a.width,'height',a.height
    ) order by a.sort_order, a.id) as items
    from public.post_attachments a
    join public.mime_types mime on mime.content_type=a.content_type
    where a.post_id=p.id
  ) files on true
  where p.deleted_at is null
    and (p_before_id is null or (p.created_at, p.id) < (before_created_at, p_before_id))
  order by p.created_at desc, p.id desc
  limit p_limit;
end;
$$;

create function public.get_post(p_pub_id uuid)
returns table(
  post_id bigint,
  pub_id uuid,
  space_id bigint,
  title text,
  content text,
  is_anonymous boolean,
  author jsonb,
  is_mine boolean,
  category jsonb,
  pinned_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  comment_count bigint,
  reaction_count bigint,
  top_reactions jsonb,
  my_reaction_id bigint,
  attachments jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  target_id bigint;
begin
  select p.id into target_id from public.posts p where p.pub_id=p_pub_id and p.deleted_at is null;
  if not found then return; end if;
  if not private.can_access_post(target_id) then raise exception 'post access required'; end if;

  return query
  select
    p.id, p.pub_id, p.space_id, p.title, p.content, p.is_anonymous,
    private.post_author(p.author_id, p.is_anonymous),
    p.author_id=caller_id,
    case when cat.id is null then null else
      jsonb_build_object('id',cat.id,'name',cat.name,'sort_order',cat.sort_order) end,
    p.pinned_at, p.created_at, p.updated_at,
    (select count(*) from public.comments c where c.post_id=p.id and c.deleted_at is null),
    (select count(*) from public.post_reactions r where r.post_id=p.id),
    rs.top_reactions,
    rs.my_reaction_id,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,
      'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,
      'width',a.width,'height',a.height
    ) order by a.sort_order, a.id)
    from public.post_attachments a join public.mime_types mime on mime.content_type=a.content_type
    where a.post_id=p.id),'[]'::jsonb)
  from public.posts p
  left join public.space_categories cat on cat.id=p.category_id
  left join lateral (select * from private.post_reaction_summary(p.id, caller_id)) rs on true
  where p.id=target_id;
end;
$$;

-- 평면으로 내린다. 트리는 parent_id로 클라이언트가 만든다(임의 깊이라 서버에서 접기 애매하고,
-- 화면도 어차피 전부 펼친다).
--
-- 페이지네이션은 **루트 댓글 단위**다. 평면 목록을 그냥 limit으로 자르면 부모가 잘려 나간 답글이
-- 고아가 되어 트리가 끊긴다. 루트로 자르고 그 루트의 자손을 전부 딸려 보내면 스레드가 온전하다.
-- 대신 한 스레드가 아무리 길어도 통째로 내려온다 -- 답글을 자르면 트리가 깨지므로 그게 유일한 방법이고,
-- 실제로 긴 건 스레드 수지 한 스레드의 깊이가 아니다. 커서는 마지막 루트의 id다.
create function public.get_post_comments(p_post_id bigint, p_after_id bigint default null, p_limit int4 default 20)
returns table(
  comment_id bigint,
  parent_id bigint,
  content text,
  is_anonymous boolean,
  author jsonb,
  anonymous_label text,
  is_mine boolean,
  is_deleted boolean,
  created_at timestamptz,
  updated_at timestamptz,
  reaction_count bigint,
  top_reactions jsonb,
  my_reaction_id bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  after_created_at timestamptz;
  post_author_id bigint;
  post_is_anonymous boolean;
begin
  if not private.can_access_post(p_post_id) then raise exception 'post access required'; end if;
  -- null을 빼먹으면 `limit null`이 되어 상한이 통째로 사라진다(null < 1은 참이 아니라 null이라
  -- 이 가드를 그냥 지나간다). 그러면 클라이언트가 p_limit=null 한 번으로 접근 가능한 글/댓글을
  -- 전부 빨아낼 수 있다 -- 05-chat의 읽기 RPC들이 처음부터 `p_limit is null`을 함께 본 이유다.
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  select p.author_id, p.is_anonymous into post_author_id, post_is_anonymous
  from public.posts p where p.id=p_post_id;

  if p_after_id is not null then
    select c.created_at into after_created_at from public.comments c where c.id=p_after_id;
  end if;

  return query
  with recursive
  -- 익명 작성자마다 그 글 안에서만 유효한 번호를 매긴다. author_id는 절대 밖으로 안 나가고 번호만
  -- 나간다. 번호를 서버가 매기는 게 핵심이다 -- 클라이언트가 매기려면 작성자별 키가 필요한데 그게
  -- 곧 author_id고, 그러면 익명이 깨진다.
  --
  -- 페이지가 아니라 글 전체를 기준으로 센다. 페이지마다 새로 세면 2페이지의 "익명1"이 1페이지의
  -- "익명1"과 다른 사람이 되어버린다. 그리고 이 번호는 이 글 안에서만 유효하다 -- 같은 사람이 다른
  -- 글에선 다른 번호를 받으므로 여러 글에 걸쳐 "같은 익명"이라고 이어 붙일 수 없다.
  anon_index as (
    -- 삭제된 익명 댓글도 번호 매김에 포함한다(deleted_at 필터 없음). 빼면 A(익명1)가 지워질 때
    -- B가 익명2에서 익명1로 당겨져, 예전 화면·알림에 남은 "익명2"가 다른 사람을 가리키게 된다.
    -- tombstone은 author_id와 is_anonymous를 그대로 유지하므로 앵커로 쓸 수 있다. 번호는 그
    -- 작성자의 (삭제 여부 무관) 최초 댓글 시각으로 고정된다.
    select c.author_id, dense_rank() over (order by min(c.created_at), min(c.id)) as idx
    from public.comments c
    where c.post_id=p_post_id and c.is_anonymous
      -- 글쓴이 본인은 번호가 아니라 "글쓴이"로 표시하므로 번호 매김에서 뺀다.
      and not (post_is_anonymous and c.author_id=post_author_id)
    group by c.author_id
  ),
  roots as (
    select c.id, c.created_at
    from public.comments c
    where c.post_id=p_post_id and c.parent_id is null
      -- deleted_at is null이 먼저라 살아있는 댓글에는 재귀 검사가 돌지 않는다(OR 단축 평가).
      and (c.deleted_at is null or private.has_active_descendant(c.id))
      and (p_after_id is null or (c.created_at, c.id) > (after_created_at, p_after_id))
    order by c.created_at, c.id
    limit p_limit
  ),
  thread as (
    select c.id, 0 as depth
    from public.comments c
    join roots r on r.id=c.id
    union all
    select child.id, t.depth+1
    from public.comments child
    join thread t on child.parent_id=t.id
    where t.depth < 50
  )
  select
    c.id,
    c.parent_id,
    c.content,
    c.is_anonymous,
    -- tombstone은 본문도 작성자도 내리지 않는다. 남는 건 "여기 삭제된 댓글이 있었다"는 사실뿐이다.
    case when c.deleted_at is not null then null
         else private.post_author(c.author_id, c.is_anonymous) end,
    -- 익명 댓글의 표시 이름. 익명 글의 글쓴이가 자기 글에 단 댓글이면 "글쓴이"다 -- 신원은 여전히
    -- 안 드러나면서(어차피 익명 글이니까) 같은 사람임은 보인다. 글이 실명이면 "글쓴이"를 붙이면
    -- 안 된다: 글쓴이가 누군지 다 아는데 그 라벨을 달면 익명 댓글이 곧바로 까진다.
    case
      when c.deleted_at is not null or not c.is_anonymous then null
      when post_is_anonymous and c.author_id=post_author_id then '글쓴이'
      else '익명' || (select ai.idx from anon_index ai where ai.author_id=c.author_id)
    end,
    c.author_id=caller_id and c.deleted_at is null,
    c.deleted_at is not null,
    c.created_at,
    c.updated_at,
    (select count(*) from public.comment_reactions r where r.comment_id=c.id),
    rs.top_reactions,
    rs.my_reaction_id
  from thread th
  join public.comments c on c.id=th.id
  left join lateral (select * from private.comment_reaction_summary(c.id, caller_id)) rs on true
  where c.deleted_at is null or private.has_active_descendant(c.id)
  order by c.created_at, c.id;
end;
$$;

-- search_messages와 달리 security definer다. author_id의 select를 회수했으므로 invoker로는
-- 작성자를 못 붙이고, 익명 지우기도 함수 안에서 해야 한다. 대신 멤버십을 직접 확인한다.
-- title_normalized/content_normalized(생성 컬럼)로 비교해 그 위의 trgm 인덱스를 탄다 -- 정규화
-- 규칙이 컬럼 정의 한 곳에만 있어 인덱스와 절대 어긋나지 않는다.
create function public.search_posts(p_query text, p_space_id bigint)
returns table(
  post_id bigint,
  pub_id uuid,
  title text,
  content_snippet text,
  author jsonb,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare normalized_query text := private.normalize_search(p_query);
begin
  if p_space_id is null then raise exception 'space target required'; end if;
  if not private.can_participate_space(p_space_id) then raise exception 'space membership required'; end if;
  if p_query is null or char_length(btrim(p_query)) not between 1 and 200 or coalesce(normalized_query,'')='' then
    raise exception 'query must contain 1 to 200 characters';
  end if;

  return query
  select p.id, p.pub_id, p.title, left(p.content,300),
         private.post_author(p.author_id, p.is_anonymous),
         p.created_at
  from public.posts p
  where p.space_id=p_space_id
    and p.deleted_at is null
    -- 검색어의 %,_는 escape_like로 무력화한다(search_messages와 같은 이유). 둘 다 소문자로
    -- 접혀 있으니 like다.
    and (p.title_normalized like '%'||private.escape_like(normalized_query)||'%'
      or p.content_normalized like '%'||private.escape_like(normalized_query)||'%')
  order by p.created_at desc, p.id desc
  limit 50;
end;
$$;

-- 첨부 검증. 작성(create_post_with_attachments)과 수정(set_post_attachments)이 같은 규칙을
-- 써야 하므로 한 곳에 둔다. blob은 post_files_insert 정책대로 <space.pub_id>/<uuid>에 있다.
--
-- 경로에 업로더 uid가 **없다**. 있으면 그 자체가 익명을 깬다: 익명 글과 실명 글의 첨부
-- storage_path 가운데 세그먼트가 같은 uid라, 아무 멤버나 get_post 응답만으로 "이 익명 글은
-- 저 실명 글과 같은 사람"임을 확정할 수 있었다. 소유권은 이제 경로가 아니라 storage.objects의
-- owner_id로 강제한다(아래 owner_id 검사, 그리고 post_files_insert 정책). owner_id는 storage가
-- JWT에서 채우므로 클라이언트가 위조할 수 없고, 경로에는 아무 신원도 남지 않는다.
--
-- p_post_id는 "이미 이 글에 붙어 있는 첨부"를 알아보기 위한 것이다 -- 수정할 때 그 blob은
-- 24시간보다 오래됐을 수 있어 스토리지 재확인을 건너뛴다. 새 글이면 붙어 있는 게 없으니 전부
-- 새 업로드로 검사된다.
create function private.validate_post_attachments(p_post_id bigint, p_space_pub_id text, p_attachments jsonb)
returns void language plpgsql stable security definer set search_path = '' as $$
declare expected_prefix text := p_space_pub_id || '/';
begin
  if p_attachments is null or jsonb_typeof(p_attachments)<>'array' then
    raise exception 'attachments must be a json array';
  end if;
  if jsonb_array_length(p_attachments) > private.max_post_attachments() then
    raise exception 'a post carries at most % attachments', private.max_post_attachments();
  end if;

  -- 글이 받지 않는 MIME은 post_attachment_mime_types에 조인되지 않으므로 allowed.content_type is
  -- null이 곧 "허용되지 않은 타입"이다.
  if exists(
    select 1
    from jsonb_array_elements(p_attachments) as item(value)
    left join public.post_attachment_mime_types allowed on allowed.content_type=item.value->>'content_type'
    where allowed.content_type is null
      or item.value->>'storage_path' is null
      or not private.has_uuid_object_suffix(item.value->>'storage_path', expected_prefix)
      or char_length(btrim(coalesce(item.value->>'file_name','')))=0
      or (item.value->>'size_bytes')::int8 is null
      or (item.value->>'size_bytes')::int8<0
      or (item.value->>'size_bytes')::int8>allowed.max_bytes
      or (
        not exists(
          select 1 from public.post_attachments a
          where a.post_id=p_post_id and a.storage_path=item.value->>'storage_path'
        )
        and not exists(
          select 1 from storage.objects o
          where o.bucket_id='post-files'
            and o.name=item.value->>'storage_path'
            -- 내가 올린 blob만. 경로에 uid가 없어졌으므로 "남의 첨부를 자기 글에 붙이기"를
            -- 막던 일이 이 owner_id 검사로 넘어온다(예전엔 경로 prefix의 uid가 그 역할).
            -- storage.objects.owner_id는 text 컬럼이다(uuid인 owner와 헷갈리지 말 것).
            and o.owner_id=(select auth.uid())::text
            and o.created_at>=now()-interval '24 hours'
            and o.metadata->>'mimetype'=item.value->>'content_type'
            and (o.metadata->>'size')::int8=(item.value->>'size_bytes')::int8
        )
      )
  ) then raise exception 'invalid post attachment'; end if;
end;
$$;
revoke execute on function private.validate_post_attachments(bigint,text,jsonb) from public, anon, authenticated, service_role;

-- 첨부 행 삽입. 작성(create_post_with_attachments)과 수정(set_post_attachments)이 배열 순서를
-- sort_order로 매기는 같은 INSERT를 쓰므로 한 곳에 둔다. sort_order 매김 규칙이 두 군데로
-- 갈리면 조용히 어긋난다.
create function private.insert_post_attachments(p_post_id bigint, p_attachments jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.post_attachments(post_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height)
  select
    p_post_id,'post-files',
    item.value->>'storage_path',
    btrim(item.value->>'file_name'),
    item.value->>'content_type',
    (item.value->>'size_bytes')::int8,
    (item.position-1)::int4,
    (item.value->>'width')::int4,
    (item.value->>'height')::int4
  from jsonb_array_elements(p_attachments) with ordinality as item(value,position);
$$;
revoke execute on function private.insert_post_attachments(bigint,jsonb) from public, anon, authenticated, service_role;

-- 글과 첨부를 한 트랜잭션으로 만든다. 실패하면 아무것도 남지 않는다 -- 미리 올려둔 blob은 고아
-- 청소가 걷어가므로, 글을 만들었다가 되감는 보상 트랜잭션이 필요 없다(그 보상도 실패할 수 있고,
-- 실패하면 유령 글이 영구히 남는다). post_files_insert가 blob을 글이 아니라 space에 매는 이유다.
create function public.create_post_with_attachments(
  p_space_id bigint,
  p_title text,
  p_content text,
  p_attachments jsonb default '[]'::jsonb,
  p_category_id bigint default null,
  p_is_anonymous boolean default false
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  space_pub_id text;
  new_post_id bigint;
  new_pub_id uuid;
begin
  select s.pub_id into space_pub_id
  from public.spaces s where s.id=p_space_id and s.deleted_at is null;
  if not found then raise exception 'space not found'; end if;
  -- security definer라 posts_insert 정책이 적용되지 않는다 -- 같은 검사를 여기서 다시 해야
  -- 이 RPC가 post_policy를 우회하는 뒷문이 되지 않는다.
  if not private.can_post_in_space(p_space_id) then raise exception 'not allowed to post in this space'; end if;

  -- 길이 제약과 카테고리 동일 space 검사는 테이블 check와 trg_validate_post_category가 한다.
  insert into public.posts(space_id,author_id,title,content,is_anonymous,category_id)
  values(p_space_id,caller_id,p_title,p_content,coalesce(p_is_anonymous,false),p_category_id)
  returning id, pub_id into new_post_id, new_pub_id;

  perform private.validate_post_attachments(new_post_id, space_pub_id, p_attachments);
  perform private.insert_post_attachments(new_post_id, p_attachments);

  return new_pub_id;
end;
$$;

-- 수정용. 목록을 통째로 갈아끼운다 -- 첨부를 빼고 넣는 걸 한 번에 처리하려면 그게 가장 단순하고
-- sort_order도 배열 순서로 다시 매기면 된다. 빈 배열이면 첨부를 전부 없앤다.
create function public.set_post_attachments(p_post_id bigint, p_attachments jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  space_pub_id text;
begin
  -- 본문 수정과 같은 권한이다(posts_update). 관리자라도 남의 글의 첨부를 바꾸지는 못한다.
  select s.pub_id into space_pub_id
  from public.posts p
  join public.spaces s on s.id=p.space_id
  where p.id=p_post_id and p.deleted_at is null and p.author_id=caller_id
  for update of p;
  if not found then raise exception 'post author required'; end if;

  perform private.validate_post_attachments(p_post_id, space_pub_id, p_attachments);

  -- 새 목록에서 빠진 기존 첨부의 blob만 삭제 큐로 보낸다(유지되는 blob은 건드리지 않는다).
  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by)
  select a.storage_bucket, a.storage_path, caller_id
  from public.post_attachments a
  where a.post_id=p_post_id
    and not exists(
      select 1 from jsonb_array_elements(p_attachments) as item(value)
      where item.value->>'storage_path'=a.storage_path
    )
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  delete from public.post_attachments where post_id=p_post_id;
  perform private.insert_post_attachments(p_post_id, p_attachments);
end;
$$;

revoke execute on function public.list_space_posts(bigint,bigint,bigint,int4), public.list_feed_posts(bigint,int4), public.get_post(uuid), public.get_post_comments(bigint,bigint,int4), public.search_posts(text,bigint), public.create_post_with_attachments(bigint,text,text,jsonb,bigint,boolean), public.set_post_attachments(bigint,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.list_space_posts(bigint,bigint,bigint,int4), public.list_feed_posts(bigint,int4), public.get_post(uuid), public.get_post_comments(bigint,bigint,int4), public.search_posts(text,bigint), public.create_post_with_attachments(bigint,text,text,jsonb,bigint,boolean), public.set_post_attachments(bigint,jsonb) to authenticated;

-- 고정·삭제는 컬럼 grant로 표현할 수 없어서 RPC로 둔다. posts_update/comments_update 정책이
-- author_id=current_profile_id()라 "관리자가 남의 글을 고정하거나 지운다"가 정책에 안 들어가고,
-- pinned_by/deleted_by는 클라이언트가 아니라 서버가 찍어야 한다. security definer로 정책을 우회하되
-- 함수 안에서 권한을 직접 확인한다.

-- 고정은 순수 모더레이션이다 -- 작성자여도 자기 글을 고정할 수는 없다(can_manage_space만).
create function public.set_post_pinned(p_id bigint, p_pinned boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  target_space_id bigint;
begin
  -- can_manage_space가 아니라 can_curate_space다: 고정은 게시판을 정리하는 일이라 manager도 한다.
  -- (남의 글 삭제·익명 정지는 여전히 can_manage_space -- 그건 사람을 다루는 일이다.)
  -- 권한 조건을 SELECT에 합쳐 존재 오라클을 없앤다(soft_delete_post와 같은 이유).
  select space_id into target_space_id
  from public.posts
  where id=p_id and deleted_at is null and private.can_curate_space(space_id)
  for update;
  if not found then return; end if;

  update public.posts
  set pinned_at = case when p_pinned then now() else null end,
      pinned_by = case when p_pinned then caller_id else null end
  where id=p_id;
end;
$$;

-- 삭제는 작성자 본인 또는 그 space의 관리자. 메시지(soft_delete_message)는 보낸 본인만 지울 수
-- 있지만 게시물엔 모더레이션이 필요하다.
create function public.soft_delete_post(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  target_space_id bigint;
begin
  -- 권한 조건을 SELECT에 합친다. "없는 글"과 "권한 없는 글"이 똑같이 0행이 되어, 학교 전체
  -- 승인 사용자가 id를 1부터 훑으며 "예외가 뜨나 / 조용히 성공하나"로 비공개 space(징계·상담
  -- 등)에 살아있는 글이 몇 개인지 세던 오라클을 없앤다. 권한이 있으면 그 글만 잡힌다.
  select space_id into target_space_id
  from public.posts
  where id=p_id and deleted_at is null
    and (author_id=caller_id or private.can_manage_space(space_id))
  for update;
  if not found then return; end if;

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by)
  select a.storage_bucket,a.storage_path,caller_id
  from public.post_attachments a
  where a.post_id=p_id
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  delete from public.post_attachments where post_id=p_id;
  delete from public.post_reactions where post_id=p_id;

  -- 댓글은 손대지 않는다. can_access_post가 post.deleted_at을 보므로 comments_select가 알아서 막는다.
  update public.posts
  set deleted_at=now(), deleted_by=caller_id
  where id=p_id;
end;
$$;

create function public.soft_delete_comment(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  target_space_id bigint;
  target_parent_id bigint;
  targets bigint[];
begin
  -- soft_delete_post와 같은 이유로 권한 조건을 SELECT에 합친다: "없는 댓글"과 "권한 없는 댓글"이
  -- 똑같이 0행이 되어 존재 여부 오라클을 없앤다.
  select p.space_id,c.parent_id into target_space_id,target_parent_id
  from public.comments c
  join public.posts p on p.id=c.post_id
  where c.id=p_id and c.deleted_at is null
    and (c.author_id=caller_id or private.can_manage_space(p.space_id))
  for update of c;
  if not found then return; end if;

  -- 최상위 댓글은 스레드 전체를 데리고 간다(글을 지우면 댓글이 딸려 가는 것과 같다). 답글은 자기
  -- 자신만 -- 그 아래 답글은 남의 대화고, 여기서 끊으면 사슬이 orphan이 된다.
  if target_parent_id is null then
    with recursive subtree(id) as (
      select p_id
      union
      select child.id from public.comments child join subtree parent on child.parent_id=parent.id
    )
    select array_agg(id) into targets from subtree;
  else
    targets := array[p_id];
  end if;

  delete from public.comment_reactions where comment_id=any(targets);

  -- 행을 지우지 않고 본문만 비운다. 살아 있는 답글이 남으면 tombstone으로 버텨야 트리가 끊기지
  -- 않는데(comments_select의 has_active_descendant), 그때 원문이 딸려 나가면 안 된다.
  -- 이미 tombstone인 행은 건드리지 않는다 -- 원래 삭제 시각과 삭제자를 덮어쓸 이유가 없다.
  --
  -- deleted_by는 **직접 지목한 행에만** 남긴다. 딸려 간 답글에까지 caller_id를 찍으면
  -- notify_on_comment_removed(deleted_by is not null and <> author_id)가 답글 작성자 전원에게
  -- comment_removed를 쏜다 -- "당신 댓글이 모더레이션으로 삭제됐다"는 뜻인데 실제로는 스레드가
  -- 접혔을 뿐이다. 여기서 null은 "몰라서 비운 것"이 아니라 **"캐스케이드로 딸려 갔다"는 표식**이고,
  -- 그 표식이 곧 알림을 끄는 스위치다. 누가 지웠는지는 조상 tombstone의 deleted_by가 갖고 있다.
  update public.comments c
  set content=null,
      deleted_at=now(),
      deleted_by=case when c.id=p_id then caller_id else null end
  where c.id=any(targets) and c.deleted_at is null;
end;
$$;

-- 익명 글/댓글의 작성자를 **모른 채로** 그 사람의 익명 권한만 한시적으로 뺏는다. 관리자는 효과만
-- 얻고 정보는 못 얻는다(space_anonymity_suspensions의 RLS가 본인에게만 행을 보여준다).
--
-- void를 돌려주고 이미 정지 중이어도 조용히 연장만 하는 게 중요하다. "이미 정지됨" 같은 신호를
-- 주면 관리자가 익명 글 A와 B에 각각 걸어보고 **둘이 같은 사람이 썼는지** 알아낼 수 있다.
-- 만료 시각도 greatest()로 늘리기만 해서, 응답이든 상태든 관리자가 관측할 수 있는 차이를 남기지 않는다.
-- 형량은 서버가 정한다: 1일 → 2일 → 4일 → 8일 … 2배씩, 90일 상한.
--
-- 관리자가 기간을 고르지 않는 이유: 고르게 하면 그 선택 자체가 신호가 된다. 그리고 애초에 고를 수가
-- 없다 -- 이 사람이 초범인지 상습범인지 관리자는 알 수 없으니까(그게 익명의 조건이다). 서버는 이력을
-- 아니까 대신 가중한다. 관리자는 "정지"만 누르고 결과를 관측하지 못한다.
--
-- 관리자에게 결과를 돌려준다: 며칠인지, 몇 번째 누범인지, 이미 정지 중이었는지. 이미 정지 중이면
-- 형량을 쌓지 않고 남은 기간만 알려준다.
--
-- 이건 의도적으로 감수하는 유출이다. 기간(=누범 횟수)과 "이미 정지됨"을 알려주면 관리자가 익명 글
-- A와 B에 각각 걸어보고 **둘이 같은 사람인지** 알아낼 수 있다 -- 이름은 몰라도 익명 글을 작성자별로
-- 묶을 수 있고, 그 중 하나만 어디선가 새면(글에 신원 단서가 섞이면) 그 사람의 익명 글이 전부 까진다.
--
-- 그래도 받아들이는 이유:
--   1) 신원(누구인가)은 여전히 안 샌다. 새는 건 연결(같은 사람인가)뿐이다.
--   2) probe가 공짜가 아니다. "B가 A와 같은 사람인가"를 확인하려면 실제로 B 작성자를 정지시켜야 하고,
--      다른 사람이면 애먼 사람이 처벌을 먹는다. 그 사람은 알게 되고 항의한다 -- 작성자 지도를 만들려면
--      무고한 사람들에게 처벌을 뿌려야 해서 시끄럽고 티가 난다.
--   3) 관리자가 초범과 상습범을 구분하지 못하면 모더레이션이 성립하지 않는다.
--
-- 다만 이 정보는 **관리자가 실제로 행동했을 때만** 준다. 익명 글 목록에 상시로 누범 횟수를 뿌리면
-- probe 비용 없이 공짜로 작성자 지도가 나온다 -- 그건 훨씬 나쁘다.
create function private.suspend_anonymity(p_space_id bigint, p_author_id bigint)
returns table(suspended_days int4, strike_count int4, already_suspended boolean)
language plpgsql security definer set search_path = '' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  prior_strikes int4;
  prior_until timestamptz;
  effective_days int4;
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  select x.strike_count, x.suspended_until into prior_strikes, prior_until
  from public.space_anonymity_suspensions x
  where x.space_id=p_space_id and x.user_id=p_author_id
  for update;

  -- 이미 정지 중 -> 형량을 쌓지 않는다. 남은 기간과 누범 횟수만 돌려준다.
  if found and prior_until > now() then
    return query select
      ceil(extract(epoch from prior_until - now()) / 86400)::int4,
      prior_strikes,
      true;
    return;
  end if;

  -- 시간이 지났다고 누범을 자동으로 지우지 않는다. 그러면 띄엄띄엄 반복하는 사람이 영원히 초범으로
  -- 남는다. 오판이었다면 관리자가 reset_*_author_anonymity로 명시적으로 지운다.
  if not found then prior_strikes := 0; end if;

  -- 1일 → 2일 → 4일 → 8일 … 2배씩, 90일 상한.
  effective_days := least((2 ^ least(prior_strikes, 7))::int4, 90);

  insert into public.space_anonymity_suspensions(space_id,user_id,suspended_until,strike_count,suspended_by)
  values (p_space_id, p_author_id, now() + make_interval(days => effective_days), prior_strikes + 1, caller_id)
  on conflict (space_id,user_id) do update
  set suspended_until=excluded.suspended_until,
      strike_count=excluded.strike_count,
      suspended_by=excluded.suspended_by,
      created_at=now();

  return query select effective_days, prior_strikes + 1, false;
end;
$$;
revoke execute on function private.suspend_anonymity(bigint,bigint) from public, anon, authenticated, service_role;

-- 익명 글에만 쓴다. 실명 글이면 작성자가 이미 보이므로 이 우회로가 필요 없고(그냥 밴하면 된다),
-- 익명이 아닌 글에 허용하면 "이 글의 작성자"를 특정하는 도구가 하나 더 생길 뿐이다.
create function public.suspend_post_author_anonymity(p_post_id bigint)
returns table(suspended_days int4, strike_count int4, already_suspended boolean)
language plpgsql security definer set search_path = '' as $$
declare target public.posts;
begin
  select * into target from public.posts
  where id=p_post_id and deleted_at is null and is_anonymous;
  if not found then raise exception 'anonymous post required'; end if;
  return query select * from private.suspend_anonymity(target.space_id, target.author_id);
end;
$$;

create function public.suspend_comment_author_anonymity(p_comment_id bigint)
returns table(suspended_days int4, strike_count int4, already_suspended boolean)
language plpgsql security definer set search_path = '' as $$
declare target_space_id bigint; target_author_id bigint;
begin
  select p.space_id, c.author_id into target_space_id, target_author_id
  from public.comments c join public.posts p on p.id=c.post_id
  where c.id=p_comment_id and c.deleted_at is null and c.is_anonymous;
  if not found then raise exception 'anonymous comment required'; end if;
  return query select * from private.suspend_anonymity(target_space_id, target_author_id);
end;
$$;

-- 오판 취소. **현재 정지를 풀고 누범 단계를 하나 되돌린다** -- 전과 말소가 아니라 "이번 건 없던 일로"다.
-- 2회차(2일)를 취소하면 다음 위반은 다시 2회차(2일)로 들어간다. 통째로 지우면 상습범이 한 번
-- 봐줬다는 이유로 초범으로 돌아가 버린다. 단계가 0이 되면 행을 지운다(기록 없음 == 초범).
--
-- **반드시 void여야 한다.** "2회차를 취소했습니다"나 "기록이 없습니다" 같은 응답을 주면 그게 공짜
-- probe가 된다: 정지(suspend)는 다른 사람이면 애먼 사람을 처벌하는 비용이 들지만, 취소는 아무도
-- 다치지 않으므로 관리자가 익명 글을 마음껏 찔러 작성자별로 묶을 수 있다. 그건 감수하기로 한
-- 유출보다 훨씬 나쁘다. 기록이 없어도 조용히 넘어간다.

-- 관리자가 사후에 임의로 사면할 수는 없다(누가 누적을 갖고 있는지 못 보니까). 오직 그 글을 통해서만
-- 되돌릴 수 있고, 그게 이 버튼의 유일한 용도다.
create function private.undo_anonymity_suspension(p_space_id bigint, p_author_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_current_profile(true);
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  delete from public.space_anonymity_suspensions
  where space_id=p_space_id and user_id=p_author_id and strike_count <= 1;

  update public.space_anonymity_suspensions
  set suspended_until=now(), strike_count=strike_count-1
  where space_id=p_space_id and user_id=p_author_id;
end;
$$;
revoke execute on function private.undo_anonymity_suspension(bigint,bigint) from public, anon, authenticated, service_role;

create function public.undo_post_anonymity_suspension(p_post_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.posts;
begin
  select * into target from public.posts
  where id=p_post_id and deleted_at is null and is_anonymous;
  if not found then raise exception 'anonymous post required'; end if;
  perform private.undo_anonymity_suspension(target.space_id, target.author_id);
end;
$$;

create function public.undo_comment_anonymity_suspension(p_comment_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare target_space_id bigint; target_author_id bigint;
begin
  select p.space_id, c.author_id into target_space_id, target_author_id
  from public.comments c join public.posts p on p.id=c.post_id
  where c.id=p_comment_id and c.deleted_at is null and c.is_anonymous;
  if not found then raise exception 'anonymous comment required'; end if;
  perform private.undo_anonymity_suspension(target_space_id, target_author_id);
end;
$$;

create trigger trg_enforce_anonymous_allowed_posts
before insert on public.posts
for each row execute function private.enforce_anonymous_allowed();

create trigger trg_enforce_anonymous_allowed_comments
before insert on public.comments
for each row execute function private.enforce_anonymous_allowed();

-- 소프트 삭제된 글·댓글의 하드 정리. 이 경로가 없어서 지금까지 tombstone이 영원히 쌓였고,
-- 그중에는 익명 글의 author_id도 있다 -- 안 지우면 "지운 익명 글의 작성자"가 DB에 영구 보존된다.
--
-- blob은 여기서 안 지운다. storage-maintenance가 먼저 걷어간다(enqueue_due_storage_cleanup이
-- 7일 지난 삭제 글의 첨부를 큐에 넣고, complete_storage_cleanup이 post_attachments 행을 지운다).
-- 그래서 첨부 행이 아직 남아 있는 글은 **건너뛴다**. cleanup_conversation은 같은 상황에서 예외를
-- 던지지만, 여기는 배치라 그러면 글 하나 때문에 배치 전체가 죽는다 -- 다음 실행에 다시 만난다.
create function public.purge_deleted_content(
  p_older_than interval default interval '7 days',
  p_limit int4 default 100
)
returns table(purged_posts bigint, purged_comments bigint)
language plpgsql security definer set search_path = '' as $$
declare
  cutoff timestamptz;
  target_posts bigint[];
  target_comments bigint[];
  post_total bigint := 0;
  comment_total bigint := 0;
  orphan_total bigint := 0;
  removed bigint;
begin
  perform private.require_service_role();
  if p_limit not between 1 and 1000 then raise exception 'limit must be between 1 and 1000'; end if;
  if p_older_than < interval '1 day' then raise exception 'purge cutoff must be at least 1 day'; end if;
  cutoff := now() - p_older_than;

  select array_agg(t.id) into target_posts
  from (
    select p.id from public.posts p
    where p.deleted_at < cutoff
      and not exists(select 1 from public.post_attachments a where a.post_id=p.id)
    order by p.deleted_at
    limit p_limit
  ) t;

  if target_posts is not null then
    -- 글이 사라지면 그 댓글은 어차피 아무도 못 본다(can_access_post가 post.deleted_at을 본다).
    -- 살아 있는 댓글도 같이 간다 -- comments.post_id가 restrict라 남겨두면 글을 못 지운다.
    delete from public.comment_reactions cr using public.comments c
    where cr.comment_id=c.id and c.post_id=any(target_posts);
    delete from public.post_reactions where post_id=any(target_posts);
    -- parent_id가 restrict라 잎부터 벗겨야 한다. 답글->루트 2단계로는 임의 깊이를 못 지운다
    -- (cleanup_conversation이 messages에 같은 루프를 도는 것과 같은 이유).
    loop
      delete from public.comments c
      where c.post_id=any(target_posts)
        and not exists(select 1 from public.comments child where child.parent_id=c.id);
      get diagnostics removed = row_count;
      comment_total := comment_total + removed;
      exit when removed = 0;
    end loop;
    -- notifications / post_mentions / comment_mentions는 cascade라 알아서 따라간다.
    delete from public.posts where id=any(target_posts);
    get diagnostics post_total = row_count;
  end if;

  -- 살아 있는 글에 달린, 삭제된 지 오래된 댓글. 자식이 하나라도 있으면(살아 있든 죽었든) restrict
  -- 때문에 못 지운다 -- 그래서 잎만 걷는다. 자식이 전부 죽은 서브트리는 잎부터 차례로 걷혀 결국
  -- 통째로 사라지고, 살아 있는 답글이 하나라도 달린 tombstone은 계속 남는다(답글 사슬이 끊기면
  -- 안 되니 comments_select가 has_active_descendant로 그걸 계속 보여준다).
  --
  -- 배치를 id 배열로 **한 번** 고정하고 그 안에서만 벗기면 안 된다: 최상위 댓글 삭제가 서브트리를
  -- 통째로 같은 deleted_at으로 만들기 때문에 큰 트리는 배치 경계에서 잘리고, 뽑힌 p_limit개가 전부
  -- "자식이 배치 밖에 있는" 중간 노드이면 한 행도 못 지운 채 다음 실행이 같은 집합을 다시 고른다
  -- -- 영영 안 줄어든다. 매 라운드 잎을 다시 찾으면 한 겹씩 확실히 벗겨진다.
  loop
    select array_agg(t.id) into target_comments
    from (
      select c.id from public.comments c
      where c.deleted_at < cutoff
        and not exists(select 1 from public.comments child where child.parent_id=c.id)
      order by c.deleted_at
      limit p_limit - orphan_total
    ) t;
    exit when target_comments is null;

    -- soft_delete_comment가 이미 지웠지만, service_role이 직접 소프트 삭제한 행도 있을 수 있다.
    delete from public.comment_reactions where comment_id=any(target_comments);
    delete from public.comments where id=any(target_comments);
    get diagnostics removed = row_count;
    comment_total := comment_total + removed;
    orphan_total := orphan_total + removed;
    exit when orphan_total >= p_limit;
  end loop;

  return query select post_total, comment_total;
end;
$$;

revoke execute on function public.set_post_pinned(bigint,boolean), public.soft_delete_post(bigint), public.soft_delete_comment(bigint), public.suspend_post_author_anonymity(bigint), public.suspend_comment_author_anonymity(bigint), public.undo_post_anonymity_suspension(bigint), public.undo_comment_anonymity_suspension(bigint) from public, anon, authenticated, service_role;
grant execute on function public.set_post_pinned(bigint,boolean), public.soft_delete_post(bigint), public.soft_delete_comment(bigint), public.suspend_post_author_anonymity(bigint), public.suspend_comment_author_anonymity(bigint), public.undo_post_anonymity_suspension(bigint), public.undo_comment_anonymity_suspension(bigint) to authenticated;

revoke execute on function public.purge_deleted_content(interval,int4) from public, anon, authenticated, service_role;
grant execute on function public.purge_deleted_content(interval,int4) to service_role;
