create table public.gongangs (
  id bigserial primary key,
  location public.gongang_location not null,
  owner_id bigint not null references public.profiles (id) on delete restrict,
  day_of_week int2 not null,
  start_minute int2 not null,
  end_minute int2 not null,
  valid_from date not null,
  valid_until date not null,
  time_range int4range generated always as (
    int4range(start_minute::int4, end_minute::int4, '[)')
  ) stored not null,
  validity_range daterange generated always as (
    daterange(valid_from, valid_until, '[]')
  ) stored not null,
  created_at timestamptz not null default now()
);

create table public.song_requests (
  id bigserial primary key,
  requester_id bigint not null references public.profiles (id) on delete restrict,
  url text not null,
  requested_at timestamptz not null default now()
);
