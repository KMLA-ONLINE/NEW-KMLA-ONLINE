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
