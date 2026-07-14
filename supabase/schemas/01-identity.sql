create type public.app_role as enum ('user', 'admin');
create type public.profile_gender as enum ('male', 'female');
create type public.profile_track as enum ('domestic', 'international');
create type public.profile_type as enum ('student', 'teacher', 'alumni');
create type public.profile_status as enum ('none', 'pending', 'accepted', 'rejected', 'withdrawn');

create table public.profile_departments (
  name text primary key
);

create table public.profiles (
  id bigserial primary key,
  auth_user_id uuid null references auth.users (id) on delete set null,
  name text not null,
  role public.app_role not null default 'user',
  type public.profile_type not null default 'student',
  student_number char(6) null,
  class_no int2 null,
  cohort int2 null,
  gender public.profile_gender null,
  track public.profile_track null,
  department text null references public.profile_departments (name) on update cascade on delete set null,
  phone_number text null,
  avatar_url text null,
  cover_image_url text null,
  birthday date null,
  description text null,
  status public.profile_status not null default 'none',
  dorm_room int2 null,
  is_reenrolled boolean not null default false,
  onboarding_completed_at timestamptz null,
  status_updated_at timestamptz null,
  status_updated_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  deleted_at timestamptz null
);

-- 이 사용자의 암호학적 신원. profiles가 사회적 신원이라면 이건 그 옆에 걸린 열쇠고리다.
-- 1:1 대화는 종단간 암호화되어 있고(docs/e2ee.md), 그 키가 전부 여기서 시작한다.
--
-- 서버는 이 테이블의 무엇으로도 DM을 읽을 수 없다. wrapped_user_key는 비밀번호에서
-- 유도된 encKey로 봉인돼 있고 encKey는 브라우저를 떠나지 않는다 -- Supabase Auth가 받는
-- 값은 같은 masterKey에서 HKDF로 갈라져 나온, 이것과 아무 관계 없는 authHash다.
create table public.user_keys (
  user_id bigint primary key references public.profiles (id) on delete cascade,
  -- X25519 공개키. 오프라인인 상대에게도 메시지 키를 봉인할 수 있어야 하므로
  -- accepted 사용자 모두가 읽는다. 아래 컬럼 grant에서 유일하게 열려 있는 값이다.
  identity_public_key bytea not null,
  wrapped_user_key bytea not null,
  wrapped_identity_secret_key bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz null
);

create table public.permissions (
  key text primary key,
  name text not null,
  description text null,
  created_at timestamptz not null default now()
);

create table public.user_permissions (
  user_id bigint not null references public.profiles (id) on delete restrict,
  permission_key text not null references public.permissions (key) on delete restrict,
  granted_at timestamptz not null default now(),
  granted_by bigint null references public.profiles (id) on delete set null,
  primary key (user_id, permission_key)
);

create index idx_profiles_status_deleted_at on public.profiles (status, deleted_at);

alter table public.profile_departments
  add constraint profile_departments_name_check check (char_length(btrim(name)) between 1 and 50);

alter table public.profiles
  add constraint profiles_auth_user_id_key unique (auth_user_id),
  add constraint profiles_student_number_key unique (student_number),
  add constraint profiles_cohort_check check (cohort is null or cohort between 1 and 100),
  add constraint profiles_class_no_check check (class_no is null or class_no > 0),
  add constraint profiles_student_number_check check (student_number is null or student_number ~ '^\d{6}$'),
  add constraint profiles_phone_number_check check (phone_number is null or phone_number ~ '^\+?[0-9]{8,15}$'),
  add constraint profiles_dorm_room_check check (dorm_room is null or dorm_room > 0),
  add constraint profiles_student_identity_check check (
    deleted_at is not null
    or status = 'none'
    or type <> 'student'
    or (student_number is not null and cohort is not null)
  ),
  -- Track is the student's 국내반/국제반 stream, so only students carry one.
  -- Same exemption as profiles_student_identity_check above.
  add constraint profiles_track_required_check check (
    deleted_at is not null
    or status = 'none'
    or type <> 'student'
    or track is not null
  ),
  add constraint profiles_name_check check (char_length(btrim(name)) between 1 and 50),
  add constraint profiles_description_check check (
    description is null or char_length(description) <= 2000
  );

