create type public.club_type as enum ('major', 'general');

create table public.clubs (
  id bigserial primary key,
  name text not null,
  description text null,
  card_description text null,
  emoji text not null default '🏫',
  image_url text null,
  meeting text null,
  location text null,
  type public.club_type not null default 'major',
  created_at timestamptz not null default now(),
  updated_at timestamptz null
);

create table public.club_apply_rounds (
  id bigserial primary key,
  name text not null,
  type public.club_type not null default 'major',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  apply_range tstzrange generated always as (
    tstzrange(starts_at, ends_at, '[)')
  ) stored not null,
  created_by bigint null
    references public.profiles (id)
    on delete set null,
  created_at timestamptz not null default now()
);

create table public.club_managers (
  club_id bigint not null
    references public.clubs (id)
    on delete restrict,
  user_id bigint not null
    references public.profiles (id)
    on delete cascade,
  assigned_by bigint null
    references public.profiles (id)
    on delete set null,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table public.club_recruitments (
  round_id bigint not null
    references public.club_apply_rounds (id)
    on delete restrict,
  club_id bigint not null
    references public.clubs (id)
    on delete restrict,
  announcement text null,
  enabled boolean not null default false,
  updated_at timestamptz null,
  primary key (round_id, club_id)
);

create table public.clubs_apply (
  id bigserial primary key,
  round_id bigint not null
    references public.club_apply_rounds (id)
    on delete restrict,
  user_id bigint not null
    references public.profiles (id)
    on delete restrict,
  club_id bigint not null
    references public.clubs (id)
    on delete restrict,
  created_at timestamptz not null default now()
);

create table public.club_settings (
  singleton boolean primary key default true,
  page_open boolean not null default true,
  updated_by bigint null
    references public.profiles (id)
    on delete set null,
  updated_at timestamptz not null default now(),
  constraint club_settings_singleton_check
    check (singleton)
);

insert into public.club_settings (
  singleton,
  page_open
)
values (true, true);

create index idx_club_managers_user_id
on public.club_managers (
  user_id,
  club_id
);

create index idx_club_recruitments_club
on public.club_recruitments (
  club_id,
  round_id
);

create index idx_clubs_apply_club_round_created_at
on public.clubs_apply (
  club_id,
  round_id,
  created_at
);

create index idx_clubs_apply_user_id
on public.clubs_apply (
  user_id
);

alter table public.clubs
  add constraint clubs_name_key
    unique (name),
  add constraint clubs_name_check
    check (
      char_length(btrim(name))
      between 1 and 100
    ),
  add constraint clubs_description_check
    check (
      description is null
      or char_length(description) <= 10000
    ),
  add constraint clubs_card_description_check
    check (
      card_description is null
      or char_length(card_description) <= 500
    ),
  add constraint clubs_emoji_check
    check (
      char_length(emoji)
      between 1 and 32
    ),
  add constraint clubs_image_url_check
    check (
      image_url is null
      or image_url ~ '^https://'
    ),
  add constraint clubs_meeting_check
    check (
      meeting is null
      or char_length(meeting) <= 200
    ),
  add constraint clubs_location_check
    check (
      location is null
      or char_length(location) <= 200
    );

alter table public.club_apply_rounds
  add constraint club_apply_rounds_name_check
    check (
      char_length(btrim(name))
      between 1 and 100
    ),
  add constraint club_apply_rounds_period_check
    check (
      starts_at < ends_at
    ),
  add constraint club_apply_rounds_no_overlap
    exclude using gist (
      type with =,
      apply_range with &&
    );

alter table public.club_recruitments
  add constraint club_recruitments_announcement_check
    check (
      announcement is null
      or char_length(announcement) <= 10000
    );

alter table public.clubs_apply
  add constraint clubs_apply_round_user_club_key
    unique (
      round_id,
      user_id,
      club_id
    ),
  add constraint clubs_apply_recruitment_fkey
    foreign key (
      round_id,
      club_id
    )
    references public.club_recruitments (
      round_id,
      club_id
    )
    on delete restrict;


-- 앱 관리자 판별은 공통 helper인 private.is_app_admin()을 사용한다.


create function private.manages_club(
  p_club_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_accepted_user()
    and exists (
      select 1
      from public.club_managers as manager
      where manager.club_id = p_club_id
        and manager.user_id =
          private.current_profile_id()
    )
$$;

revoke execute
on function private.manages_club(bigint)
from public, anon, service_role;

grant execute
on function private.manages_club(bigint)
to authenticated;


create function private.set_club_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute
on function private.set_club_updated_at()
from public, anon, authenticated, service_role;


create function private.set_club_settings_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_by := private.current_profile_id();
  new.updated_at := now();
  return new;
end;
$$;

revoke execute
on function private.set_club_settings_audit()
from public, anon, authenticated, service_role;


create function private.guard_club_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.name is distinct from old.name
    or new.type is distinct from old.type
  )
  and not coalesce(
    private.is_app_admin(),
    false
  )
  then
    raise exception using
      errcode = '42501',
      message = 'only app admins can rename or reclassify clubs';
  end if;

  return new;
end;
$$;

revoke execute
on function private.guard_club_identity()
from public, anon, authenticated, service_role;


create function private.validate_club_recruitment_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.club_apply_rounds as round
    join public.clubs as club
      on club.id = new.club_id
    where round.id = new.round_id
      and round.type = club.type
  ) then
    raise exception using
      errcode = '23514',
      message = 'club type does not match recruitment round';
  end if;

  return new;
