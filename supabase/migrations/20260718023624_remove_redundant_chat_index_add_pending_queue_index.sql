drop index if exists "public"."idx_direct_conversations_user1";

CREATE INDEX idx_profiles_pending_queue ON public.profiles USING btree (onboarding_completed_at, id) WHERE ((status = 'pending'::public.profile_status) AND (deleted_at IS NULL));