-- 봉인된 blob은 version(1) + nonce(12) + 32바이트 키 + GCM 태그(16) = 61바이트다. 범위로 두는
-- 이유는 AEAD나 봉인 형식을 바꾸면 길이가 달라지기 때문 -- 그래도 "봉인된 32바이트 키" 말고는
-- 아무것도 이 안에 들어맞지 않는다.
alter table public.user_keys
  add constraint user_keys_identity_public_key_check check (octet_length(identity_public_key) = 32),
  add constraint user_keys_wrapped_user_key_check check (octet_length(wrapped_user_key) between 48 and 128),
  add constraint user_keys_wrapped_identity_secret_key_check check (octet_length(wrapped_identity_secret_key) between 48 and 128);

create function private.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name text;
begin
  display_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      '사용자'
    ),
    50
  );

  insert into public.profiles (auth_user_id, name)
  values (new.id, display_name);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_auth_user_created();

create function private.current_profile_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles as p
  where p.auth_user_id = (select auth.uid())
  order by p.id
  limit 1
$$;

create function private.is_accepted_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.auth_user_id = (select auth.uid())
      and p.status = 'accepted'
      and p.deleted_at is null
  )
$$;

revoke execute on function private.handle_auth_user_created() from public, anon, authenticated, service_role;
revoke execute on function private.current_profile_id() from public, anon, authenticated, service_role;
revoke execute on function private.is_accepted_user() from public, anon, authenticated, service_role;

