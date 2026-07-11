create type "public"."profile_track" as enum ('domestic', 'international');

alter table "public"."profiles" drop constraint "profiles_anonymous_username_check";

alter table "public"."profiles" drop constraint "profiles_pub_id_key";

drop function if exists "public"."set_anonymous_username"(p_value text);

drop function if exists "public"."submit_onboarding"(p_name text, p_type public.profile_type, p_student_number character, p_class_no smallint, p_cohort smallint, p_gender public.profile_gender, p_phone_number text, p_birthday date, p_description text, p_dorm_room smallint);

drop index if exists "public"."profiles_anonymous_username_normalized_key";

drop index if exists "public"."profiles_pub_id_key";


  create table "public"."profile_departments" (
    "name" text not null
      );


alter table "public"."profile_departments" enable row level security;

alter table "public"."profiles" drop column "anonymous_username";

alter table "public"."profiles" drop column "pub_id";

alter table "public"."profiles" add column "cover_image_url" text;

alter table "public"."profiles" add column "department" text;

alter table "public"."profiles" add column "is_reenrolled" boolean not null default false;

alter table "public"."profiles" add column "track" public.profile_track;

alter table "public"."profiles" add constraint "profiles_track_required_check" CHECK (((deleted_at IS NOT NULL) OR (status = 'none'::public.profile_status) OR (track IS NOT NULL))) not valid;

alter table "public"."profiles" validate constraint "profiles_track_required_check";

CREATE UNIQUE INDEX profile_departments_pkey ON public.profile_departments USING btree (name);

alter table "public"."profile_departments" add constraint "profile_departments_pkey" PRIMARY KEY using index "profile_departments_pkey";

alter table "public"."profile_departments" add constraint "profile_departments_name_check" CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 50))) not valid;

alter table "public"."profile_departments" validate constraint "profile_departments_name_check";

alter table "public"."profiles" add constraint "profiles_department_fkey" FOREIGN KEY (department) REFERENCES public.profile_departments(name) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."profiles" validate constraint "profiles_department_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.finalize_cover_image(p_storage_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint:=private.require_current_profile(false); expected_prefix text:=(select auth.uid())::text||'/';
begin
  if p_storage_path not like expected_prefix||'%' or p_storage_path !~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or not exists(select 1 from storage.objects where bucket_id='profile-covers' and name=p_storage_path and created_at>=now()-interval '24 hours' and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp'))
    then raise exception 'invalid cover image object'; end if;
  update public.profiles set cover_image_url=p_storage_path where id=caller_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.submit_onboarding(p_name text, p_type public.profile_type, p_student_number character, p_class_no smallint, p_cohort smallint, p_gender public.profile_gender, p_track public.profile_track, p_department text, p_is_reenrolled boolean, p_phone_number text, p_birthday date, p_description text, p_dorm_room smallint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(false);
begin
  update public.profiles set name=btrim(p_name),type=p_type,student_number=p_student_number,class_no=p_class_no,cohort=p_cohort,gender=p_gender,track=p_track,department=nullif(btrim(p_department),''),is_reenrolled=coalesce(p_is_reenrolled,false),phone_number=p_phone_number,birthday=p_birthday,description=p_description,dorm_room=p_dorm_room,onboarding_completed_at=now(),status='pending',status_updated_at=now(),status_updated_by=null
  where id=caller_id and status in ('none','rejected');
  if not found then raise exception 'onboarding not allowed'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.handle_auth_user_deleted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  update public.profiles
  set auth_user_id = null,
      name = '탈퇴한 사용자',
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
  where id = profile_id;

  return old;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_storage_cleanup(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare bucket text; path text;
begin
  perform private.require_service_role();
  select storage_bucket,storage_path into bucket,path from private.attachment_cleanup_queue where id=p_id and processed_at is null for update;
  if path is null then return; end if;
  if bucket='post-files' then delete from public.post_attachments where storage_path=path;
  elsif bucket='message-files' then delete from public.message_attachments where storage_path=path;
  elsif bucket='avatars' then update public.profiles set avatar_url=null where avatar_url=path;
  elsif bucket='profile-covers' then update public.profiles set cover_image_url=null where cover_image_url=path;
  elsif bucket='space-images' then update public.spaces set image_url=null where image_url=path and deleted_at is not null;
  else raise exception 'invalid cleanup bucket'; end if;
  update private.attachment_cleanup_queue set processed_at=now(),last_error=null where id=p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.enqueue_due_storage_cleanup()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result bigint;
begin
  perform private.require_service_role();
  delete from private.attachment_cleanup_queue where processed_at<now()-interval '30 days';

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path)
  select a.storage_bucket,a.storage_path from public.post_attachments a join public.posts p on p.id=a.post_id
  where p.deleted_at<now()-interval '7 days'
  union
  select a.storage_bucket,a.storage_path from public.message_attachments a join public.messages m on m.id=a.message_id
  where m.deleted_at<now()-interval '7 days'
  union
  select a.storage_bucket,a.storage_path from public.post_attachments a join public.posts p on p.id=a.post_id join public.spaces s on s.id=p.space_id
  where s.deleted_at<now()-interval '7 days'
  union
  select 'space-images',s.image_url from public.spaces s
  where s.deleted_at<now()-interval '7 days' and s.image_url is not null
  union
  select o.bucket_id,o.name from storage.objects o
  where o.created_at<now()-interval '48 hours'
    and o.bucket_id in ('avatars','profile-covers','space-images','post-files','message-files')
    and not exists(select 1 from public.profiles p where o.bucket_id='avatars' and p.avatar_url=o.name)
    and not exists(select 1 from public.profiles p where o.bucket_id='profile-covers' and p.cover_image_url=o.name)
    and not exists(select 1 from public.spaces s where o.bucket_id='space-images' and s.image_url=o.name)
    and not exists(select 1 from public.post_attachments a where o.bucket_id='post-files' and a.storage_path=o.name)
    and not exists(select 1 from public.message_attachments a where o.bucket_id='message-files' and a.storage_path=o.name)
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),processed_at=null;

  get diagnostics result=row_count;
  return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.withdraw_profile()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true);
