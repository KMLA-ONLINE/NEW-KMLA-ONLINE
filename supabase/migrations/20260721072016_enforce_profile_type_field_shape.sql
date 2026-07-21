update public.profiles
set student_number = null,
    class_no = null,
    cohort = null,
    gender = null,
    track = null,
    department = null,
    dorm_room = null
where type = 'teacher'
  and (
    student_number is not null
    or class_no is not null
    or cohort is not null
    or gender is not null
    or track is not null
    or department is not null
    or dorm_room is not null
  );

update public.profiles
set class_no = null,
    department = null,
    dorm_room = null
where type = 'alumni'
  and (class_no is not null or department is not null or dorm_room is not null);

alter table "public"."profiles" add constraint "profiles_type_field_shape_check" CHECK (((deleted_at IS NOT NULL) OR (type = 'student'::public.profile_type) OR ((type = 'teacher'::public.profile_type) AND (student_number IS NULL) AND (class_no IS NULL) AND (cohort IS NULL) AND (gender IS NULL) AND (track IS NULL) AND (department IS NULL) AND (dorm_room IS NULL)) OR ((type = 'alumni'::public.profile_type) AND (class_no IS NULL) AND (department IS NULL) AND (dorm_room IS NULL)))) not valid;

alter table "public"."profiles" validate constraint "profiles_type_field_shape_check";

