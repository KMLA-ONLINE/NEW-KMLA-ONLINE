create type "public"."post_report_reason" as enum ('spam', 'harassment', 'privacy', 'harmful', 'other');

create type "public"."post_report_resolution" as enum ('dismissed', 'post_removed');

create sequence "public"."post_reports_id_seq";


  create table "public"."post_reports" (
    "id" bigint not null default nextval('public.post_reports_id_seq'::regclass),
    "post_id" bigint not null,
    "reporter_id" bigint not null,
    "reason" public.post_report_reason not null,
    "details" text,
    "created_at" timestamp with time zone not null default now(),
    "resolution" public.post_report_resolution,
    "resolved_at" timestamp with time zone,
    "resolved_by" bigint
      );


alter table "public"."post_reports" enable row level security;

alter sequence "public"."post_reports_id_seq" owned by "public"."post_reports"."id";

CREATE INDEX idx_post_reports_pending_post_created_at ON public.post_reports USING btree (post_id, created_at DESC, id DESC) WHERE (resolution IS NULL);

CREATE UNIQUE INDEX post_reports_pkey ON public.post_reports USING btree (id);

CREATE UNIQUE INDEX post_reports_post_reporter_key ON public.post_reports USING btree (post_id, reporter_id);

alter table "public"."post_reports" add constraint "post_reports_pkey" PRIMARY KEY using index "post_reports_pkey";

alter table "public"."post_reports" add constraint "post_reports_details_check" CHECK (((details IS NULL) OR ((char_length(btrim(details)) >= 1) AND (char_length(btrim(details)) <= 1000)))) not valid;

alter table "public"."post_reports" validate constraint "post_reports_details_check";

alter table "public"."post_reports" add constraint "post_reports_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE not valid;

alter table "public"."post_reports" validate constraint "post_reports_post_id_fkey";

alter table "public"."post_reports" add constraint "post_reports_post_reporter_key" UNIQUE using index "post_reports_post_reporter_key";

alter table "public"."post_reports" add constraint "post_reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE RESTRICT not valid;

alter table "public"."post_reports" validate constraint "post_reports_reporter_id_fkey";

alter table "public"."post_reports" add constraint "post_reports_resolution_state_check" CHECK ((((resolution IS NULL) AND (resolved_at IS NULL) AND (resolved_by IS NULL)) OR ((resolution IS NOT NULL) AND (resolved_at IS NOT NULL)))) not valid;

alter table "public"."post_reports" validate constraint "post_reports_resolution_state_check";

alter table "public"."post_reports" add constraint "post_reports_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."post_reports" validate constraint "post_reports_resolved_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.count_pending_post_report_cases(p_space_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_current_profile(true);
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  return (
    select count(distinct r.post_id)
    from public.post_reports r
    join public.posts p on p.id=r.post_id
    where p.space_id=p_space_id and p.deleted_at is null and r.resolution is null
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_pending_post_report_cases(p_space_id bigint, p_before_reported_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_post_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content text, is_anonymous boolean, author_attribution public.author_attribution, post_created_at timestamp with time zone, report_count bigint, first_reported_at timestamp with time zone, last_reported_at timestamp with time zone, reports jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_current_profile(true);
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  if (p_before_reported_at is null) <> (p_before_post_id is null) then
    raise exception 'report cursor must include timestamp and post id';
  end if;

  return query
  with cases as (
    select
      p.id as post_id,
      p.pub_id,
      p.title,
      p.content,
      p.is_anonymous,
      p.author_attribution,
      p.created_at as post_created_at,
      count(*) as report_count,
      min(r.created_at) as first_reported_at,
      max(r.created_at) as last_reported_at,
      jsonb_agg(
        jsonb_build_object(
          'reason',r.reason,
          'details',r.details,
          'created_at',r.created_at
        ) order by r.created_at,r.id
      ) as reports
    from public.post_reports r
    join public.posts p on p.id=r.post_id
    where p.space_id=p_space_id and p.deleted_at is null and r.resolution is null
    group by p.id
  )
  select c.*
  from cases c
  where p_before_reported_at is null
     or (c.first_reported_at,c.post_id) < (p_before_reported_at,p_before_post_id)
  order by c.first_reported_at desc,c.post_id desc
  limit p_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.report_post(p_post_pub_id uuid, p_reason public.post_report_reason, p_details text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  inserted boolean := false;
begin
  insert into public.post_reports(post_id,reporter_id,reason,details)
  select p.id,caller_id,p_reason,nullif(btrim(p_details),'')
  from public.posts p
  where p.pub_id=p_post_pub_id
    and p.deleted_at is null
    and p.author_id<>caller_id
    and private.can_participate_space(p.space_id)
  for key share of p
  on conflict(post_id,reporter_id) do nothing
  returning true into inserted;

  return coalesce(inserted,false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_post_reports(p_post_id bigint, p_resolution public.post_report_resolution)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  resolved_count bigint;
begin
  -- 권한 조건을 조회에 합쳐 없는 글·다른 비공개 space 글을 같은 0으로 만든다.
  perform 1
  from public.posts p
  where p.id=p_post_id and p.deleted_at is null and private.can_manage_space(p.space_id)
  for update;
  if not found then return 0; end if;

  update public.post_reports
  set resolution=p_resolution,resolved_at=now(),resolved_by=caller_id
  where post_id=p_post_id and resolution is null;
  get diagnostics resolved_count = row_count;

  if resolved_count > 0 and p_resolution='post_removed' then
    perform public.soft_delete_post(p_post_id);
  end if;

  return resolved_count;
end;
$function$
;

grant delete on table "public"."post_reports" to "service_role";

grant insert on table "public"."post_reports" to "service_role";

grant select on table "public"."post_reports" to "service_role";

grant update on table "public"."post_reports" to "service_role";

grant usage, select on sequence "public"."post_reports_id_seq" to "service_role";

revoke execute on function public.report_post(uuid,public.post_report_reason,text), public.count_pending_post_report_cases(bigint), public.list_pending_post_report_cases(bigint,timestamptz,bigint,int4), public.resolve_post_reports(bigint,public.post_report_resolution) from public, anon, authenticated, service_role;

grant execute on function public.report_post(uuid,public.post_report_reason,text), public.count_pending_post_report_cases(bigint), public.list_pending_post_report_cases(bigint,timestamptz,bigint,int4), public.resolve_post_reports(bigint,public.post_report_resolution) to authenticated;
