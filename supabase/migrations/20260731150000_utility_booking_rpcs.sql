create type public.utility_booking_type as enum (
  'gongang',
  'karaoke'
);

create table public.utility_bookings (
  id bigserial primary key,
  booking_type public.utility_booking_type not null,
  booking_date date not null,
  slot_key text not null,
  location public.gongang_location null,
  detail text not null,
  owner_id bigint not null
    references public.profiles (id)
    on delete restrict,
  created_by bigint not null
    references public.profiles (id)
    on delete restrict,
  created_at timestamptz not null default now()
);

create unique index utility_bookings_gongang_slot_key
on public.utility_bookings (
  booking_date,
  slot_key,
  location
)
where booking_type = 'gongang';

create unique index utility_bookings_karaoke_slot_key
on public.utility_bookings (
  booking_date,
  slot_key
)
where booking_type = 'karaoke';

alter table public.utility_bookings
  add constraint utility_bookings_slot_key_check
    check (
      char_length(btrim(slot_key))
      between 1 and 40
    ),
  add constraint utility_bookings_detail_check
    check (
      char_length(btrim(detail))
      between 1 and 500
    ),
  add constraint utility_bookings_location_check
    check (
      (
        booking_type = 'gongang'
        and location is not null
      )
      or (
        booking_type = 'karaoke'
        and location is null
      )
    );

create function private.current_utility_week_start()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select
    timezone(
      'Asia/Seoul',
      now()
    )::date
    - (
      extract(
        isodow from timezone(
          'Asia/Seoul',
          now()
        )
      )::int - 1
    )
$$;