end;
$$;

revoke execute
on function private.validate_club_recruitment_type()
from public, anon, authenticated, service_role;


create trigger trg_guard_club_identity
before update of name, type
on public.clubs
for each row
execute function private.guard_club_identity();

create trigger trg_set_clubs_updated_at
before update
on public.clubs
for each row
execute function private.set_club_updated_at();

create trigger trg_validate_club_recruitment_type
before insert or update of round_id, club_id
on public.club_recruitments
for each row
execute function private.validate_club_recruitment_type();

create trigger trg_set_club_recruitments_updated_at
before update
on public.club_recruitments
for each row
execute function private.set_club_updated_at();

create trigger trg_set_club_settings_audit
before update of page_open
on public.club_settings
for each row
execute function private.set_club_settings_audit();


create function private.is_club_round_open(
  p_round_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.club_apply_rounds as round
    where round.id = p_round_id
      and now() >= round.starts_at
      and now() < round.ends_at
  )
$$;

revoke execute
on function private.is_club_round_open(bigint)
from public, anon, service_role;

grant execute
on function private.is_club_round_open(bigint)
to authenticated;


create function private.is_club_recruiting(
  p_round_id bigint,
  p_club_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.club_settings as settings
      where settings.singleton
        and settings.page_open
    )
    and private.is_club_round_open(
      p_round_id
    )
    and exists (
      select 1
      from public.club_recruitments as recruitment
      where recruitment.round_id =
        p_round_id
        and recruitment.club_id =
          p_club_id
        and recruitment.enabled
    )
$$;

revoke execute
on function private.is_club_recruiting(
  bigint,
  bigint
)
from public, anon, service_role;

grant execute
on function private.is_club_recruiting(
  bigint,
  bigint
)
to authenticated;


