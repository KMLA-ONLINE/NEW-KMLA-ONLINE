create table public.posts (
  id bigserial primary key,
  pub_id uuid not null default gen_random_uuid(),
  space_id bigint not null references public.spaces (id) on delete restrict,
  author_id bigint not null references public.profiles (id) on delete restrict,
  title text not null,
  content text not null,
  is_anonymous boolean not null default false,
  pinned_at timestamptz null,
  pinned_by bigint null references public.profiles (id) on delete set null,
  comment_count int4 not null default 0,
  reaction_count int4 not null default 0,
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
  content text not null,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by bigint null references public.profiles (id) on delete set null
);

create index idx_posts_author_created_at on public.posts (author_id, created_at);
create index idx_posts_active_space_created_at on public.posts (space_id, created_at desc, id desc)
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

alter table public.posts
  add constraint posts_pub_id_key unique (pub_id),
  add constraint posts_comment_count_check check (comment_count >= 0),
  add constraint posts_reaction_count_check check (reaction_count >= 0),
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
grant insert (space_id,author_id,title,content,is_anonymous) on public.posts to authenticated;
grant update (title,content,is_anonymous) on public.posts to authenticated;
grant insert (post_id,author_id,parent_id,content,is_anonymous) on public.comments to authenticated;
grant update (content) on public.comments to authenticated;
grant usage, select on sequence public.posts_id_seq, public.comments_id_seq to authenticated;
grant select, insert, update, delete on public.posts, public.post_attachments, public.comments to service_role;
grant usage, select on sequence public.posts_id_seq, public.post_attachments_id_seq, public.comments_id_seq to service_role;
