create type public.club_type as enum ('major', 'general');

create table public.clubs (
  id bigserial primary key,
  name text not null,
  description text null,
  type public.club_type not null default 'major',
  created_at timestamptz not null default now()
);

create table public.club_apply_rounds (
  id bigserial primary key,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  apply_range tstzrange generated always as (
    tstzrange(starts_at, ends_at, '[)')
  ) stored not null,
  created_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.clubs_apply (
  id bigserial primary key,
  round_id bigint not null references public.club_apply_rounds (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  club_id bigint not null references public.clubs (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index idx_club_apply_rounds_period on public.club_apply_rounds (starts_at, ends_at);
create index idx_clubs_apply_round_club_created_at on public.clubs_apply (round_id, club_id, created_at);
create index idx_clubs_apply_round_user_created_at on public.clubs_apply (round_id, user_id, created_at);
create index idx_clubs_apply_user_id on public.clubs_apply (user_id);
create index idx_clubs_apply_club_id on public.clubs_apply (club_id);

alter table public.clubs
  add constraint clubs_name_key unique (name),
  add constraint clubs_name_check check (char_length(btrim(name)) between 1 and 100),
  add constraint clubs_description_check check (
    description is null or char_length(description) <= 5000
  );

alter table public.club_apply_rounds
  add constraint club_apply_rounds_name_check check (char_length(btrim(name)) between 1 and 100),
  add constraint club_apply_rounds_period_check check (starts_at < ends_at),
  add constraint club_apply_rounds_no_overlap exclude using gist (apply_range with &&);

alter table public.clubs_apply
  add constraint clubs_apply_round_user_club_key unique (round_id, user_id, club_id);

create function private.is_club_round_open(p_round_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.club_apply_rounds where id=p_round_id and now()>=starts_at and now()<ends_at)
$$;
revoke execute on function private.is_club_round_open(bigint) from public, anon, service_role;
grant execute on function private.is_club_round_open(bigint) to authenticated;

alter table public.clubs enable row level security;
alter table public.club_apply_rounds enable row level security;
alter table public.clubs_apply enable row level security;
create policy clubs_select on public.clubs for select to authenticated using (private.is_accepted_user());
create policy club_apply_rounds_select on public.club_apply_rounds for select to authenticated using (private.is_accepted_user());
create policy clubs_apply_select on public.clubs_apply for select to authenticated using (private.is_accepted_user());
create policy clubs_apply_insert on public.clubs_apply for insert to authenticated with check (user_id=private.current_profile_id() and private.is_club_round_open(round_id));
create policy clubs_apply_delete on public.clubs_apply for delete to authenticated using (user_id=private.current_profile_id() and private.is_club_round_open(round_id));

grant select on public.clubs, public.club_apply_rounds, public.clubs_apply to authenticated;
grant insert (round_id,user_id,club_id) on public.clubs_apply to authenticated;
grant delete on public.clubs_apply to authenticated;
grant usage, select on sequence public.clubs_apply_id_seq to authenticated;
grant select, insert, update, delete on public.clubs, public.club_apply_rounds, public.clubs_apply to service_role;
grant usage, select on sequence public.clubs_id_seq, public.club_apply_rounds_id_seq, public.clubs_apply_id_seq to service_role;
