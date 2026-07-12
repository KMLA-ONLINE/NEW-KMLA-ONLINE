create table public.posts (
  id bigserial primary key,
  pub_id uuid not null default gen_random_uuid(),
  space_id bigint not null references public.spaces (id) on delete restrict,
  author_id bigint not null references public.profiles (id) on delete restrict,
  title text not null,
  content text not null,
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

create index idx_posts_author_created_at on public.posts (author_id, created_at);
create index idx_posts_active_space_created_at on public.posts (space_id, created_at desc, id desc)
where deleted_at is null;
create index idx_posts_active_space_category on public.posts (space_id, category_id, created_at desc, id desc)
where deleted_at is null;
create index idx_posts_pinned on public.posts (space_id, pinned_at desc)
where pinned_at is not null and deleted_at is null;

create index idx_comments_tree on public.comments (post_id, parent_id, created_at);
create index idx_posts_title_search_gin on public.posts
  using gin (regexp_replace(lower(title), '\s+', '', 'g') extensions.gin_trgm_ops)
  where deleted_at is null;
create index idx_posts_content_search_gin on public.posts
  using gin (regexp_replace(lower(content), '\s+', '', 'g') extensions.gin_trgm_ops)
  where deleted_at is null;
create index idx_comments_content_search_gin on public.comments
  using gin (regexp_replace(lower(content), '\s+', '', 'g') extensions.gin_trgm_ops)
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
  with recursive descendants as (
    select c.id, c.deleted_at, 1 as depth
    from public.comments c
    where c.parent_id = p_comment_id
    union all
    select child.id, child.deleted_at, d.depth + 1
    from public.comments child
    join descendants d on child.parent_id = d.id
    where d.depth < 50
  )
  select exists (select 1 from descendants where deleted_at is null)
$$;
create function private.max_post_attachments()
returns int4 language sql immutable set search_path = '' as $$ select 10 $$;
revoke execute on function private.can_access_post(bigint), private.can_access_comment(bigint), private.has_active_descendant(bigint), private.max_post_attachments() from public, anon, service_role;
grant execute on function private.can_access_post(bigint), private.can_access_comment(bigint), private.has_active_descendant(bigint) to authenticated;

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
  if new.parent_id is not null and not exists (
    select 1
    from public.comments as parent
    where parent.id = new.parent_id
      and parent.post_id = new.post_id
      and parent.deleted_at is null
  ) then
    raise exception 'comment parent must be an active comment on the same post';
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

create trigger trg_enforce_post_attachment_shape
after insert on public.post_attachments
referencing new table as new_rows
for each statement execute function private.enforce_post_attachment_shape();

alter table public.posts enable row level security;
alter table public.post_attachment_mime_types enable row level security;
alter table public.post_attachments enable row level security;
alter table public.comments enable row level security;
create policy post_attachment_mime_types_select on public.post_attachment_mime_types for select to authenticated using (private.is_accepted_user());
create policy posts_select on public.posts for select to authenticated using (deleted_at is null and private.can_participate_space(space_id));
create policy posts_insert on public.posts for insert to authenticated with check (author_id=private.current_profile_id() and private.can_participate_space(space_id));
create policy posts_update on public.posts for update to authenticated using (deleted_at is null and author_id=private.current_profile_id() and private.can_participate_space(space_id)) with check (deleted_at is null and author_id=private.current_profile_id() and private.can_participate_space(space_id));
create policy post_attachments_select on public.post_attachments for select to authenticated using (private.can_access_post(post_id));

create policy comments_select on public.comments for select to authenticated using (private.can_access_post(post_id) and (deleted_at is null or private.has_active_descendant(id)));
create policy comments_insert on public.comments for insert to authenticated with check (author_id=private.current_profile_id() and private.can_access_post(post_id));
create policy comments_update on public.comments for update to authenticated using (deleted_at is null and author_id=private.current_profile_id() and private.can_access_post(post_id)) with check (deleted_at is null and author_id=private.current_profile_id() and private.can_access_post(post_id));

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
grant usage, select on sequence public.posts_id_seq, public.comments_id_seq to authenticated;
grant select, insert, update, delete on public.posts, public.post_attachment_mime_types, public.post_attachments, public.comments to service_role;
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
  if p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

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
  left join lateral (
    select
      (select jsonb_agg(t.icon order by t.n desc, t.icon)
       from (
         select rt.icon, count(*) as n
         from public.post_reactions r
         join public.reaction_types rt on rt.id=r.reaction_type_id
         where r.post_id=page.id and rt.icon is not null
         group by rt.icon
         order by count(*) desc
         limit 3
       ) t) as top_reactions,
      (select r.reaction_type_id from public.post_reactions r where r.post_id=page.id and r.user_id=caller_id) as my_reaction_id
  ) summary on true
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
    coalesce((select jsonb_agg(t.icon order by t.n desc, t.icon)
      from (
        select rt.icon, count(*) as n
        from public.post_reactions r join public.reaction_types rt on rt.id=r.reaction_type_id
        where r.post_id=p.id and rt.icon is not null
        group by rt.icon order by count(*) desc limit 3
      ) t),'[]'::jsonb),
    (select r.reaction_type_id from public.post_reactions r where r.post_id=p.id and r.user_id=caller_id),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,
      'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,
      'width',a.width,'height',a.height
    ) order by a.sort_order, a.id)
    from public.post_attachments a join public.mime_types mime on mime.content_type=a.content_type
    where a.post_id=p.id),'[]'::jsonb)
  from public.posts p
  left join public.space_categories cat on cat.id=p.category_id
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
  is_mine boolean,
  is_deleted boolean,
  created_at timestamptz,
  reaction_count bigint,
  top_reactions jsonb,
  my_reaction_id bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  after_created_at timestamptz;
