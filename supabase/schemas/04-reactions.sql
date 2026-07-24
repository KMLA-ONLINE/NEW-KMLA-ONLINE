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
  -- 작성 당시 공간 정책의 스냅샷. 정책이 바뀌어도 과거 반응의 공개 범위는 바뀌지 않는다.
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comment_reactions (
  comment_id bigint not null references public.comments (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index idx_post_reactions_type_count on public.post_reactions (post_id, reaction_type_id);
create index idx_post_reactions_user_created_at on public.post_reactions (user_id, created_at);
-- 반응자 목록(get_post_reactors)의 시간순 keyset. (post_id, created_at, user_id)면 "전체" 정렬을
-- 역방향 스캔으로 잇고, 튜플 커서 비교도 이 인덱스로 받는다. type_count 인덱스는 (post_id,
-- reaction_type_id)라 시간 정렬엔 못 쓴다.
create index idx_post_reactions_post_created_at on public.post_reactions (post_id, created_at, user_id);
create index idx_comment_reactions_type_count on public.comment_reactions (comment_id, reaction_type_id);
create index idx_comment_reactions_user_created_at on public.comment_reactions (user_id, created_at);

alter table public.reaction_types
  add constraint reaction_types_key_key unique (key),
  add constraint reaction_types_key_check check (char_length(btrim(key)) between 1 and 100),
  add constraint reaction_types_name_check check (char_length(btrim(name)) between 1 and 100);

alter table public.reaction_types enable row level security;
alter table public.post_reactions enable row level security;
alter table public.comment_reactions enable row level security;

create function private.set_reaction_anonymity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_policy public.space_anonymity_policy;
begin
  if tg_table_name='post_reactions' then
    select s.anonymity_policy into target_policy
    from public.posts p join public.spaces s on s.id=p.space_id
    where p.id=new.post_id and p.deleted_at is null;
  else
    select s.anonymity_policy into target_policy
    from public.comments c
    join public.posts p on p.id=c.post_id
    join public.spaces s on s.id=p.space_id
    where c.id=new.comment_id and c.deleted_at is null and p.deleted_at is null;
  end if;
  if not found then raise exception 'reaction target not found'; end if;
  new.is_anonymous := target_policy='required';
  return new;
end;
$$;
revoke execute on function private.set_reaction_anonymity() from public, anon, authenticated, service_role;

create trigger trg_set_post_reaction_anonymity
before insert on public.post_reactions
for each row execute function private.set_reaction_anonymity();

create trigger trg_set_comment_reaction_anonymity
before insert on public.comment_reactions
for each row execute function private.set_reaction_anonymity();

create policy reaction_types_select on public.reaction_types for select to authenticated using (private.is_accepted_user());
create policy post_reactions_select on public.post_reactions for select to authenticated using (
  private.can_access_post(post_id)
  and (not is_anonymous or user_id=private.current_profile_id())
);
create policy post_reactions_insert on public.post_reactions for insert to authenticated with check (user_id=private.current_profile_id() and private.can_access_post(post_id));
create policy post_reactions_update on public.post_reactions for update to authenticated using (user_id=private.current_profile_id() and private.can_access_post(post_id)) with check (user_id=private.current_profile_id() and private.can_access_post(post_id));
create policy post_reactions_delete on public.post_reactions for delete to authenticated using (user_id=private.current_profile_id() and private.can_access_post(post_id));
create policy comment_reactions_select on public.comment_reactions for select to authenticated using (
  private.can_access_comment(comment_id)
  and (not is_anonymous or user_id=private.current_profile_id())
);
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

-- 읽기 RPC가 공유하는 상위 3개 반응 아이콘과 호출자의 반응 타입.
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

-- 실명 반응자만 최신순 keyset으로 반환한다. 익명 반응은 아래 집계 RPC로만 공개한다.
create function public.get_post_reactors(
  p_post_id bigint,
  p_reaction_type_id bigint default null,
  p_after_user_id bigint default null,
  p_limit int4 default 30
)
returns table(
  user_id bigint,
  name text,
  avatar_url text,
  reaction_type_id bigint,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  after_created_at timestamptz;
begin
  perform private.require_current_profile(true);
  if not private.can_access_post(p_post_id) then raise exception 'post access required'; end if;
  -- null 상한 가드. `p_limit < 1`은 null일 때 참이 아니라 null이라 그냥 지나가고, `limit null`은
  -- 상한이 없다는 뜻이라 접근 가능한 반응자를 한 번에 통째로 빨아낼 수 있다(다른 읽기 RPC와 동일).
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  if p_after_user_id is not null then
    select r.created_at into after_created_at
    from public.post_reactions r where r.post_id=p_post_id and r.user_id=p_after_user_id;
  end if;

  return query
  select r.user_id, pr.name, pr.avatar_url, r.reaction_type_id, r.created_at
  from public.post_reactions r
  join public.profiles pr on pr.id=r.user_id
  where r.post_id=p_post_id and not r.is_anonymous
    and (p_reaction_type_id is null or r.reaction_type_id=p_reaction_type_id)
    and (p_after_user_id is null or (r.created_at, r.user_id) < (after_created_at, p_after_user_id))
  order by r.created_at desc, r.user_id desc
  limit p_limit;
end;
$$;
revoke execute on function public.get_post_reactors(bigint,bigint,bigint,int4) from public, anon, authenticated, service_role;
grant execute on function public.get_post_reactors(bigint,bigint,bigint,int4) to authenticated;

-- 익명 반응은 개인 행이나 시각을 내리지 않고 타입별 인원수만 공개한다. 반응자 목록 RPC와 함께
-- 호출하면 프론트의 identified + anonymousCounts 계약을 구성할 수 있다.
create function public.get_post_anonymous_reaction_counts(p_post_id bigint)
returns table(reaction_type_id bigint, reaction_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_current_profile(true);
  if not private.can_access_post(p_post_id) then raise exception 'post access required'; end if;

  return query
  select r.reaction_type_id, count(*)
  from public.post_reactions r
  where r.post_id=p_post_id and r.is_anonymous
  group by r.reaction_type_id
  order by r.reaction_type_id;
end;
$$;
revoke execute on function public.get_post_anonymous_reaction_counts(bigint) from public, anon, authenticated, service_role;
grant execute on function public.get_post_anonymous_reaction_counts(bigint) to authenticated;
