drop function if exists "public"."list_pending_post_report_cases"(p_space_id bigint, p_before_reported_at timestamp with time zone, p_before_post_id bigint, p_limit integer);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.list_pending_post_report_cases(p_space_id bigint, p_after_reported_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_post_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content text, is_anonymous boolean, author_attribution public.author_attribution, post_created_at timestamp with time zone, report_count bigint, first_reported_at timestamp with time zone, last_reported_at timestamp with time zone, reason_counts jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_current_profile(true);
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  if (p_after_reported_at is null) <> (p_after_post_id is null) then
    raise exception 'report cursor must include timestamp and post id';
  end if;

  return query
  with reason_totals as (
    select
      r.post_id,
      r.reason,
      count(*) as report_count,
      min(r.created_at) as first_reported_at,
      max(r.created_at) as last_reported_at
    from public.post_reports r
    join public.posts p on p.id=r.post_id
    where p.space_id=p_space_id and p.deleted_at is null and r.resolution is null
    group by r.post_id,r.reason
  ), cases as (
    select
      p.id as post_id,
      p.pub_id,
      p.title,
      p.content,
      p.is_anonymous,
      p.author_attribution,
      p.created_at as post_created_at,
      sum(rt.report_count)::bigint as report_count,
      min(rt.first_reported_at) as first_reported_at,
      max(rt.last_reported_at) as last_reported_at,
      jsonb_object_agg(rt.reason,rt.report_count) as reason_counts
    from reason_totals rt
    join public.posts p on p.id=rt.post_id
    group by p.id
  )
  select c.*
  from cases c
  where p_after_reported_at is null
     or (c.first_reported_at,c.post_id) > (p_after_reported_at,p_after_post_id)
  order by c.first_reported_at,c.post_id
  limit p_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_pending_post_reports(p_post_id bigint, p_after_reported_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_report_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 10)
 RETURNS TABLE(report_id bigint, reason public.post_report_reason, details text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_current_profile(true);
  if not exists(
    select 1 from public.posts p
    where p.id=p_post_id and p.deleted_at is null and private.can_manage_space(p.space_id)
  ) then
    raise exception 'space manager required';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  if (p_after_reported_at is null) <> (p_after_report_id is null) then
    raise exception 'report cursor must include timestamp and report id';
  end if;

  return query
  select r.id,r.reason,r.details,r.created_at
  from public.post_reports r
  where r.post_id=p_post_id
    and r.resolution is null
    and (
      p_after_reported_at is null
      or (r.created_at,r.id) > (p_after_reported_at,p_after_report_id)
    )
  order by r.created_at,r.id
  limit p_limit;
end;
$function$
;

revoke execute on function public.list_pending_post_report_cases(bigint,timestamptz,bigint,int4), public.list_pending_post_reports(bigint,timestamptz,bigint,int4) from public, anon, authenticated, service_role;

grant execute on function public.list_pending_post_report_cases(bigint,timestamptz,bigint,int4), public.list_pending_post_reports(bigint,timestamptz,bigint,int4) to authenticated;