begin
  if not private.can_access_post(p_post_id) then raise exception 'post access required'; end if;
  if p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  if p_after_id is not null then
    select c.created_at into after_created_at from public.comments c where c.id=p_after_id;
  end if;

  return query
  with recursive roots as (
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
    c.author_id=caller_id and c.deleted_at is null,
    c.deleted_at is not null,
    c.created_at,
    (select count(*) from public.comment_reactions r where r.comment_id=c.id),
    coalesce((select jsonb_agg(t.icon order by t.n desc, t.icon)
      from (
        select rt.icon, count(*) as n
        from public.comment_reactions r join public.reaction_types rt on rt.id=r.reaction_type_id
        where r.comment_id=c.id and rt.icon is not null
        group by rt.icon order by count(*) desc limit 3
      ) t),'[]'::jsonb),
    (select r.reaction_type_id from public.comment_reactions r where r.comment_id=c.id and r.user_id=caller_id)
  from thread th
  join public.comments c on c.id=th.id
  where c.deleted_at is null or private.has_active_descendant(c.id)
  order by c.created_at, c.id;
end;
$$;

-- search_messages와 달리 security definer다. author_id의 select를 회수했으므로 invoker로는
-- 작성자를 못 붙이고, 익명 지우기도 함수 안에서 해야 한다. 대신 멤버십을 직접 확인한다.
-- 공백을 지운 소문자로 비교해 idx_posts_title/content_search_gin(같은 표현식의 trgm)을 탄다.
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
declare normalized_query text := regexp_replace(lower(btrim(p_query)), '\s+', '', 'g');
begin
  if p_space_id is null then raise exception 'space target required'; end if;
  if not private.can_participate_space(p_space_id) then raise exception 'space membership required'; end if;
  if p_query is null or char_length(btrim(p_query)) not between 1 and 200 or normalized_query='' then
    raise exception 'query must contain 1 to 200 characters';
  end if;

  return query
  select p.id, p.pub_id, p.title, left(p.content,300),
         private.post_author(p.author_id, p.is_anonymous),
         p.created_at
  from public.posts p
  where p.space_id=p_space_id
    and p.deleted_at is null
    and (regexp_replace(lower(p.title),'\s+','','g') ilike '%'||normalized_query||'%'
      or regexp_replace(lower(p.content),'\s+','','g') ilike '%'||normalized_query||'%')
  order by p.created_at desc, p.id desc
  limit 50;
end;
$$;

-- 첨부 검증. 작성(create_post_with_attachments)과 수정(set_post_attachments)이 같은 규칙을
-- 써야 하므로 한 곳에 둔다. blob은 post_files_insert 정책대로 <space.pub_id>/<uid>/<uuid>에 있다.
--
-- p_post_id는 "이미 이 글에 붙어 있는 첨부"를 알아보기 위한 것이다 -- 수정할 때 그 blob은
-- 24시간보다 오래됐을 수 있어 스토리지 재확인을 건너뛴다. 새 글이면 붙어 있는 게 없으니 전부
-- 새 업로드로 검사된다.
create function private.validate_post_attachments(p_post_id bigint, p_space_pub_id text, p_attachments jsonb)
returns void language plpgsql stable security definer set search_path = '' as $$
declare expected_prefix text := p_space_pub_id || '/' || (select auth.uid())::text || '/';
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
            and o.created_at>=now()-interval '24 hours'
            and o.metadata->>'mimetype'=item.value->>'content_type'
            and (o.metadata->>'size')::int8=(item.value->>'size_bytes')::int8
        )
      )
  ) then raise exception 'invalid post attachment'; end if;
