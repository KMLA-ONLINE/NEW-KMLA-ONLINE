create table public.reaction_types (
  id bigserial primary key,
  key text not null,
  name text not null,
  icon text null,
  sort_order int2 not null default 0,
  created_at timestamptz not null default now()
);

create table public.post_reactions (
  post_id bigint not null references public.posts (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comment_reactions (
  comment_id bigint not null references public.comments (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index idx_post_reactions_type_count on public.post_reactions (post_id, reaction_type_id);
create index idx_post_reactions_user_created_at on public.post_reactions (user_id, created_at);
create index idx_comment_reactions_type_count on public.comment_reactions (comment_id, reaction_type_id);
create index idx_comment_reactions_user_created_at on public.comment_reactions (user_id, created_at);

alter table public.reaction_types
  add constraint reaction_types_key_key unique (key),
  add constraint reaction_types_key_check check (char_length(btrim(key)) between 1 and 100),
  add constraint reaction_types_name_check check (char_length(btrim(name)) between 1 and 100);

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
grant select, insert, update, delete on public.reaction_types, public.post_reactions, public.comment_reactions to service_role;
grant usage, select on sequence public.reaction_types_id_seq to service_role;

-- 반응 요약(상위 3개 아이콘 + 내 반응 id). 03-content의 list_space_posts·get_post·
-- get_post_comments 세 곳에 같은 상관 서브쿼리가 복붙돼 있던 것을 함수로 모은다. post와 comment는
-- 반응 테이블이 달라 두 함수로 갈리지만 규칙은 각각 한 곳에만 산다. post_reactions를 참조하므로
-- 그 테이블이 정의된 뒤인 이 파일에 둔다(03-content가 아니라). 호출자가 전부 security definer라
-- 이 private 함수도 소유자 권한으로 실행되므로 authenticated grant는 없다.
create function private.post_reaction_summary(p_post_id bigint, p_caller_id bigint)
returns table(top_reactions jsonb, my_reaction_id bigint)
language sql stable security definer set search_path = '' as $$
  select
    coalesce((select jsonb_agg(t.icon order by t.n desc, t.icon)
      from (
        select rt.icon, count(*) as n
        from public.post_reactions r join public.reaction_types rt on rt.id=r.reaction_type_id
        where r.post_id=p_post_id and rt.icon is not null
        group by rt.icon order by count(*) desc limit 3
      ) t),'[]'::jsonb),
    (select r.reaction_type_id from public.post_reactions r where r.post_id=p_post_id and r.user_id=p_caller_id)
$$;

create function private.comment_reaction_summary(p_comment_id bigint, p_caller_id bigint)
returns table(top_reactions jsonb, my_reaction_id bigint)
language sql stable security definer set search_path = '' as $$
  select
    coalesce((select jsonb_agg(t.icon order by t.n desc, t.icon)
      from (
        select rt.icon, count(*) as n
        from public.comment_reactions r join public.reaction_types rt on rt.id=r.reaction_type_id
        where r.comment_id=p_comment_id and rt.icon is not null
        group by rt.icon order by count(*) desc limit 3
      ) t),'[]'::jsonb),
    (select r.reaction_type_id from public.comment_reactions r where r.comment_id=p_comment_id and r.user_id=p_caller_id)
$$;
revoke execute on function private.post_reaction_summary(bigint,bigint), private.comment_reaction_summary(bigint,bigint) from public, anon, authenticated, service_role;
