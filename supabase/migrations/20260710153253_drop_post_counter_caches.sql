-- posts.comment_count and posts.reaction_count were never written: no trigger
-- maintained them, authenticated held no update grant on them, and
-- reconcile_cached_counts is gone. They read 0 for every row, which is worse than
-- absent, because a caller believes them.
--
-- Counts move to count(*) in the read path. Clients write comments and
-- post_reactions straight to the table under column grants, so a cache would have
-- to be a trigger, and that trigger would take a row lock on the post for every
-- comment. The read contract does not change either way, so the cache can come
-- back the day a measurement asks for it.
--
-- spaces.member_count stays: join/leave/accept go through SECURITY DEFINER RPCs,
-- which give it a choke point these columns never had.
--
-- No backfill needed: every value is the 0 default.

alter table "public"."posts" drop constraint "posts_comment_count_check";

alter table "public"."posts" drop constraint "posts_reaction_count_check";

alter table "public"."posts" drop column "comment_count";

alter table "public"."posts" drop column "reaction_count";