end;
$$;
revoke execute on function private.validate_post_attachments(bigint,text,jsonb) from public, anon, authenticated, service_role;

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
  if not private.can_participate_space(p_space_id) then raise exception 'space membership required'; end if;

  -- 길이 제약과 카테고리 동일 space 검사는 테이블 check와 trg_validate_post_category가 한다.
  insert into public.posts(space_id,author_id,title,content,is_anonymous,category_id)
  values(p_space_id,caller_id,p_title,p_content,coalesce(p_is_anonymous,false),p_category_id)
  returning id, pub_id into new_post_id, new_pub_id;

  perform private.validate_post_attachments(new_post_id, space_pub_id, p_attachments);

  insert into public.post_attachments(post_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height)
  select
    new_post_id,'post-files',
    item.value->>'storage_path',
    btrim(item.value->>'file_name'),
    item.value->>'content_type',
    (item.value->>'size_bytes')::int8,
    (item.position-1)::int4,
    (item.value->>'width')::int4,
    (item.value->>'height')::int4
  from jsonb_array_elements(p_attachments) with ordinality as item(value,position);

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
end;
$$;

revoke execute on function public.list_space_posts(bigint,bigint,bigint,int4), public.get_post(uuid), public.get_post_comments(bigint,bigint,int4), public.search_posts(text,bigint), public.create_post_with_attachments(bigint,text,text,jsonb,bigint,boolean), public.set_post_attachments(bigint,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.list_space_posts(bigint,bigint,bigint,int4), public.get_post(uuid), public.get_post_comments(bigint,bigint,int4), public.search_posts(text,bigint), public.create_post_with_attachments(bigint,text,text,jsonb,bigint,boolean), public.set_post_attachments(bigint,jsonb) to authenticated;

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
  select space_id into target_space_id
  from public.posts where id=p_id and deleted_at is null
  for update;
  if not found then return; end if;
  if not private.can_manage_space(target_space_id) then
    raise exception 'space manager required';
  end if;

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
  target_author_id bigint;
  target_space_id bigint;
begin
  select author_id, space_id into target_author_id, target_space_id
  from public.posts where id=p_id and deleted_at is null
  for update;
  if not found then return; end if;
  if target_author_id<>caller_id and not private.can_manage_space(target_space_id) then
    raise exception 'post author or space manager required';
  end if;

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
  target_author_id bigint;
  target_space_id bigint;
begin
  select c.author_id, p.space_id into target_author_id, target_space_id
  from public.comments c
  join public.posts p on p.id=c.post_id
  where c.id=p_id and c.deleted_at is null
  for update of c;
  if not found then return; end if;
  if target_author_id<>caller_id and not private.can_manage_space(target_space_id) then
    raise exception 'comment author or space manager required';
  end if;

  delete from public.comment_reactions where comment_id=p_id;

  -- 행을 지우지 않고 본문만 비운다. 답글이 달려 있으면 tombstone으로 남아야 트리가 끊기지 않는데
  -- (comments_select의 has_active_descendant), 그때 원문이 딸려 나가면 안 된다.
  update public.comments
  set content=null, deleted_at=now(), deleted_by=caller_id
  where id=p_id;
end;
$$;

revoke execute on function public.set_post_pinned(bigint,boolean), public.soft_delete_post(bigint), public.soft_delete_comment(bigint) from public, anon, authenticated, service_role;
grant execute on function public.set_post_pinned(bigint,boolean), public.soft_delete_post(bigint), public.soft_delete_comment(bigint) to authenticated;