create function private.is_utility_master(
  p_booking_type public.utility_booking_type
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_app_admin()
    or private.has_permission(
      p_booking_type::text
      || '_master'
    )
$$;

revoke execute
on function private.current_utility_week_start()
from public, anon, authenticated, service_role;

revoke execute
on function private.is_utility_master(
  public.utility_booking_type
)
from public, anon, authenticated, service_role;

alter table public.utility_bookings
  enable row level security;

revoke all
on public.utility_bookings
from public, anon, authenticated;

grant select, insert, update, delete
on public.utility_bookings
to service_role;

grant usage, select
on sequence public.utility_bookings_id_seq
to service_role;

create function public.get_my_utility_access()
returns table (
  profile_id bigint,
  can_gongang boolean,
  can_karaoke boolean,
  manages_gongang boolean,
  manages_karaoke boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.current_profile_id(),
    (
      private.has_permission('gongang')
      or private.is_utility_master('gongang')
    ),
    (
      private.has_permission('karaoke')
      or private.is_utility_master('karaoke')
    ),
    private.is_utility_master('gongang'),
    private.is_utility_master('karaoke')
$$;

create function public.get_current_utility_bookings()
returns table (
  booking_id bigint,
  booking_type public.utility_booking_type,
  booking_date date,
  slot_key text,
  location public.gongang_location,
  detail text,
  owner_id bigint,
  owner_label text,
  is_mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id bigint;
  v_week_start date;
begin
  v_profile_id :=
    private.require_current_profile(true);

  v_week_start :=
    private.current_utility_week_start();

  return query
  select
    booking.id,
    booking.booking_type,
    booking.booking_date,
    booking.slot_key,
    booking.location,
    booking.detail,
    booking.owner_id,
    case
      when profile.cohort is null
        then profile.name
      else
        profile.cohort::text
        || '기 '
        || profile.name
    end,
    booking.owner_id = v_profile_id
  from public.utility_bookings as booking
  join public.profiles as profile
    on profile.id = booking.owner_id
  where booking.booking_date
      between v_week_start
          and v_week_start + 6
    and (
      (
        booking.booking_type = 'gongang'
        and (
          private.has_permission('gongang')
          or private.is_utility_master('gongang')
        )
      )
      or (
        booking.booking_type = 'karaoke'
        and (
          private.has_permission('karaoke')
          or private.is_utility_master('karaoke')
        )
      )
    )
  order by
    booking.booking_date,
    booking.booking_type,
    booking.slot_key,
    booking.location;
end;
$$;

create function public.create_utility_booking(
  p_booking_type public.utility_booking_type,
  p_booking_date date,
  p_slot_key text,
  p_detail text,
  p_location public.gongang_location default null,
  p_owner_label text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id bigint;
  v_owner_id bigint;
  v_owner_count bigint;
  v_week_start date;
  v_is_master boolean;
  v_booking_id bigint;
  v_is_weekend boolean;
begin
  v_actor_id :=
    private.require_current_profile(true);

  v_is_master :=
    private.is_utility_master(
      p_booking_type
    );

  if not (
    private.has_permission(
      p_booking_type::text
    )
    or v_is_master
  ) then
    raise exception using
      errcode = '42501',
      message = '예약 권한이 없습니다.';
  end if;

  v_week_start :=
    private.current_utility_week_start();

  if p_booking_date
    not between v_week_start
        and v_week_start + 6
  then
    raise exception using
      errcode = '22023',
      message = '이번 주 일정만 신청할 수 있습니다.';
  end if;

  if p_booking_type = 'gongang' then
    if p_location is null then
      raise exception using
        errcode = '22023',
        message = '공강 장소가 필요합니다.';
    end if;

    if p_slot_key not in (
      'study-1',
      'honjeong-end',
      'study-2'
    ) then
      raise exception using
        errcode = '22023',
        message = '올바르지 않은 공강 시간입니다.';
    end if;
  else
    if p_location is not null then
      raise exception using
        errcode = '22023',
        message = '노래방 예약에는 층을 지정할 수 없습니다.';
    end if;

    v_is_weekend :=
      extract(
        isodow from p_booking_date
      )::int in (6, 7);

    if (
      not v_is_weekend
      and p_slot_key not in (
        'lunch',
        'dinner'
      )
    ) or (
      v_is_weekend
      and p_slot_key not in (
        'hour-8',
        'hour-9',
        'hour-10',
        'hour-11',
        'hour-12',
        'hour-13',
        'hour-14',
        'hour-15',
        'hour-16',
        'hour-17',
        'hour-18'
      )
    ) then
      raise exception using
        errcode = '22023',
        message = '올바르지 않은 노래방 시간입니다.';
    end if;
  end if;

  if char_length(
    btrim(p_detail)
  ) not between 1 and 500
  then
    raise exception using
      errcode = '22023',
      message = '신청 내용을 입력해 주세요.';
  end if;

  v_owner_id := v_actor_id;

  if nullif(
    btrim(p_owner_label),
    ''
  ) is not null
  then
    if not v_is_master then
      raise exception using
        errcode = '42501',
        message = '신청자를 변경할 권한이 없습니다.';
    end if;

    select
      min(profile.id),
      count(*)
    into
      v_owner_id,
      v_owner_count
    from public.profiles as profile
    where profile.status = 'accepted'
      and profile.deleted_at is null
      and (
        case
          when profile.cohort is null
            then profile.name
          else
            profile.cohort::text
            || '기 '
            || profile.name
        end
      ) = btrim(p_owner_label);

    if v_owner_count <> 1 then
      raise exception using
        errcode = '22023',
        message = '신청자를 정확히 찾을 수 없습니다.';
    end if;
  end if;

  insert into public.utility_bookings (
    booking_type,
    booking_date,
    slot_key,
    location,
    detail,
    owner_id,
    created_by
  )
  values (
    p_booking_type,
    p_booking_date,
    btrim(p_slot_key),
    p_location,
    btrim(p_detail),
    v_owner_id,
    v_actor_id
  )
  returning id
  into v_booking_id;

  return v_booking_id;

exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = '이미 신청된 시간입니다.';
end;
$$;

create function public.cancel_utility_booking(
  p_booking_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id bigint;
  v_owner_id bigint;
  v_booking_type public.utility_booking_type;
begin
  v_actor_id :=
    private.require_current_profile(true);

  select
    booking.owner_id,
    booking.booking_type
  into
    v_owner_id,
    v_booking_type
  from public.utility_bookings as booking
  where booking.id = p_booking_id
  for update;

  if not found then
    raise exception using
      errcode = '22023',
      message = '예약을 찾을 수 없습니다.';
  end if;

  if v_owner_id <> v_actor_id
    and not private.is_utility_master(
      v_booking_type
    )
  then
    raise exception using
      errcode = '42501',
      message = '예약을 취소할 권한이 없습니다.';
  end if;

  delete from public.utility_bookings
  where id = p_booking_id;

  return true;
end;
$$;

create function public.reset_current_utility_bookings(
  p_booking_type public.utility_booking_type
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week_start date;
  v_deleted integer;
begin
  perform private.require_current_profile(true);

  if not private.is_utility_master(
    p_booking_type
  ) then
    raise exception using
      errcode = '42501',
      message = '초기화 권한이 없습니다.';
  end if;

  v_week_start :=
    private.current_utility_week_start();

  delete from public.utility_bookings
  where booking_type = p_booking_type
    and booking_date
      between v_week_start
          and v_week_start + 6;

  get diagnostics
    v_deleted = row_count;

  return v_deleted;
end;
$$;

revoke execute
on function public.get_my_utility_access()
from public, anon;

revoke execute
on function public.get_current_utility_bookings()
from public, anon;

revoke execute
on function public.create_utility_booking(
  public.utility_booking_type,
  date,
  text,
  text,
  public.gongang_location,
  text
)
from public, anon;

revoke execute
on function public.cancel_utility_booking(bigint)
from public, anon;

revoke execute
on function public.reset_current_utility_bookings(
  public.utility_booking_type
)
from public, anon;

grant execute
on function public.get_my_utility_access(),
   public.get_current_utility_bookings(),
   public.create_utility_booking(
     public.utility_booking_type,
     date,
     text,
     text,
     public.gongang_location,
     text
   ),
   public.cancel_utility_booking(bigint),
   public.reset_current_utility_bookings(
     public.utility_booking_type
   )
to authenticated, service_role;

insert into public.permissions (
  key,
  name,
  description
)
values
  (
    'gongang_master',
    '공강 마스터',
    '공강 신청자를 지정하고 예약을 초기화합니다.'
  ),
  (
    'karaoke_master',
    '노래방 마스터',
    '노래방 신청자를 지정하고 예약을 초기화합니다.'
  )
on conflict (key)
do update set
  name = excluded.name,
  description = excluded.description;
