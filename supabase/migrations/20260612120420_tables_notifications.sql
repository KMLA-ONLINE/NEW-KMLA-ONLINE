create table public.notifications (
  id bigserial primary key,
  recipient_id bigint not null references public.profiles (id) on delete restrict,
  actor_id bigint null references public.profiles (id) on delete set null,
  title text null,
  body text null,
  space_id bigint null references public.spaces (id) on delete set null,
  space_type public.space_type null,
  post_id bigint null references public.posts (id) on delete set null,
  comment_id bigint null references public.comments (id) on delete set null,
  message_id bigint null references public.messages (id) on delete set null,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);
