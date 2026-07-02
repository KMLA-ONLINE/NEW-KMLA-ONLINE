create table public.reaction_types (
  id bigserial primary key,
  key text not null,
  name text not null,
  icon text null,
  sort_order int2 not null default 0,
  created_at timestamptz not null default now()
);

create table public.post_reactions (
  id bigserial primary key,
  post_id bigint not null references public.posts (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz null
);

create table public.comment_reactions (
  id bigserial primary key,
  comment_id bigint not null references public.comments (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz null
);

insert into public.reaction_types (key, name, sort_order)
values
  ('like', '좋아요', 0),
  ('love', '하트', 1);
