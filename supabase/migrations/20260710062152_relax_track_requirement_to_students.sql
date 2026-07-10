-- Track is the 국내반/국제반 stream a student is placed in, so teachers and alumni
-- have none. profiles_student_identity_check already exempts non-students; this
-- constraint did not, which made teacher onboarding impossible.
--
-- Strictly widening, so every existing row stays valid and validate cannot fail.

alter table "public"."profiles" drop constraint "profiles_track_required_check";

alter table "public"."profiles" add constraint "profiles_track_required_check" CHECK (((deleted_at IS NOT NULL) OR (status = 'none'::public.profile_status) OR (type <> 'student'::public.profile_type) OR (track IS NOT NULL))) not valid;

alter table "public"."profiles" validate constraint "profiles_track_required_check";
