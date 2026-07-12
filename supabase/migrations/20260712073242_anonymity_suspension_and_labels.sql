drop function if exists "public"."get_post_comments"(p_post_id bigint, p_after_id bigint, p_limit integer);


  create table "public"."space_anonymity_suspensions" (
    "space_id" bigint not null,
    "user_id" bigint not null,
    "suspended_until" timestamp with time zone not null,
    "strike_count" integer not null default 1,
    "suspended_by" bigint,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."space_anonymity_suspensions" enable row level security;

alter table "public"."spaces" add column "allow_anonymous_posts" boolean not null default true;

CREATE UNIQUE INDEX space_anonymity_suspensions_pkey ON public.space_anonymity_suspensions USING btree (space_id, user_id);

alter table "public"."space_anonymity_suspensions" add constraint "space_anonymity_suspensions_pkey" PRIMARY KEY using index "space_anonymity_suspensions_pkey";

alter table "public"."space_anonymity_suspensions" add constraint "space_anonymity_suspensions_space_id_fkey" FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE RESTRICT not valid;

alter table "public"."space_anonymity_suspensions" validate constraint "space_anonymity_suspensions_space_id_fkey";

alter table "public"."space_anonymity_suspensions" add constraint "space_anonymity_suspensions_suspended_by_fkey" FOREIGN KEY (suspended_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."space_anonymity_suspensions" validate constraint "space_anonymity_suspensions_suspended_by_fkey";

alter table "public"."space_anonymity_suspensions" add constraint "space_anonymity_suspensions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT not valid;

alter table "public"."space_anonymity_suspensions" validate constraint "space_anonymity_suspensions_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.can_post_anonymously(p_space_id bigint, p_user_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.spaces s where s.id=p_space_id and s.allow_anonymous_posts)
    and not exists(
      select 1 from public.space_anonymity_suspensions x
      where x.space_id=p_space_id and x.user_id=p_user_id and x.suspended_until > now()
    )
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_anonymous_allowed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_space_id bigint;
begin
  if not new.is_anonymous then return new; end if;

  if tg_table_name='posts' then
    target_space_id := new.space_id;
  else
    select p.space_id into target_space_id from public.posts p where p.id=new.post_id;
  end if;

  if not private.can_post_anonymously(target_space_id, new.author_id) then
    raise exception 'anonymous posting is not available in this space';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.suspend_anonymity(p_space_id bigint, p_author_id bigint)
 RETURNS TABLE(suspended_days integer, strike_count integer, already_suspended boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  prior_strikes int4;
  prior_until timestamptz;
  effective_days int4;
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  select x.strike_count, x.suspended_until into prior_strikes, prior_until
  from public.space_anonymity_suspensions x
  where x.space_id=p_space_id and x.user_id=p_author_id
  for update;

  -- 이미 정지 중 -> 형량을 쌓지 않는다. 남은 기간과 누범 횟수만 돌려준다.
  if found and prior_until > now() then
    return query select
      ceil(extract(epoch from prior_until - now()) / 86400)::int4,
      prior_strikes,
      true;
    return;
  end if;

  -- 마지막 정지가 끝난 지 90일이 지났으면 초범으로 되돌린다. 안 그러면 한 번 걸린 사람이 몇 년
  -- 뒤에도 상습범 취급을 받는다.
  if not found or prior_until < now() - interval '90 days' then
    prior_strikes := 0;
  end if;

  -- 1일 → 2일 → 4일 → 8일 … 2배씩, 90일 상한.
  effective_days := least((2 ^ least(prior_strikes, 7))::int4, 90);

  insert into public.space_anonymity_suspensions(space_id,user_id,suspended_until,strike_count,suspended_by)
  values (p_space_id, p_author_id, now() + make_interval(days => effective_days), prior_strikes + 1, caller_id)
  on conflict (space_id,user_id) do update
  set suspended_until=excluded.suspended_until,
      strike_count=excluded.strike_count,
      suspended_by=excluded.suspended_by,
      created_at=now();

  return query select effective_days, prior_strikes + 1, false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.suspend_comment_author_anonymity(p_comment_id bigint)
 RETURNS TABLE(suspended_days integer, strike_count integer, already_suspended boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_space_id bigint; target_author_id bigint;
begin
  select p.space_id, c.author_id into target_space_id, target_author_id
  from public.comments c join public.posts p on p.id=c.post_id
  where c.id=p_comment_id and c.deleted_at is null and c.is_anonymous;
  if not found then raise exception 'anonymous comment required'; end if;
  return query select * from private.suspend_anonymity(target_space_id, target_author_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.suspend_post_author_anonymity(p_post_id bigint)
 RETURNS TABLE(suspended_days integer, strike_count integer, already_suspended boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.posts;
begin
  select * into target from public.posts
  where id=p_post_id and deleted_at is null and is_anonymous;
  if not found then raise exception 'anonymous post required'; end if;
  return query select * from private.suspend_anonymity(target.space_id, target.author_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION private.can_access_comment(p_comment_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.comments c where c.id=p_comment_id and c.deleted_at is null and private.can_access_post(c.post_id))
$function$
;

CREATE OR REPLACE FUNCTION private.can_access_post(p_post_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.posts p where p.id=p_post_id and p.deleted_at is null and private.can_participate_space(p.space_id))
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_post_attachment_shape()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists (
    select 1
    from (select distinct post_id from new_rows) touched
    where (select count(*) from public.post_attachments a where a.post_id = touched.post_id)
          > private.max_post_attachments()
  ) then
    raise exception 'a post carries at most % attachments', private.max_post_attachments();
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.has_active_descendant(p_comment_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recursive descendants as (
    select c.id, c.deleted_at, 1 as depth
    from public.comments c
    where c.parent_id = p_comment_id
    union all
    select child.id, child.deleted_at, d.depth + 1
    from public.comments child
    join descendants d on child.parent_id = d.id
    where d.depth < 50
  )
  select exists (select 1 from descendants where deleted_at is null)
$function$
;

CREATE OR REPLACE FUNCTION private.post_author(p_author_id bigint, p_is_anonymous boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when p_is_anonymous then null else
    (select jsonb_build_object('id',pr.id,'name',pr.name,'avatar_url',pr.avatar_url)
     from public.profiles pr where pr.id=p_author_id)
  end
$function$
;

CREATE OR REPLACE FUNCTION private.validate_comment_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.parent_id is not null and not exists (
    select 1
    from public.comments as parent
    where parent.id = new.parent_id
      and parent.post_id = new.post_id
      and parent.deleted_at is null
  ) then
    raise exception 'comment parent must be an active comment on the same post';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.validate_post_attachments(p_post_id bigint, p_space_pub_id text, p_attachments jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare expected_prefix text := p_space_pub_id || '/' || (select auth.uid())::text || '/';
begin
  if p_attachments is null or jsonb_typeof(p_attachments)<>'array' then
    raise exception 'attachments must be a json array';
  end if;
  if jsonb_array_length(p_attachments) > private.max_post_attachments() then
    raise exception 'a post carries at most % attachments', private.max_post_attachments();
  end if;

  -- 글이 받지 않는 MIME은 post_attachment_mime_types에 조인되지 않으므로 allowed.content_type is
  -- null이 곧 "허용되지 않은 타입"이다.
  if exists(
    select 1
    from jsonb_array_elements(p_attachments) as item(value)
    left join public.post_attachment_mime_types allowed on allowed.content_type=item.value->>'content_type'
    where allowed.content_type is null
      or item.value->>'storage_path' is null
      or not private.has_uuid_object_suffix(item.value->>'storage_path', expected_prefix)
      or char_length(btrim(coalesce(item.value->>'file_name','')))=0
      or (item.value->>'size_bytes')::int8 is null
      or (item.value->>'size_bytes')::int8<0
      or (item.value->>'size_bytes')::int8>allowed.max_bytes
      or (
        not exists(
          select 1 from public.post_attachments a
          where a.post_id=p_post_id and a.storage_path=item.value->>'storage_path'
        )
        and not exists(
          select 1 from storage.objects o
          where o.bucket_id='post-files'
            and o.name=item.value->>'storage_path'
            and o.created_at>=now()-interval '24 hours'
            and o.metadata->>'mimetype'=item.value->>'content_type'
            and (o.metadata->>'size')::int8=(item.value->>'size_bytes')::int8
        )
      )
  ) then raise exception 'invalid post attachment'; end if;
end;
$function$
;

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

CREATE OR REPLACE FUNCTION public.create_post_with_attachments(p_space_id bigint, p_title text, p_content text, p_attachments jsonb DEFAULT '[]'::jsonb, p_category_id bigint DEFAULT NULL::bigint, p_is_anonymous boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  space_pub_id text;
  new_post_id bigint;
  new_pub_id uuid;
begin
  select s.pub_id into space_pub_id
  from public.spaces s where s.id=p_space_id and s.deleted_at is null;
  if not found then raise exception 'space not found'; end if;
  if not private.can_participate_space(p_space_id) then raise exception 'space membership required'; end if;

  -- 길이 제약과 카테고리 동일 space 검사는 테이블 check와 trg_validate_post_category가 한다.
  insert into public.posts(space_id,author_id,title,content,is_anonymous,category_id)
  values(p_space_id,caller_id,p_title,p_content,coalesce(p_is_anonymous,false),p_category_id)
  returning id, pub_id into new_post_id, new_pub_id;

  perform private.validate_post_attachments(new_post_id, space_pub_id, p_attachments);

  insert into public.post_attachments(post_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height)
  select
    new_post_id,'post-files',
    item.value->>'storage_path',
    btrim(item.value->>'file_name'),
    item.value->>'content_type',
    (item.value->>'size_bytes')::int8,
    (item.position-1)::int4,
    (item.value->>'width')::int4,
    (item.value->>'height')::int4
  from jsonb_array_elements(p_attachments) with ordinality as item(value,position);

  return new_pub_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_post(p_pub_id uuid)
 RETURNS TABLE(post_id bigint, pub_id uuid, space_id bigint, title text, content text, is_anonymous boolean, author jsonb, is_mine boolean, category jsonb, pinned_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, comment_count bigint, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint, attachments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  target_id bigint;
begin
  select p.id into target_id from public.posts p where p.pub_id=p_pub_id and p.deleted_at is null;
  if not found then return; end if;
  if not private.can_access_post(target_id) then raise exception 'post access required'; end if;

  return query
  select
    p.id, p.pub_id, p.space_id, p.title, p.content, p.is_anonymous,
    private.post_author(p.author_id, p.is_anonymous),
    p.author_id=caller_id,
    case when cat.id is null then null else
      jsonb_build_object('id',cat.id,'name',cat.name,'sort_order',cat.sort_order) end,
    p.pinned_at, p.created_at, p.updated_at,
    (select count(*) from public.comments c where c.post_id=p.id and c.deleted_at is null),
    (select count(*) from public.post_reactions r where r.post_id=p.id),
    coalesce((select jsonb_agg(t.icon order by t.n desc, t.icon)
      from (
        select rt.icon, count(*) as n
        from public.post_reactions r join public.reaction_types rt on rt.id=r.reaction_type_id
        where r.post_id=p.id and rt.icon is not null
        group by rt.icon order by count(*) desc limit 3
      ) t),'[]'::jsonb),
    (select r.reaction_type_id from public.post_reactions r where r.post_id=p.id and r.user_id=caller_id),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,
      'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,
      'width',a.width,'height',a.height
    ) order by a.sort_order, a.id)
    from public.post_attachments a join public.mime_types mime on mime.content_type=a.content_type
    where a.post_id=p.id),'[]'::jsonb)
  from public.posts p
  left join public.space_categories cat on cat.id=p.category_id
  where p.id=target_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_post_comments(p_post_id bigint, p_after_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(comment_id bigint, parent_id bigint, content text, is_anonymous boolean, author jsonb, anonymous_label text, is_mine boolean, is_deleted boolean, created_at timestamp with time zone, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  after_created_at timestamptz;
  post_author_id bigint;
  post_is_anonymous boolean;
begin
  if not private.can_access_post(p_post_id) then raise exception 'post access required'; end if;
  if p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  select p.author_id, p.is_anonymous into post_author_id, post_is_anonymous
  from public.posts p where p.id=p_post_id;

  if p_after_id is not null then
    select c.created_at into after_created_at from public.comments c where c.id=p_after_id;
  end if;

  return query
  with recursive
  -- 익명 작성자마다 그 글 안에서만 유효한 번호를 매긴다. author_id는 절대 밖으로 안 나가고 번호만
  -- 나간다. 번호를 서버가 매기는 게 핵심이다 -- 클라이언트가 매기려면 작성자별 키가 필요한데 그게
  -- 곧 author_id고, 그러면 익명이 깨진다.
  --
  -- 페이지가 아니라 글 전체를 기준으로 센다. 페이지마다 새로 세면 2페이지의 "익명1"이 1페이지의
  -- "익명1"과 다른 사람이 되어버린다. 그리고 이 번호는 이 글 안에서만 유효하다 -- 같은 사람이 다른
  -- 글에선 다른 번호를 받으므로 여러 글에 걸쳐 "같은 익명"이라고 이어 붙일 수 없다.
  anon_index as (
    select c.author_id, dense_rank() over (order by min(c.created_at), min(c.id)) as idx
    from public.comments c
    where c.post_id=p_post_id and c.is_anonymous and c.deleted_at is null
      -- 글쓴이 본인은 번호가 아니라 "글쓴이"로 표시하므로 번호 매김에서 뺀다.
      and not (post_is_anonymous and c.author_id=post_author_id)
    group by c.author_id
  ),
  roots as (
    select c.id, c.created_at
    from public.comments c
    where c.post_id=p_post_id and c.parent_id is null
      -- deleted_at is null이 먼저라 살아있는 댓글에는 재귀 검사가 돌지 않는다(OR 단축 평가).
      and (c.deleted_at is null or private.has_active_descendant(c.id))
      and (p_after_id is null or (c.created_at, c.id) > (after_created_at, p_after_id))
    order by c.created_at, c.id
    limit p_limit
  ),
  thread as (
    select c.id, 0 as depth
    from public.comments c
    join roots r on r.id=c.id
    union all
    select child.id, t.depth+1
    from public.comments child
    join thread t on child.parent_id=t.id
    where t.depth < 50
  )
  select
    c.id,
    c.parent_id,
    c.content,
    c.is_anonymous,
    -- tombstone은 본문도 작성자도 내리지 않는다. 남는 건 "여기 삭제된 댓글이 있었다"는 사실뿐이다.
    case when c.deleted_at is not null then null
         else private.post_author(c.author_id, c.is_anonymous) end,
    -- 익명 댓글의 표시 이름. 익명 글의 글쓴이가 자기 글에 단 댓글이면 "글쓴이"다 -- 신원은 여전히
    -- 안 드러나면서(어차피 익명 글이니까) 같은 사람임은 보인다. 글이 실명이면 "글쓴이"를 붙이면
    -- 안 된다: 글쓴이가 누군지 다 아는데 그 라벨을 달면 익명 댓글이 곧바로 까진다.
    case
      when c.deleted_at is not null or not c.is_anonymous then null
      when post_is_anonymous and c.author_id=post_author_id then '글쓴이'
      else '익명' || (select ai.idx from anon_index ai where ai.author_id=c.author_id)
    end,
    c.author_id=caller_id and c.deleted_at is null,
    c.deleted_at is not null,
    c.created_at,
    (select count(*) from public.comment_reactions r where r.comment_id=c.id),
    coalesce((select jsonb_agg(t.icon order by t.n desc, t.icon)
      from (
        select rt.icon, count(*) as n
        from public.comment_reactions r join public.reaction_types rt on rt.id=r.reaction_type_id
        where r.comment_id=c.id and rt.icon is not null
        group by rt.icon order by count(*) desc limit 3
      ) t),'[]'::jsonb),
    (select r.reaction_type_id from public.comment_reactions r where r.comment_id=c.id and r.user_id=caller_id)
  from thread th
  join public.comments c on c.id=th.id
  where c.deleted_at is null or private.has_active_descendant(c.id)
  order by c.created_at, c.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_space_posts(p_space_id bigint, p_category_id bigint DEFAULT NULL::bigint, p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content text, is_anonymous boolean, author jsonb, is_mine boolean, category jsonb, pinned_at timestamp with time zone, created_at timestamp with time zone, comment_count bigint, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint, attachments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  before_created_at timestamptz;
begin
  if not private.can_participate_space(p_space_id) then raise exception 'space membership required'; end if;
  if p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  -- 커서는 id 하나지만 정렬은 (created_at, id)다. 그 글의 created_at을 찾아 행 비교로 쓰면
  -- idx_posts_active_space_created_at을 그대로 탄다.
  if p_before_id is not null then
    select p.created_at into before_created_at from public.posts p where p.id=p_before_id;
  end if;

  return query
  with page as (
    -- 고정 글은 첫 페이지에만 얹고, 시간순 스트림에서는 빼서 두 번 나오지 않게 한다(FB와 동일).
    select p.*, 0 as sort_group
    from public.posts p
    where p_before_id is null
      and p.space_id=p_space_id and p.deleted_at is null and p.pinned_at is not null
      and (p_category_id is null or p.category_id=p_category_id)
    union all
    (
      select p.*, 1 as sort_group
      from public.posts p
      where p.space_id=p_space_id and p.deleted_at is null and p.pinned_at is null
        and (p_category_id is null or p.category_id=p_category_id)
        and (p_before_id is null or (p.created_at, p.id) < (before_created_at, p_before_id))
      order by p.created_at desc, p.id desc
      limit p_limit
    )
  )
  select
    page.id,
    page.pub_id,
    page.title,
    page.content,
    page.is_anonymous,
    private.post_author(page.author_id, page.is_anonymous),
    page.author_id=caller_id,
    case when cat.id is null then null else
      jsonb_build_object('id',cat.id,'name',cat.name,'sort_order',cat.sort_order) end,
    page.pinned_at,
    page.created_at,
    coalesce(counts.comment_count,0),
    coalesce(counts.reaction_count,0),
    coalesce(summary.top_reactions,'[]'::jsonb),
    summary.my_reaction_id,
    coalesce(files.items,'[]'::jsonb)
  from page
  left join public.space_categories cat on cat.id=page.category_id
  left join lateral (
    select
      (select count(*) from public.comments c where c.post_id=page.id and c.deleted_at is null) as comment_count,
      (select count(*) from public.post_reactions r where r.post_id=page.id) as reaction_count
  ) counts on true
  left join lateral (
    select
      (select jsonb_agg(t.icon order by t.n desc, t.icon)
       from (
         select rt.icon, count(*) as n
         from public.post_reactions r
         join public.reaction_types rt on rt.id=r.reaction_type_id
         where r.post_id=page.id and rt.icon is not null
         group by rt.icon
         order by count(*) desc
         limit 3
       ) t) as top_reactions,
      (select r.reaction_type_id from public.post_reactions r where r.post_id=page.id and r.user_id=caller_id) as my_reaction_id
  ) summary on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,
      'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,
      'width',a.width,'height',a.height
    ) order by a.sort_order, a.id) as items
    from public.post_attachments a
    join public.mime_types mime on mime.content_type=a.content_type
    where a.post_id=page.id
  ) files on true
  order by page.sort_group, page.pinned_at desc nulls last, page.created_at desc, page.id desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_posts(p_query text, p_space_id bigint)
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content_snippet text, author jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare normalized_query text := regexp_replace(lower(btrim(p_query)), '\s+', '', 'g');
begin
  if p_space_id is null then raise exception 'space target required'; end if;
  if not private.can_participate_space(p_space_id) then raise exception 'space membership required'; end if;
  if p_query is null or char_length(btrim(p_query)) not between 1 and 200 or normalized_query='' then
    raise exception 'query must contain 1 to 200 characters';
  end if;

  return query
  select p.id, p.pub_id, p.title, left(p.content,300),
         private.post_author(p.author_id, p.is_anonymous),
         p.created_at
  from public.posts p
  where p.space_id=p_space_id
    and p.deleted_at is null
    and (regexp_replace(lower(p.title),'\s+','','g') ilike '%'||normalized_query||'%'
      or regexp_replace(lower(p.content),'\s+','','g') ilike '%'||normalized_query||'%')
  order by p.created_at desc, p.id desc
  limit 50;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_post_attachments(p_post_id bigint, p_attachments jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  space_pub_id text;
begin
  -- 본문 수정과 같은 권한이다(posts_update). 관리자라도 남의 글의 첨부를 바꾸지는 못한다.
  select s.pub_id into space_pub_id
  from public.posts p
  join public.spaces s on s.id=p.space_id
  where p.id=p_post_id and p.deleted_at is null and p.author_id=caller_id
  for update of p;
  if not found then raise exception 'post author required'; end if;

  perform private.validate_post_attachments(p_post_id, space_pub_id, p_attachments);

  -- 새 목록에서 빠진 기존 첨부의 blob만 삭제 큐로 보낸다(유지되는 blob은 건드리지 않는다).
  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by)
  select a.storage_bucket, a.storage_path, caller_id
  from public.post_attachments a
  where a.post_id=p_post_id
    and not exists(
      select 1 from jsonb_array_elements(p_attachments) as item(value)
      where item.value->>'storage_path'=a.storage_path
    )
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  delete from public.post_attachments where post_id=p_post_id;

  insert into public.post_attachments(post_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height)
  select
    p_post_id,'post-files',
    item.value->>'storage_path',
    btrim(item.value->>'file_name'),
    item.value->>'content_type',
    (item.value->>'size_bytes')::int8,
    (item.position-1)::int4,
    (item.value->>'width')::int4,
    (item.value->>'height')::int4
  from jsonb_array_elements(p_attachments) with ordinality as item(value,position);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_post_pinned(p_id bigint, p_pinned boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  target_space_id bigint;
begin
  select space_id into target_space_id
  from public.posts where id=p_id and deleted_at is null
  for update;
  if not found then return; end if;
  if not private.can_manage_space(target_space_id) then
    raise exception 'space manager required';
  end if;

  update public.posts
  set pinned_at = case when p_pinned then now() else null end,
      pinned_by = case when p_pinned then caller_id else null end
  where id=p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_comment(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  target_author_id bigint;
  target_space_id bigint;
begin
  select c.author_id, p.space_id into target_author_id, target_space_id
  from public.comments c
  join public.posts p on p.id=c.post_id
  where c.id=p_id and c.deleted_at is null
  for update of c;
  if not found then return; end if;
  if target_author_id<>caller_id and not private.can_manage_space(target_space_id) then
    raise exception 'comment author or space manager required';
  end if;

  delete from public.comment_reactions where comment_id=p_id;

  -- 행을 지우지 않고 본문만 비운다. 답글이 달려 있으면 tombstone으로 남아야 트리가 끊기지 않는데
  -- (comments_select의 has_active_descendant), 그때 원문이 딸려 나가면 안 된다.
  update public.comments
  set content=null, deleted_at=now(), deleted_by=caller_id
  where id=p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_post(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  target_author_id bigint;
  target_space_id bigint;
begin
  select author_id, space_id into target_author_id, target_space_id
  from public.posts where id=p_id and deleted_at is null
  for update;
  if not found then return; end if;
  if target_author_id<>caller_id and not private.can_manage_space(target_space_id) then
    raise exception 'post author or space manager required';
  end if;

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by)
  select a.storage_bucket,a.storage_path,caller_id
  from public.post_attachments a
  where a.post_id=p_id
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  delete from public.post_attachments where post_id=p_id;
  delete from public.post_reactions where post_id=p_id;

  -- 댓글은 손대지 않는다. can_access_post가 post.deleted_at을 보므로 comments_select가 알아서 막는다.
  update public.posts
  set deleted_at=now(), deleted_by=caller_id
  where id=p_id;
end;
$function$
;

grant delete on table "public"."space_anonymity_suspensions" to "service_role";

grant insert on table "public"."space_anonymity_suspensions" to "service_role";

grant select on table "public"."space_anonymity_suspensions" to "service_role";

grant update on table "public"."space_anonymity_suspensions" to "service_role";


  create policy "space_anonymity_suspensions_select"
  on "public"."space_anonymity_suspensions"
  as permissive
  for select
  to authenticated
using ((user_id = private.current_profile_id()));



  create policy "spaces_update"
  on "public"."spaces"
  as permissive
  for update
  to authenticated
using (((deleted_at IS NULL) AND private.can_manage_space(id)))
with check (((deleted_at IS NULL) AND private.can_manage_space(id)));


CREATE TRIGGER trg_enforce_anonymous_allowed_comments BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION private.enforce_anonymous_allowed();

CREATE TRIGGER trg_enforce_anonymous_allowed_posts BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION private.enforce_anonymous_allowed();



-- db diff가 컬럼 grant와 함수 grant를 놓친다. get_post_comments는 반환 컬럼(anonymous_label)이 늘어
-- drop+create됐고, drop이 grant를 함께 날리므로 다시 주지 않으면 아무도 못 부른다.
grant select (id,pub_id,type,name,description,image_url,join_policy,allow_anonymous_posts,member_count,created_at,deleted_at) on public.spaces to authenticated;
grant update (name,description,allow_anonymous_posts) on public.spaces to authenticated;

-- 본인 행만(RLS). suspended_by는 보복 방지로, strike_count는 목록에 상시로 뿌리면 probe 비용 없이
-- 공짜 작성자 지도가 나오므로 뺀다 -- 관리자는 정지 RPC의 응답으로만 알 수 있다.
grant select (space_id,user_id,suspended_until) on public.space_anonymity_suspensions to authenticated;
grant select, insert, update, delete on public.space_anonymity_suspensions to service_role;

revoke execute on function private.can_post_anonymously(bigint,bigint), private.enforce_anonymous_allowed(), private.suspend_anonymity(bigint,bigint) from public, anon, authenticated, service_role;
revoke execute on function public.suspend_post_author_anonymity(bigint), public.suspend_comment_author_anonymity(bigint), public.get_post_comments(bigint,bigint,int4) from public, anon, authenticated, service_role;
grant execute on function public.suspend_post_author_anonymity(bigint), public.suspend_comment_author_anonymity(bigint), public.get_post_comments(bigint,bigint,int4) to authenticated;
