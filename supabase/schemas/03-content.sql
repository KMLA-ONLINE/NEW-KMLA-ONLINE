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

create table public.post_attachments (
  id bigserial primary key,
  post_id bigint not null references public.posts (id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
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
revoke execute on function private.can_access_post(bigint), private.can_access_comment(bigint), private.has_active_descendant(bigint) from public, anon, service_role;
grant execute on function private.can_access_post(bigint), private.can_access_comment(bigint), private.has_active_descendant(bigint) to authenticated;

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

alter table public.posts enable row level security;
alter table public.post_attachments enable row level security;
alter table public.comments enable row level security;
create policy posts_select on public.posts for select to authenticated using (deleted_at is null and private.can_participate_space(space_id));
create policy posts_insert on public.posts for insert to authenticated with check (author_id=private.current_profile_id() and private.can_participate_space(space_id));
create policy posts_update on public.posts for update to authenticated using (deleted_at is null and author_id=private.current_profile_id() and private.can_participate_space(space_id)) with check (deleted_at is null and author_id=private.current_profile_id() and private.can_participate_space(space_id));
create policy post_attachments_select on public.post_attachments for select to authenticated using (private.can_access_post(post_id));

create policy comments_select on public.comments for select to authenticated using (private.can_access_post(post_id) and (deleted_at is null or private.has_active_descendant(id)));
create policy comments_insert on public.comments for insert to authenticated with check (author_id=private.current_profile_id() and private.can_access_post(post_id));
create policy comments_update on public.comments for update to authenticated using (deleted_at is null and author_id=private.current_profile_id() and private.can_access_post(post_id)) with check (deleted_at is null and author_id=private.current_profile_id() and private.can_access_post(post_id));

grant select on public.posts, public.post_attachments, public.comments to authenticated;
grant insert (space_id,author_id,title,content,is_anonymous,category_id) on public.posts to authenticated;
grant update (title,content,is_anonymous,category_id) on public.posts to authenticated;
grant insert (post_id,author_id,parent_id,content,is_anonymous) on public.comments to authenticated;
grant update (content) on public.comments to authenticated;
grant usage, select on sequence public.posts_id_seq, public.comments_id_seq to authenticated;
grant select, insert, update, delete on public.posts, public.post_attachments, public.comments to service_role;
grant usage, select on sequence public.posts_id_seq, public.post_attachments_id_seq, public.comments_id_seq to service_role;

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