begin
  perform 1 from public.profiles where id=caller_id for update;
  if exists(select 1 from public.profiles where id=caller_id and role='admin') or exists(select 1 from public.space_members sm join public.spaces s on s.id=sm.space_id where sm.user_id=caller_id and sm.role='owner' and s.deleted_at is null)
    then raise exception 'transfer owner/admin responsibilities first'; end if;
  update public.profiles set name='탈퇴한 사용자',role='user',student_number=null,class_no=null,cohort=null,gender=null,track=null,department=null,phone_number=null,avatar_url=null,cover_image_url=null,birthday=null,description=null,status='withdrawn',dorm_room=null,is_reenrolled=false,status_updated_at=now(),status_updated_by=null,deleted_at=now() where id=caller_id;
end;
$function$
;

grant select on table "public"."profile_departments" to "authenticated";

grant delete on table "public"."profile_departments" to "service_role";

grant insert on table "public"."profile_departments" to "service_role";

grant select on table "public"."profile_departments" to "service_role";

grant update on table "public"."profile_departments" to "service_role";

insert into public.profile_departments (name)
values
  ('문화기획부'),
  ('방송부'),
  ('체육부'),
  ('학습부'),
  ('환경부'),
  ('영어상용부'),
  ('도서부'),
  ('식품영양부'),
  ('동아리관리부'),
  ('과학기술부'),
  ('금융정보부'),
  ('법무부')
on conflict (name) do update
set name = excluded.name;


  create policy "profile_departments_select"
  on "public"."profile_departments"
  as permissive
  for select
  to authenticated
using (true);



create policy "profile_covers_insert"
on "storage"."objects"
as permissive
for insert
to authenticated
with check (
  bucket_id = 'profile-covers'
  and exists(select 1 from public.profiles p where p.auth_user_id = (select auth.uid()) and p.deleted_at is null)
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);

create policy "profile_covers_select"
on "storage"."objects"
as permissive
for select
to authenticated
using (
  bucket_id = 'profile-covers'
  and exists(select 1 from public.profiles p where p.cover_image_url = objects.name and p.deleted_at is null)
);

revoke execute on function public.submit_onboarding(text,public.profile_type,char,int2,int2,public.profile_gender,public.profile_track,text,boolean,text,date,text,int2) from public, anon, authenticated, service_role;
grant execute on function public.submit_onboarding(text,public.profile_type,char,int2,int2,public.profile_gender,public.profile_track,text,boolean,text,date,text,int2) to authenticated;
grant execute on function public.finalize_cover_image(text) to authenticated;
revoke execute on function public.finalize_cover_image(text) from public, anon, service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('profile-covers','profile-covers',false,10000000,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set name=excluded.name,
    public=excluded.public,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;
