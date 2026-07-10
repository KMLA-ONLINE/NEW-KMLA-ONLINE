create type public.gongang_location as enum ('floor_b1', 'floor_2', 'floor_4', 'floor_10');

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

create index idx_gongangs_owner on public.gongangs (owner_id);
create index idx_gongangs_location_time on public.gongangs (location, day_of_week, start_minute);
create index idx_song_requests_requester_requested_at on public.song_requests (requester_id, requested_at);
create index idx_song_requests_requested_at on public.song_requests (requested_at);

alter table public.gongangs
  add constraint gongangs_day_of_week_check check (day_of_week between 0 and 6),
  add constraint gongangs_start_minute_check check (start_minute between 0 and 1439),
  add constraint gongangs_end_minute_check check (end_minute between 1 and 1440),
  add constraint gongangs_time_order_check check (start_minute < end_minute),
  add constraint gongangs_validity_check check (valid_from <= valid_until),
  add constraint gongangs_no_overlap exclude using gist (
    location with =,
    day_of_week with =,
    time_range with &&,
    validity_range with &&
  );

alter table public.song_requests
  add constraint song_requests_url_check check (
    char_length(url) between 1 and 2048
    and url ~ '^https://'
  );

alter table public.gongangs enable row level security;
alter table public.song_requests enable row level security;
create policy gongangs_select on public.gongangs for select to authenticated using (private.has_permission('gongang'));
create policy gongangs_insert on public.gongangs for insert to authenticated with check (owner_id=private.current_profile_id() and private.has_permission('gongang'));
create policy gongangs_update on public.gongangs for update to authenticated using (owner_id=private.current_profile_id() and private.has_permission('gongang')) with check (owner_id=private.current_profile_id() and private.has_permission('gongang'));
create policy gongangs_delete on public.gongangs for delete to authenticated using (owner_id=private.current_profile_id() and private.has_permission('gongang'));
create policy song_requests_select on public.song_requests for select to authenticated using (private.has_permission('karaoke'));
create policy song_requests_insert on public.song_requests for insert to authenticated with check (requester_id=private.current_profile_id() and private.has_permission('karaoke'));

grant select on public.gongangs, public.song_requests to authenticated;
grant insert (location,owner_id,day_of_week,start_minute,end_minute,valid_from,valid_until) on public.gongangs to authenticated;
grant update (location,day_of_week,start_minute,end_minute,valid_from,valid_until) on public.gongangs to authenticated;
grant delete on public.gongangs to authenticated;
grant insert (requester_id,url) on public.song_requests to authenticated;
grant usage, select on sequence public.gongangs_id_seq, public.song_requests_id_seq to authenticated;
grant select, insert, update, delete on public.gongangs, public.song_requests to service_role;
grant usage, select on sequence public.gongangs_id_seq, public.song_requests_id_seq to service_role;
