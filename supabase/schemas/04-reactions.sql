create table public.reaction_types (
  id bigserial primary key,
  key text not null,
  name text not null,
  icon text null,
  sort_order int2 not null default 0,
  created_at timestamptz not null default now()
);

create table public.post_reactions (
  id bigserial primary key,
  post_id bigint not null references public.posts (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz null
);

create table public.comment_reactions (
  id bigserial primary key,
  comment_id bigint not null references public.comments (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz null
);

create index idx_post_reactions_type_count on public.post_reactions (post_id, reaction_type_id);
create index idx_post_reactions_user_created_at on public.post_reactions (user_id, created_at);
create index idx_comment_reactions_type_count on public.comment_reactions (comment_id, reaction_type_id);
create index idx_comment_reactions_user_created_at on public.comment_reactions (user_id, created_at);

alter table public.reaction_types
  add constraint reaction_types_key_key unique (key),
  add constraint reaction_types_key_check check (char_length(btrim(key)) between 1 and 100),
  add constraint reaction_types_name_check check (char_length(btrim(name)) between 1 and 100);

alter table public.post_reactions
  add constraint post_reactions_post_user_key unique (post_id, user_id);
alter table public.comment_reactions
  add constraint comment_reactions_comment_user_key unique (comment_id, user_id);

alter table public.reaction_types enable row level security;
alter table public.post_reactions enable row level security;
alter table public.comment_reactions enable row level security;
create policy reaction_types_select on public.reaction_types for select to authenticated using (private.is_accepted_user());
create policy post_reactions_select on public.post_reactions for select to authenticated using (private.can_access_post(post_id));
create policy post_reactions_insert on public.post_reactions for insert to authenticated with check (user_id=private.current_profile_id() and private.can_access_post(post_id));
create policy post_reactions_update on public.post_reactions for update to authenticated using (user_id=private.current_profile_id() and private.can_access_post(post_id)) with check (user_id=private.current_profile_id() and private.can_access_post(post_id));
create policy post_reactions_delete on public.post_reactions for delete to authenticated using (user_id=private.current_profile_id() and private.can_access_post(post_id));
create policy comment_reactions_select on public.comment_reactions for select to authenticated using (private.can_access_comment(comment_id));
create policy comment_reactions_insert on public.comment_reactions for insert to authenticated with check (user_id=private.current_profile_id() and private.can_access_comment(comment_id));
create policy comment_reactions_update on public.comment_reactions for update to authenticated using (user_id=private.current_profile_id() and private.can_access_comment(comment_id)) with check (user_id=private.current_profile_id() and private.can_access_comment(comment_id));
create policy comment_reactions_delete on public.comment_reactions for delete to authenticated using (user_id=private.current_profile_id() and private.can_access_comment(comment_id));

grant select on public.reaction_types, public.post_reactions, public.comment_reactions to authenticated;
grant insert (post_id,user_id,reaction_type_id) on public.post_reactions to authenticated;
grant insert (comment_id,user_id,reaction_type_id) on public.comment_reactions to authenticated;
grant update (reaction_type_id) on public.post_reactions,public.comment_reactions to authenticated;
grant delete on public.post_reactions,public.comment_reactions to authenticated;
grant usage, select on sequence public.post_reactions_id_seq, public.comment_reactions_id_seq to authenticated;
grant select, insert, update, delete on public.reaction_types, public.post_reactions, public.comment_reactions to service_role;
grant usage, select on sequence public.reaction_types_id_seq, public.post_reactions_id_seq, public.comment_reactions_id_seq to service_role;