create function public.get_my_club_access()
returns table (
  profile_id bigint,
  is_app_admin boolean,
  managed_club_ids bigint[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.current_profile_id(),
    private.is_app_admin(),
    coalesce(
      (
        select array_agg(
          manager.club_id
          order by manager.club_id
        )
        from public.club_managers
          as manager
        where private.is_accepted_user()
          and manager.user_id =
            private.current_profile_id()
      ),
      array[]::bigint[]
    )
$$;

revoke execute
on function public.get_my_club_access()
from public, anon;

grant execute
on function public.get_my_club_access()
to authenticated, service_role;


alter table public.clubs
  enable row level security;

alter table public.club_apply_rounds
  enable row level security;

alter table public.club_managers
  enable row level security;

alter table public.club_recruitments
  enable row level security;

alter table public.clubs_apply
  enable row level security;

alter table public.club_settings
  enable row level security;


create policy clubs_select
on public.clubs
for select
to authenticated
using (
  private.is_accepted_user()
);

create policy clubs_insert
on public.clubs
for insert
to authenticated
with check (
  private.is_accepted_user()
  and private.is_app_admin()
);


create policy clubs_update
on public.clubs
for update
to authenticated
using (
  private.is_accepted_user()
  and (
    private.is_app_admin()
    or private.manages_club(id)
  )
)
with check (
  private.is_accepted_user()
  and (
    private.is_app_admin()
    or private.manages_club(id)
  )
);


create policy club_apply_rounds_select
on public.club_apply_rounds
for select
to authenticated
using (
  private.is_accepted_user()
);

create policy club_apply_rounds_insert
on public.club_apply_rounds
for insert
to authenticated
with check (
  private.is_app_admin()
  and created_by =
    private.current_profile_id()
);

create policy club_apply_rounds_update
on public.club_apply_rounds
for update
to authenticated
using (
  private.is_app_admin()
)
with check (
  private.is_app_admin()
);

create policy club_apply_rounds_delete
on public.club_apply_rounds
for delete
to authenticated
using (
  private.is_app_admin()
  and not exists (
    select 1
    from public.club_recruitments as recruitment
    where recruitment.round_id =
      club_apply_rounds.id
  )
  and not exists (
    select 1
    from public.clubs_apply as application
    where application.round_id =
      club_apply_rounds.id
  )
);


create policy club_managers_select
on public.club_managers
for select
to authenticated
using (
  private.is_accepted_user()
);

create policy club_managers_insert
on public.club_managers
for insert
to authenticated
with check (
  private.is_app_admin()
  and assigned_by =
    private.current_profile_id()
);

create policy club_managers_delete
on public.club_managers
for delete
to authenticated
using (
  private.is_app_admin()
);


create policy club_recruitments_select
on public.club_recruitments
for select
to authenticated
using (
  private.is_accepted_user()
);

create policy club_recruitments_insert
on public.club_recruitments
for insert
to authenticated
with check (
  private.is_app_admin()
  or private.manages_club(club_id)
);

create policy club_recruitments_update
on public.club_recruitments
for update
to authenticated
using (
  private.is_app_admin()
  or private.manages_club(club_id)
)
with check (
  private.is_app_admin()
  or private.manages_club(club_id)
);

create policy club_recruitments_delete
on public.club_recruitments
for delete
to authenticated
using (
  (
    private.is_app_admin()
    or private.manages_club(club_id)
  )
  and not exists (
    select 1
    from public.clubs_apply as application
    where application.round_id =
      club_recruitments.round_id
      and application.club_id =
        club_recruitments.club_id
  )
);


create policy clubs_apply_select
on public.clubs_apply
for select
to authenticated
using (
  private.is_accepted_user()
  and (
    user_id =
      private.current_profile_id()
    or private.is_app_admin()
    or private.manages_club(club_id)
  )
);

create policy clubs_apply_insert
on public.clubs_apply
for insert
to authenticated
with check (
  private.is_accepted_user()
  and user_id =
    private.current_profile_id()
  and private.is_club_recruiting(
    round_id,
    club_id
  )
);

create policy clubs_apply_delete
on public.clubs_apply
for delete
to authenticated
using (
  private.is_app_admin()
  or private.manages_club(club_id)
);


create policy club_settings_select
on public.club_settings
for select
to authenticated
using (
  private.is_accepted_user()
);

create policy club_settings_update
on public.club_settings
for update
to authenticated
using (
  private.is_app_admin()
)
with check (
  private.is_app_admin()
  and singleton
  and updated_by =
    private.current_profile_id()
);


grant select
on public.clubs,
   public.club_apply_rounds,
   public.club_managers,
   public.club_recruitments,
   public.clubs_apply,
   public.club_settings
to authenticated;

grant insert (
  name,
  description,
  card_description,
  emoji,
  image_url,
  meeting,
  location,
  type
)
on public.clubs
to authenticated;

grant update (
  name,
  description,
  card_description,
  emoji,
  image_url,
  meeting,
  location,
  type
)
on public.clubs
to authenticated;

grant insert (
  name,
  type,
  starts_at,
  ends_at,
  created_by
)
on public.club_apply_rounds
to authenticated;

grant update (
  name,
  type,
  starts_at,
  ends_at
)
on public.club_apply_rounds
to authenticated;

grant delete
on public.club_apply_rounds
to authenticated;

grant insert (
  club_id,
  user_id,
  assigned_by
)
on public.club_managers
to authenticated;

grant delete
on public.club_managers
to authenticated;

grant insert (
  round_id,
  club_id,
  announcement,
  enabled
)
on public.club_recruitments
to authenticated;

grant update (
  announcement,
  enabled
)
on public.club_recruitments
to authenticated;

grant delete
on public.club_recruitments
to authenticated;

grant insert (
  round_id,
  user_id,
  club_id
)
on public.clubs_apply
to authenticated;

grant delete
on public.clubs_apply
to authenticated;

grant update (
  page_open
)
on public.club_settings
to authenticated;

grant usage, select
on sequence
  public.clubs_id_seq,
  public.club_apply_rounds_id_seq,
  public.clubs_apply_id_seq
to authenticated;


grant select, insert, update, delete
on public.clubs,
   public.club_apply_rounds,
   public.club_managers,
   public.club_recruitments,
   public.clubs_apply,
   public.club_settings
to service_role;

grant usage, select
on sequence
  public.clubs_id_seq,
  public.club_apply_rounds_id_seq,
  public.clubs_apply_id_seq
to service_role;
