-- public.notification_level lives in 00-foundation: 05-chat needs it, and this
-- file is applied after that one.

create table public.notifications (
  id bigserial primary key,
  recipient_id bigint not null references public.profiles (id) on delete restrict,
  actor_id bigint null references public.profiles (id) on delete set null,
  title text null,
  body text null,
  space_id bigint null references public.spaces (id) on delete set null,
  post_id bigint null references public.posts (id) on delete set null,
  comment_id bigint null references public.comments (id) on delete set null,
  message_id bigint null references public.messages (id) on delete set null,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index idx_notifications_recipient_created_at on public.notifications (recipient_id, created_at);
create index idx_notifications_unread_recipient_created_at on public.notifications (recipient_id, created_at desc)
where read_at is null;

alter table public.notifications
  add constraint notifications_title_check check (title is null or char_length(title) <= 200),
  add constraint notifications_body_check check (body is null or char_length(body) <= 2000),
  add constraint notifications_content_check check (
    nullif(btrim(title), '') is not null or nullif(btrim(body), '') is not null
  ),
  add constraint notifications_message_target_check check (
    message_id is null or (space_id is null and post_id is null and comment_id is null)
  );

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (private.is_accepted_user() and recipient_id=private.current_profile_id());
create policy notifications_update on public.notifications for update to authenticated using (private.is_accepted_user() and recipient_id=private.current_profile_id()) with check (private.is_accepted_user() and recipient_id=private.current_profile_id());

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;
grant usage, select on sequence public.notifications_id_seq to service_role;
