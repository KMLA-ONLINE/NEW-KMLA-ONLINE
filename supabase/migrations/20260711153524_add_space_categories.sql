create sequence "public"."space_categories_id_seq";


  create table "public"."space_categories" (
    "id" bigint not null default nextval('public.space_categories_id_seq'::regclass),
    "space_id" bigint not null,
    "name" text not null,
    "sort_order" integer not null default 0,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."space_categories" enable row level security;

alter table "public"."posts" add column "category_id" bigint;

alter sequence "public"."space_categories_id_seq" owned by "public"."space_categories"."id";

CREATE INDEX idx_posts_active_space_category ON public.posts USING btree (space_id, category_id, created_at DESC, id DESC) WHERE (deleted_at IS NULL);

CREATE INDEX idx_space_categories_space ON public.space_categories USING btree (space_id, sort_order, id);

CREATE UNIQUE INDEX space_categories_pkey ON public.space_categories USING btree (id);

CREATE UNIQUE INDEX space_categories_space_name_key ON public.space_categories USING btree (space_id, lower(btrim(name)));

alter table "public"."space_categories" add constraint "space_categories_pkey" PRIMARY KEY using index "space_categories_pkey";

alter table "public"."posts" add constraint "posts_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.space_categories(id) ON DELETE SET NULL not valid;

alter table "public"."posts" validate constraint "posts_category_id_fkey";

alter table "public"."space_categories" add constraint "space_categories_name_check" CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 50))) not valid;

alter table "public"."space_categories" validate constraint "space_categories_name_check";

alter table "public"."space_categories" add constraint "space_categories_sort_order_check" CHECK ((sort_order >= 0)) not valid;

alter table "public"."space_categories" validate constraint "space_categories_sort_order_check";

alter table "public"."space_categories" add constraint "space_categories_space_id_fkey" FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE RESTRICT not valid;

alter table "public"."space_categories" validate constraint "space_categories_space_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.validate_post_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.category_id is not null and not exists (
    select 1 from public.space_categories sc
    where sc.id = new.category_id and sc.space_id = new.space_id
  ) then
    raise exception 'post category must belong to the same space';
  end if;
  return new;
end;
$function$
;

grant delete on table "public"."space_categories" to "authenticated";

grant select on table "public"."space_categories" to "authenticated";

grant delete on table "public"."space_categories" to "service_role";

grant insert on table "public"."space_categories" to "service_role";

grant select on table "public"."space_categories" to "service_role";

grant update on table "public"."space_categories" to "service_role";


  create policy "space_categories_delete"
  on "public"."space_categories"
  as permissive
  for delete
  to authenticated
using (private.can_manage_space(space_id));



  create policy "space_categories_insert"
  on "public"."space_categories"
  as permissive
  for insert
  to authenticated
with check (private.can_manage_space(space_id));



  create policy "space_categories_select"
  on "public"."space_categories"
  as permissive
  for select
  to authenticated
using (private.is_space_member(space_id));



  create policy "space_categories_update"
  on "public"."space_categories"
  as permissive
  for update
  to authenticated
using (private.can_manage_space(space_id))
with check (private.can_manage_space(space_id));


CREATE TRIGGER trg_validate_post_category BEFORE INSERT OR UPDATE OF space_id, category_id ON public.posts FOR EACH ROW EXECUTE FUNCTION private.validate_post_category();

-- db diff가 놓치는 컬럼 단위 grant·sequence grant·revoke를 손으로 채운다
-- (선언 스키마 supabase/schemas/02-spaces.sql, 03-content.sql과 일치).
grant insert (space_id, name, sort_order) on table "public"."space_categories" to "authenticated";

grant update (name, sort_order) on table "public"."space_categories" to "authenticated";

grant usage, select on sequence "public"."space_categories_id_seq" to "authenticated", "service_role";

grant insert (category_id) on table "public"."posts" to "authenticated";

grant update (category_id) on table "public"."posts" to "authenticated";

revoke execute on function private.validate_post_category() from public, anon, authenticated, service_role;