create function private.is_app_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where auth_user_id=(select auth.uid()) and status='accepted' and deleted_at is null and role='admin')
$$;
create function private.has_permission(p_permission_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_accepted_user() and exists(select 1 from public.user_permissions where user_id=private.current_profile_id() and permission_key=p_permission_key)
$$;
revoke execute on function private.is_app_admin() from public, anon, service_role;
revoke execute on function private.has_permission(text) from public, anon, service_role;
grant execute on function private.is_app_admin(), private.has_permission(text) to authenticated;

-- Scrubs identity/profile fields for a withdrawal. Leaves auth_user_id untouched:
-- self-withdrawal keeps the auth link, and auth-user deletion nulls it via the FK's ON DELETE SET NULL.
create function private.anonymize_profile(p_profile_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- 탈퇴하면 열쇠고리도 같이 태운다. 남겨둬 봐야 아무도 열 수 없는 blob일 뿐이고
  -- (userKey를 푸는 비밀번호는 애초에 서버에 없다), 상대방 쪽 히스토리는 상대의
  -- 키로 그대로 읽힌다. 재가입하면 새 신원키를 받고, 예전 DM은 영영 안 열린다 --
  -- 종단간 암호화가 뜻하는 바가 그거다.
  delete from public.user_keys where user_id = p_profile_id;

  update public.profiles
  set name = '탈퇴한 사용자',
      role = 'user',
      student_number = null,
      class_no = null,
      cohort = null,
      gender = null,
      track = null,
      department = null,
      phone_number = null,
      avatar_url = null,
      cover_image_url = null,
      birthday = null,
      description = null,
      status = 'withdrawn',
      dorm_room = null,
      is_reenrolled = false,
      status_updated_at = now(),
      status_updated_by = null,
      deleted_at = now()
  where id = p_profile_id;
end;
$$;

revoke execute on function private.anonymize_profile(bigint) from public, anon, authenticated, service_role;

create function private.handle_auth_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_id bigint;
begin
  select id into profile_id from public.profiles where auth_user_id = old.id for update;
  if profile_id is null then
    return old;
  end if;

  if exists (
    select 1 from public.profiles where id = profile_id and role = 'admin'
  ) or exists (
    select 1
    from public.space_members as sm
    join public.spaces as s on s.id = sm.space_id
    where sm.user_id = profile_id
      and sm.role = 'owner'
      and s.deleted_at is null
  ) then
    raise exception 'transfer owner/admin responsibilities before deleting auth user';
  end if;

  perform private.anonymize_profile(profile_id);

  return old;
end;
$$;

create trigger on_auth_user_deleted
before delete on auth.users
for each row execute function private.handle_auth_user_deleted();

revoke execute on function private.handle_auth_user_deleted() from public, anon, authenticated, service_role;

create function private.require_current_profile(p_accepted boolean default true)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile_id bigint;
begin
  select p.id into profile_id
  from public.profiles as p
  where p.auth_user_id = (select auth.uid())
    and p.deleted_at is null
    and (not p_accepted or p.status = 'accepted');
  if profile_id is null then raise exception 'active profile required'; end if;
  return profile_id;
end;
$$;

create function private.require_app_admin()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare profile_id bigint := private.require_current_profile(true);
begin
  if not exists (select 1 from public.profiles where id = profile_id and role = 'admin') then
    raise exception 'app admin required';
  end if;
  return profile_id;
end;
$$;

revoke execute on function private.require_current_profile(boolean) from public, anon, authenticated, service_role;
revoke execute on function private.require_app_admin() from public, anon, authenticated, service_role;

alter table public.profile_departments enable row level security;
alter table public.profiles enable row level security;
alter table public.user_keys enable row level security;
alter table public.permissions enable row level security;
alter table public.user_permissions enable row level security;

create policy profile_departments_select
on public.profile_departments
for select
to authenticated
using (true);

create policy profiles_select
on public.profiles
for select
to authenticated
using (
  id = (select private.current_profile_id())
  or (
    (select private.is_accepted_user())
    and status = 'accepted'
    and deleted_at is null
  )
);

create policy profiles_update
on public.profiles
for update
to authenticated
using (
  id = (select private.current_profile_id())
  and (select private.is_accepted_user())
)
with check (
  id = (select private.current_profile_id())
  and (select private.is_accepted_user())
);

-- 행은 accepted 사용자 모두에게 보이지만, 아래 컬럼 grant가 identity_public_key 하나만
-- 남기고 봉인된 blob을 전부 회수한다. 행 단위로는 이 구분을 표현할 수 없어서다.
--
-- 굳이 회수하는 이유: wrapped_user_key는 *비밀번호에서 유도된* 키로 봉인돼 있다. 테이블
-- 전체 select를 주면 같은 학교 아무나 반 친구들 것을 통째로 긁어다 약한 비밀번호를 오프라인
-- 에서 때릴 수 있다. 지금은 그게 DB 유출 시나리오지 로그인한 학생 시나리오가 아니다.
create policy user_keys_select
on public.user_keys
for select
to authenticated
using (
  user_id = (select private.current_profile_id())
  or (
    (select private.is_accepted_user())
    and exists (
      select 1 from public.profiles as p
      where p.id = user_id and p.status = 'accepted' and p.deleted_at is null
    )
  )
);

create policy permissions_select
on public.permissions
for select
to authenticated
using ((select private.is_accepted_user()));

create policy user_permissions_select
on public.user_permissions
for select
to authenticated
using (user_id = (select private.current_profile_id()));

grant usage on schema public, private to authenticated;
grant execute on function private.current_profile_id() to authenticated;
grant execute on function private.is_accepted_user() to authenticated;

grant select on table public.profile_departments, public.profiles, public.permissions, public.user_permissions to authenticated;
grant update (name, gender, phone_number, birthday, description) on table public.profiles
to authenticated;

-- 공개키만. 봉인된 blob은 public.get_my_key_vault()로만 나가고, 그 함수는 호출자 행으로
-- 스스로를 가둔다. 쓰기는 아예 없다 -- bytea를 base64로 넘겨받는 세 RPC가 유일한 문이다.
grant select (user_id, identity_public_key, created_at, updated_at) on table public.user_keys to authenticated;

grant usage on schema public, private to service_role;
grant select, insert, update, delete
on table public.profile_departments, public.profiles, public.user_keys, public.permissions, public.user_permissions
to service_role;
grant usage, select on sequence public.profiles_id_seq to service_role;

create function public.submit_onboarding(p_name text,p_type public.profile_type,p_student_number char(6),p_class_no int2,p_cohort int2,p_gender public.profile_gender,p_track public.profile_track,p_department text,p_is_reenrolled boolean,p_phone_number text,p_birthday date,p_description text,p_dorm_room int2)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(false);
begin
  update public.profiles set name=btrim(p_name),type=p_type,student_number=p_student_number,class_no=p_class_no,cohort=p_cohort,gender=p_gender,track=p_track,department=nullif(btrim(p_department),''),is_reenrolled=coalesce(p_is_reenrolled,false),phone_number=p_phone_number,birthday=p_birthday,description=p_description,dorm_room=p_dorm_room,onboarding_completed_at=now(),status='pending',status_updated_at=now(),status_updated_by=null
  where id=caller_id and status in ('none','rejected');
  if not found then raise exception 'onboarding not allowed'; end if;
end;
$$;

-- 승인 큐. profiles_select에 admin 분기가 없어서 관리자에게도 pending 행은 보이지 않는다 --
-- review_profile은 호출할 수 있는데 넘길 id를 알 방법이 없었다. 그 구멍을 이 함수가 메운다.
--
-- RLS에 `or private.is_app_admin()` 한 줄을 더하는 쪽이 짧지만 그러면 안 된다. 그 한 줄은
-- 컬럼이 아니라 *행*을 연다: rejected도 withdrawn도 soft-delete된 행도 영구히, 아무 쿼리에서나.
-- 여기서는 pending으로 잠긴다.
--
-- 이 코드베이스에서 유일하게 오름차순인 목록 RPC다. 심사 큐라서 그렇다 -- 최신순이면 밀린
-- 사람이 영영 아래에 깔린다. 커서도 반대 방향이라 p_after_id다.
--
-- id 단독 커서로는 안 된다: 거절당한 사람이 재제출하면(submit_onboarding은 'rejected'에서
-- 다시 들어온다) 낡은 id에 새 onboarding_completed_at이 붙어 정렬 키와 id의 순서가 갈린다.
create function public.list_pending_profiles(p_after_id bigint default null, p_limit int4 default 20)
returns table(
  id bigint,
  name text,
  type public.profile_type,
  student_number char(6),
  class_no int2,
  cohort int2,
  gender public.profile_gender,
  track public.profile_track,
  department text,
  is_reenrolled boolean,
  phone_number text,
  birthday date,
  dorm_room int2,
  description text,
  avatar_url text,
  onboarding_completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  after_completed_at timestamptz;
begin
  -- caller_id를 안 쓰므로 perform이다. 결과를 변수에 받아 두면 쓰지 않는 변수로 보여서, 언젠가
  -- 누가 "죽은 코드"라며 지운다 -- 그 줄이 이 함수의 유일한 권한 가드다.
  perform private.require_app_admin();
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'limit must be between 1 and 50'; end if;

  -- 커서 행이 아직 pending일 것을 요구하면 안 된다. 관리자가 한 페이지의 마지막 사람을 승인한
  -- 직후 다음 페이지를 부르면 그 행은 이미 accepted고, 그러면 남은 큐가 통째로 사라진다.
  -- 필요한 건 그 행의 제출 시각뿐이고, 심사해도 그 값은 그대로 남는다.
  if p_after_id is not null then
    select p.onboarding_completed_at into after_completed_at
    from public.profiles p
    where p.id=p_after_id and p.deleted_at is null;
    if after_completed_at is null then raise exception 'invalid cursor'; end if;
  end if;

  return query
  select
    p.id,
    p.name,
    p.type,
    p.student_number,
    p.class_no,
    p.cohort,
    p.gender,
    p.track,
    p.department,
    p.is_reenrolled,
    p.phone_number,
    p.birthday,
    p.dorm_room,
    p.description,
    p.avatar_url,
    p.onboarding_completed_at
  from public.profiles p
  where p.status='pending'
    and p.deleted_at is null
    and (p_after_id is null or (p.onboarding_completed_at,p.id) > (after_completed_at,p_after_id))
  order by p.onboarding_completed_at, p.id
  limit p_limit;
end;
$$;

create function public.count_pending_profiles()
returns int4 language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_app_admin();
  return (select count(*) from public.profiles where status='pending' and deleted_at is null);
end;
$$;

-- 심사 규칙(accepted/rejected만, pending만)이 사는 유일한 곳. 단건 review_profile은 이걸
-- 감싸기만 한다 -- 규칙을 두 벌 두면 한쪽만 고쳐지는 날이 온다.
-- 신입 기수가 한꺼번에 들어오면 단건 RPC로는 180번을 왕복해야 해서 배치가 본체다.
create function public.review_profiles(p_profile_ids bigint[],p_status public.profile_status)
returns int4 language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_app_admin(); reviewed int4;
begin
  if p_status not in ('accepted','rejected') then raise exception 'invalid review status'; end if;
  if p_profile_ids is null or cardinality(p_profile_ids) not between 1 and 200 then raise exception 'review 1 to 200 profiles at a time'; end if;
  update public.profiles set status=p_status,status_updated_at=now(),status_updated_by=caller_id
  where id=any(p_profile_ids) and status='pending' and deleted_at is null;
  get diagnostics reviewed = row_count;
  return reviewed;
end;
$$;

create function public.review_profile(p_profile_id bigint,p_status public.profile_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.review_profiles(array[p_profile_id],p_status) = 0 then raise exception 'pending profile not found'; end if;
end;
$$;

create function public.withdraw_profile()
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  perform 1 from public.profiles where id=caller_id for update;
  if exists(select 1 from public.profiles where id=caller_id and role='admin') or exists(select 1 from public.space_members sm join public.spaces s on s.id=sm.space_id where sm.user_id=caller_id and sm.role='owner' and s.deleted_at is null)
    then raise exception 'transfer owner/admin responsibilities first'; end if;
  perform private.anonymize_profile(caller_id);
end;
$$;

create function public.finalize_avatar(p_storage_path text)
returns void language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(false); expected_prefix text:=(select auth.uid())::text||'/';
begin
  if not private.has_uuid_object_suffix(p_storage_path,expected_prefix)
    or not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_storage_path and created_at>=now()-interval '24 hours' and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp'))
    then raise exception 'invalid avatar object'; end if;
  update public.profiles set avatar_url=p_storage_path where id=caller_id;
end $$;

create function public.finalize_cover_image(p_storage_path text)
returns void language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(false); expected_prefix text:=(select auth.uid())::text||'/';
begin
  if not private.has_uuid_object_suffix(p_storage_path,expected_prefix)
    or not exists(select 1 from storage.objects where bucket_id='profile-covers' and name=p_storage_path and created_at>=now()-interval '24 hours' and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp'))
    then raise exception 'invalid cover image object'; end if;
  update public.profiles set cover_image_url=p_storage_path where id=caller_id;
end $$;

revoke execute on function public.submit_onboarding(text,public.profile_type,char,int2,int2,public.profile_gender,public.profile_track,text,boolean,text,date,text,int2), public.review_profile(bigint,public.profile_status), public.review_profiles(bigint[],public.profile_status), public.list_pending_profiles(bigint,int4), public.count_pending_profiles(), public.withdraw_profile() from public, anon, authenticated, service_role;
grant execute on function public.submit_onboarding(text,public.profile_type,char,int2,int2,public.profile_gender,public.profile_track,text,boolean,text,date,text,int2), public.review_profile(bigint,public.profile_status), public.review_profiles(bigint[],public.profile_status), public.list_pending_profiles(bigint,int4), public.count_pending_profiles() to authenticated;
grant execute on function public.withdraw_profile(), public.finalize_avatar(text), public.finalize_cover_image(text) to authenticated;
revoke execute on function public.finalize_avatar(text), public.finalize_cover_image(text) from public, anon, service_role;

-- 열쇠고리 RPC 네 개. bytea가 PostgREST를 지나면 hex 문자열(`\x00ff`)이 되어 2배로 부푸므로
-- 경계에서는 base64로 주고받고 컬럼은 bytea로 남긴다. 클라이언트 쓰기 경로가 이 세 함수뿐인
-- 이유도 같다 -- 테이블에 insert/update grant가 아예 없다.
--
-- accepted가 아니어도 호출할 수 있어야 한다(require_current_profile(false)): 열쇠고리는
-- 가입 직후, 브라우저가 아직 비밀번호를 들고 있는 그 순간에 만들어야 한다. 승인까지 미루면
-- 그때는 세션만 있고 비밀번호가 없어서 encKey를 만들 수가 없다.

-- 내 금고. 봉인된 blob이 서버 밖으로 나가는 유일한 문이고, 스스로를 호출자 행에 가둔다.
-- 아직 열쇠고리가 없으면 0행을 준다 -- 클라이언트는 그걸 보고 create_user_keys를 부른다.
create function public.get_my_key_vault()
returns table(
  identity_public_key text,
  wrapped_user_key text,
  wrapped_identity_secret_key text
)
language plpgsql stable security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(false);
begin
  return query
  select
    encode(k.identity_public_key, 'base64'),
    encode(k.wrapped_user_key, 'base64'),
    encode(k.wrapped_identity_secret_key, 'base64')
  from public.user_keys k
  where k.user_id = caller_id;
end;
$$;

-- 상대의 신원 공개키. 메시지 키를 봉인하려면 이게 먼저 필요하다.
--
-- security invoker다: RLS(user_keys_select)와 컬럼 grant가 그대로 적용되어, 이 함수는
-- 테이블이 이미 허용하는 것 이상을 줄 수 없다. 봉인된 blob은 애초에 grant가 없어서
-- 여기서 실수로 새어 나갈 방법도 없다.
--
-- 배열을 받는 이유는 대화 목록 하나에 상대가 여럿이기 때문이고, 열쇠고리가 없는 사용자는
-- 행이 안 나온다 -- 그게 "아직 로그인한 적 없어서 DM을 받을 수 없는 사람"의 표현이다.
create function public.get_identity_public_keys(p_user_ids bigint[])
returns table(user_id bigint, identity_public_key text)
language sql stable security invoker set search_path = '' as $$
  select k.user_id, encode(k.identity_public_key, 'base64')
  from public.user_keys k
  where k.user_id = any(p_user_ids)
$$;

-- 가입 시 1회. 이미 있으면 실패한다 -- 덮어쓰면 그 사람의 DM 히스토리가 통째로 죽는다.
-- 비밀번호가 틀려서 금고가 안 열리는 클라이언트가 "그럼 새로 만들지" 하는 것을 막는 것도
-- 이 실패다. 정말 갈아엎으려면 rotate_user_keys를 명시적으로 불러야 한다.
create function public.create_user_keys(
  p_identity_public_key text,
  p_wrapped_user_key text,
  p_wrapped_identity_secret_key text
)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(false);
begin
  insert into public.user_keys (
    user_id, identity_public_key, wrapped_user_key, wrapped_identity_secret_key
  )
  values (
    caller_id,
    decode(p_identity_public_key, 'base64'),
    decode(p_wrapped_user_key, 'base64'),
    decode(p_wrapped_identity_secret_key, 'base64')
  );
exception when unique_violation then
  raise exception 'key vault already exists';
end;
$$;

-- 로그인 상태에서 비밀번호 변경(현재 비밀번호로 금고를 이미 연 상태). userKey는 그대로고 봉인만
-- 새 encKey로 다시 한다. 신원키를 건드릴 수 없다는 것이 이 함수의 요점이다 -- 그래서 메시지가
-- 한 통도 재암호화되지 않고, 히스토리가 그대로 살아남는다.
create function public.reseal_user_keys(
  p_wrapped_user_key text
)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(false);
begin
  update public.user_keys
  set wrapped_user_key = decode(p_wrapped_user_key, 'base64'),
      updated_at = now()
  where user_id = caller_id;
  if not found then raise exception 'key vault not found'; end if;
end;
$$;

-- 최후의 수단: 비밀번호를 잊었다. 옛 userKey를 풀 수 있는 것이 세상에 없으므로(escrow 사본을
-- 두지 않는다) 신원키까지 전부 새로 발급한다.
--
-- message_keys는 손대지 않는다. 내 옛 공개키 앞으로 봉인된 행들은 나에게는 죽었지만
-- 상대방에게는 멀쩡하다(행이 봉인 당시의 두 공개키를 다 들고 있어서, 상대는 여전히
-- DH를 계산할 수 있다). 즉 내 히스토리만 사라지고 상대의 히스토리는 남는다. 정확히
-- 종단간 암호화가 뜻하는 바이며, 우회로를 만들 수 있다면 그건 서버가 읽을 수 있다는 뜻이다.
create function public.rotate_user_keys(
  p_identity_public_key text,
  p_wrapped_user_key text,
  p_wrapped_identity_secret_key text
)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(false);
begin
  update public.user_keys
  set identity_public_key = decode(p_identity_public_key, 'base64'),
      wrapped_user_key = decode(p_wrapped_user_key, 'base64'),
      wrapped_identity_secret_key = decode(p_wrapped_identity_secret_key, 'base64'),
      updated_at = now()
  where user_id = caller_id;
  if not found then raise exception 'key vault not found'; end if;
end;
$$;

revoke execute on function public.get_my_key_vault(), public.get_identity_public_keys(bigint[]), public.create_user_keys(text,text,text), public.reseal_user_keys(text), public.rotate_user_keys(text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.get_my_key_vault(), public.get_identity_public_keys(bigint[]), public.create_user_keys(text,text,text), public.reseal_user_keys(text), public.rotate_user_keys(text,text,text) to authenticated;

create function public.bootstrap_first_app_admin(p_profile_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_service_role(); perform pg_advisory_xact_lock(hashtextextended('public.app_admin_set',0)); if exists(select 1 from public.profiles where role='admin') then raise exception 'app admin already exists'; end if; update public.profiles set role='admin' where id=p_profile_id and status='accepted' and deleted_at is null; if not found then raise exception 'accepted profile required'; end if; end $$;
grant execute on function public.bootstrap_first_app_admin(bigint) to service_role;
revoke execute on function public.bootstrap_first_app_admin(bigint) from public, anon, authenticated;

-- bootstrap은 admin이 0명일 때 한 번만 통한다. 그래서 admin을 늘릴 두 번째 문이 없으면 승인자가
-- 한 명뿐인 상태로 굳고, 그 사람이 졸업하는 날 가입 승인이 통째로 멈춘다.
create function public.set_app_admin(p_profile_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_app_admin();
  if exists(select 1 from public.profiles where id=p_profile_id and role='admin' and deleted_at is null) then return; end if;
  update public.profiles set role='admin' where id=p_profile_id and status='accepted' and deleted_at is null;
  if not found then raise exception 'accepted profile required'; end if;
end $$;

-- 강등. 임명의 짝이기도 하지만 **탈퇴의 전제**이기도 하다 -- withdraw_profile이 admin의 탈퇴를
-- 거부하므로(transfer owner/admin responsibilities first), 이 함수가 없으면 한번 admin이 된 사람은
-- 계정을 지울 수 없다.
--
-- 마지막 한 명은 내리지 못한다. admin이 0명이 되면 다시 세우는 유일한 길이 service_role
-- (bootstrap_first_app_admin)이라, 앱 안에서는 복구 불가능한 상태가 된다. 동시에 서로를 내리는
-- 경합도 그 구멍으로 새므로 bootstrap과 **같은 키**의 advisory lock으로 직렬화한다 -- 둘이 각자
-- "나 말고 한 명 더 있네"를 보고 통과하면 결과는 0명이다.
create function public.unset_app_admin(p_profile_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_app_admin();
  perform pg_advisory_xact_lock(hashtextextended('public.app_admin_set',0));
  if not exists(select 1 from public.profiles where id=p_profile_id and role='admin' and deleted_at is null) then
    raise exception 'app admin not found';
  end if;
  if (select count(*) from public.profiles where role='admin' and deleted_at is null) <= 1 then
    raise exception 'the last app admin cannot be demoted';
  end if;
  update public.profiles set role='user' where id=p_profile_id;
end $$;

revoke execute on function public.set_app_admin(bigint), public.unset_app_admin(bigint) from public, anon, authenticated, service_role;
grant execute on function public.set_app_admin(bigint), public.unset_app_admin(bigint) to authenticated;
