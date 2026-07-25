drop index if exists "public"."idx_club_apply_rounds_period";

drop index if exists "public"."idx_clubs_apply_club_id";

drop index if exists "public"."idx_clubs_apply_round_club_created_at";

drop index if exists "public"."idx_clubs_apply_round_user_created_at";

CREATE INDEX idx_clubs_apply_club_round_created_at ON public.clubs_apply USING btree (club_id, round_id, created_at);


