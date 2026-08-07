create type "public"."author_attribution" as enum ('staff');

create type "public"."space_anonymity_policy" as enum ('disabled', 'optional', 'required');

alter table "public"."spaces" add column "anonymity_policy" public.space_anonymity_policy not null default 'optional'::public.space_anonymity_policy;

-- Preserve the former boolean policy: false was named-only, true allowed an anonymous choice.
update "public"."spaces"
set "anonymity_policy" = case
  when "allow_anonymous_posts" then 'optional'::public.space_anonymity_policy
  else 'disabled'::public.space_anonymity_policy
end;

drop trigger if exists "trg_enforce_anonymous_allowed_comments" on "public"."comments";

drop trigger if exists "trg_enforce_anonymous_allowed_posts" on "public"."posts";

drop policy "comment_reactions_select" on "public"."comment_reactions";

drop policy "post_reactions_select" on "public"."post_reactions";

drop policy "space_members_select" on "public"."space_members";

drop function if exists "private"."enforce_anonymous_allowed"();

drop function if exists "public"."create_post_with_attachments"(p_space_id bigint, p_title text, p_content text, p_attachments jsonb, p_category_id bigint, p_is_anonymous boolean);

drop function if exists "public"."create_space"(p_type public.space_type, p_name text, p_description text, p_pub_id text, p_join_policy public.space_join_policy, p_post_policy public.space_post_policy, p_allow_anonymous_posts boolean);

drop function if exists "public"."get_post"(p_pub_id uuid);

drop function if exists "public"."get_post_comments"(p_post_id bigint, p_after_id bigint, p_limit integer);

drop function if exists "public"."list_feed_posts"(p_before_id bigint, p_limit integer);

drop function if exists "public"."list_space_posts"(p_space_id bigint, p_category_id bigint, p_before_id bigint, p_limit integer);

drop function if exists "public"."search_posts"(p_query text, p_space_id bigint);

alter table "public"."comment_reactions" add column "is_anonymous" boolean not null default false;

alter table "public"."comments" add column "author_attribution" public.author_attribution;

alter table "public"."post_reactions" add column "is_anonymous" boolean not null default false;

alter table "public"."posts" add column "author_attribution" public.author_attribution;

alter table "public"."spaces" drop column "allow_anonymous_posts";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.enforce_content_anonymity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_space_id bigint;
  target_policy public.space_anonymity_policy;
  target_type public.space_type;
  author_role public.member_role;
begin
  if tg_table_name='posts' then
    target_space_id := new.space_id;
  else
    select p.space_id into target_space_id from public.posts p where p.id=new.post_id;
  end if;

  select s.anonymity_policy, s.type into target_policy, target_type
  from public.spaces s where s.id=target_space_id and s.deleted_at is null;
  if not found then raise exception 'space not found'; end if;

  select sm.role into author_role
  from public.space_members sm
  where sm.space_id=target_space_id and sm.user_id=new.author_id and sm.banned_at is null;

  -- 운영진 귀속은 항상 익명 공간에서만 쓴다. 공식 그룹은 자동, 비공식 그룹은 작성자가 선택한다.
  if target_policy='required' and author_role=any(array['owner','admin','manager']::public.member_role[]) then
    if target_type='group' then
      new.author_attribution := 'staff';
    elsif new.author_attribution<>'staff' then
      new.author_attribution := null;
    end if;
  else
    new.author_attribution := null;
  end if;

  if target_policy='required' then
    new.is_anonymous := true;
  elsif target_policy='disabled' then
    new.is_anonymous := false;
  end if;

  if not private.can_post_anonymously(target_space_id, new.author_id) then
    if new.is_anonymous then
      raise exception 'anonymous posting is not available in this space';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.set_reaction_anonymity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_policy public.space_anonymity_policy;
begin
  if tg_table_name='post_reactions' then
    select s.anonymity_policy into target_policy
    from public.posts p join public.spaces s on s.id=p.space_id
    where p.id=new.post_id and p.deleted_at is null;
  else
    select s.anonymity_policy into target_policy
    from public.comments c
    join public.posts p on p.id=c.post_id
    join public.spaces s on s.id=p.space_id
    where c.id=new.comment_id and c.deleted_at is null and p.deleted_at is null;
  end if;
  if not found then raise exception 'reaction target not found'; end if;
  new.is_anonymous := target_policy='required';
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_post_with_attachments(p_space_id bigint, p_title text, p_content text, p_attachments jsonb DEFAULT '[]'::jsonb, p_category_id bigint DEFAULT NULL::bigint, p_is_anonymous boolean DEFAULT false, p_author_attribution public.author_attribution DEFAULT NULL::public.author_attribution)
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
  -- security definer라 posts_insert 정책이 적용되지 않는다 -- 같은 검사를 여기서 다시 해야
  -- 이 RPC가 post_policy를 우회하는 뒷문이 되지 않는다.
  if not private.can_post_in_space(p_space_id) then raise exception 'not allowed to post in this space'; end if;

  -- 길이 제약과 카테고리 동일 space 검사는 테이블 check와 trg_validate_post_category가 한다.
  insert into public.posts(space_id,author_id,title,content,is_anonymous,author_attribution,category_id)
  values(p_space_id,caller_id,p_title,p_content,coalesce(p_is_anonymous,false),p_author_attribution,p_category_id)
  returning id, pub_id into new_post_id, new_pub_id;

  perform private.validate_post_attachments(new_post_id, space_pub_id, p_attachments);
  perform private.insert_post_attachments(new_post_id, p_attachments);

  return new_pub_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_space(p_type public.space_type, p_name text, p_description text DEFAULT NULL::text, p_pub_id text DEFAULT NULL::text, p_join_policy public.space_join_policy DEFAULT 'public'::public.space_join_policy, p_post_policy public.space_post_policy DEFAULT 'all'::public.space_post_policy, p_anonymity_policy public.space_anonymity_policy DEFAULT 'optional'::public.space_anonymity_policy)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true); new_space_id bigint;
begin
  if p_type='group' then perform private.require_app_admin(); end if;
  if p_pub_id is not null and exists(select 1 from public.spaces where pub_id=p_pub_id) then
    raise exception 'pub id already taken';
  end if;

  insert into public.spaces(type,name,description,join_policy,post_policy,anonymity_policy,created_by)
  values(p_type,btrim(p_name),nullif(btrim(coalesce(p_description,'')),''),p_join_policy,p_post_policy,p_anonymity_policy,caller_id)
  returning id into new_space_id;

  insert into public.space_members(space_id,user_id,role) values(new_space_id,caller_id,'owner');
  -- pub_id를 안 넘기면 컬럼 default(랜덤 12자)를 그대로 둔다. coalesce가 그 값을 자기 자신으로
  -- 되쓰므로 슬러그 생성 규칙이 스키마 한 곳에만 산다.
  update public.spaces set pub_id=coalesce(p_pub_id,pub_id), member_count=1 where id=new_space_id;
  return new_space_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_post_anonymous_reaction_counts(p_post_id bigint)
 RETURNS TABLE(reaction_type_id bigint, reaction_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_current_profile(true);
  if not private.can_access_post(p_post_id) then raise exception 'post access required'; end if;

  return query
  select r.reaction_type_id, count(*)
  from public.post_reactions r
  where r.post_id=p_post_id and r.is_anonymous
  group by r.reaction_type_id
  order by r.reaction_type_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.can_post_anonymously(p_space_id bigint, p_user_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.spaces s where s.id=p_space_id and s.anonymity_policy<>'disabled')
    and not exists(
      select 1 from public.space_anonymity_suspensions x
      where x.space_id=p_space_id and x.user_id=p_user_id and x.suspended_until > now()
    )
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_mention_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  owner_column text := tg_argv[0];
  owner_id bigint := (to_jsonb(new) ->> owner_column)::bigint;
  existing int4;
begin
  if (
    case tg_table_name
      when 'post_mentions' then exists(
        select 1 from public.posts p join public.spaces s on s.id=p.space_id
        where p.id=owner_id and s.anonymity_policy='required'
      )
      else exists(
        select 1 from public.comments c
        join public.posts p on p.id=c.post_id
        join public.spaces s on s.id=p.space_id
        where c.id=owner_id and s.anonymity_policy='required'
      )
    end
  ) then
    raise exception 'mentions are not available in required-anonymity spaces';
  end if;

  execute format('select count(*) from public.%I where %I = $1', tg_table_name, owner_column)
  into existing using owner_id;
  if existing >= private.max_mentions() then
    raise exception 'at most % people can be mentioned', private.max_mentions();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_post(p_pub_id uuid)
 RETURNS TABLE(post_id bigint, pub_id uuid, space_id bigint, title text, content text, is_anonymous boolean, author_attribution public.author_attribution, is_author_anonymity_suspended boolean, author jsonb, is_mine boolean, category jsonb, pinned_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, comment_count bigint, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint, attachments jsonb)
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
    p.id, p.pub_id, p.space_id, p.title, p.content, p.is_anonymous, p.author_attribution,
    -- list_space_posts와 같은 관리자 전용 게이트(private.can_manage_space) -- 주석은 그쪽에 있다.
    private.can_manage_space(p.space_id) and exists(
      select 1 from public.space_anonymity_suspensions x
      where x.space_id=p.space_id and x.user_id=p.author_id and x.suspended_until > now()
    ),
    private.post_author(p.author_id, p.is_anonymous or p.author_attribution='staff'),
    p.author_id=caller_id,
    case when cat.id is null then null else
      jsonb_build_object('id',cat.id,'name',cat.name,'sort_order',cat.sort_order) end,
    p.pinned_at, p.created_at, p.updated_at,
    (select count(*) from public.comments c where c.post_id=p.id and c.deleted_at is null),
    (select count(*) from public.post_reactions r where r.post_id=p.id),
    rs.top_reactions,
    rs.my_reaction_id,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,
      'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,
      'width',a.width,'height',a.height
    ) order by a.sort_order, a.id)
    from public.post_attachments a join public.mime_types mime on mime.content_type=a.content_type
    where a.post_id=p.id),'[]'::jsonb)
  from public.posts p
  left join public.space_categories cat on cat.id=p.category_id
  left join lateral (select * from private.post_reaction_summary(p.id, caller_id)) rs on true
  where p.id=target_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_post_comments(p_post_id bigint, p_after_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(comment_id bigint, parent_id bigint, content text, is_anonymous boolean, author_attribution public.author_attribution, author jsonb, anonymous_label text, is_author_anonymity_suspended boolean, is_mine boolean, is_deleted boolean, created_at timestamp with time zone, updated_at timestamp with time zone, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint)
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
  -- null을 빼먹으면 `limit null`이 되어 상한이 통째로 사라진다(null < 1은 참이 아니라 null이라
  -- 이 가드를 그냥 지나간다). 그러면 클라이언트가 p_limit=null 한 번으로 접근 가능한 글/댓글을
  -- 전부 빨아낼 수 있다 -- 05-chat의 읽기 RPC들이 처음부터 `p_limit is null`을 함께 본 이유다.
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

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
    -- 삭제된 익명 댓글도 번호 매김에 포함한다(deleted_at 필터 없음). 빼면 A(익명1)가 지워질 때
    -- B가 익명2에서 익명1로 당겨져, 예전 화면·알림에 남은 "익명2"가 다른 사람을 가리키게 된다.
    -- tombstone은 author_id와 is_anonymous를 그대로 유지하므로 앵커로 쓸 수 있다. 번호는 그
    -- 작성자의 (삭제 여부 무관) 최초 댓글 시각으로 고정된다.
    select c.author_id, dense_rank() over (order by min(c.created_at), min(c.id)) as idx
    from public.comments c
    where c.post_id=p_post_id and c.is_anonymous
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
    c.author_attribution,
    -- tombstone은 본문도 작성자도 내리지 않는다. 남는 건 "여기 삭제된 댓글이 있었다"는 사실뿐이다.
    case when c.deleted_at is not null then null
         else private.post_author(c.author_id, c.is_anonymous or c.author_attribution='staff') end,
    -- 익명 댓글의 표시 이름. 익명 글의 글쓴이가 자기 글에 단 댓글이면 "글쓴이"다 -- 신원은 여전히
    -- 안 드러나면서(어차피 익명 글이니까) 같은 사람임은 보인다. 글이 실명이면 "글쓴이"를 붙이면
    -- 안 된다: 글쓴이가 누군지 다 아는데 그 라벨을 달면 익명 댓글이 곧바로 까진다.
    case
      when c.deleted_at is not null or not c.is_anonymous or c.author_attribution='staff' then null
      when post_is_anonymous and c.author_id=post_author_id then '글쓴이'
      else '익명' || (select ai.idx from anon_index ai where ai.author_id=c.author_id)
    end,
    private.can_manage_space((select p.space_id from public.posts p where p.id=c.post_id)) and exists(
      select 1 from public.space_anonymity_suspensions x
      join public.posts p on p.space_id=x.space_id
      where p.id=c.post_id and x.user_id=c.author_id and x.suspended_until>now()
    ),
    c.author_id=caller_id and c.deleted_at is null,
    c.deleted_at is not null,
    c.created_at,
    c.updated_at,
    (select count(*) from public.comment_reactions r where r.comment_id=c.id),
    rs.top_reactions,
    rs.my_reaction_id
  from thread th
  join public.comments c on c.id=th.id
  left join lateral (select * from private.comment_reaction_summary(c.id, caller_id)) rs on true
  where c.deleted_at is null or private.has_active_descendant(c.id)
  order by c.created_at, c.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_post_reactors(p_post_id bigint, p_reaction_type_id bigint DEFAULT NULL::bigint, p_after_user_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 30)
 RETURNS TABLE(user_id bigint, name text, avatar_url text, reaction_type_id bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  after_created_at timestamptz;
begin
  perform private.require_current_profile(true);
  if not private.can_access_post(p_post_id) then raise exception 'post access required'; end if;
  -- null 상한 가드. `p_limit < 1`은 null일 때 참이 아니라 null이라 그냥 지나가고, `limit null`은
  -- 상한이 없다는 뜻이라 접근 가능한 반응자를 한 번에 통째로 빨아낼 수 있다(다른 읽기 RPC와 동일).
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  if p_after_user_id is not null then
    select r.created_at into after_created_at
    from public.post_reactions r where r.post_id=p_post_id and r.user_id=p_after_user_id;
  end if;

  return query
  select r.user_id, pr.name, pr.avatar_url, r.reaction_type_id, r.created_at
  from public.post_reactions r
  join public.profiles pr on pr.id=r.user_id
  where r.post_id=p_post_id and not r.is_anonymous
    and (p_reaction_type_id is null or r.reaction_type_id=p_reaction_type_id)
    and (p_after_user_id is null or (r.created_at, r.user_id) < (after_created_at, p_after_user_id))
  order by r.created_at desc, r.user_id desc
  limit p_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_feed_posts(p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content text, is_anonymous boolean, author_attribution public.author_attribution, is_author_anonymity_suspended boolean, author jsonb, is_mine boolean, category jsonb, space jsonb, pinned_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, comment_count bigint, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint, attachments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  before_created_at timestamptz;
begin
  -- null을 빼먹으면 `limit null`이 되어 상한이 통째로 사라진다(null < 1은 참이 아니라 null이라
  -- 이 가드를 그냥 지나간다). 그러면 클라이언트가 p_limit=null 한 번으로 접근 가능한 글/댓글을
  -- 전부 빨아낼 수 있다 -- 05-chat의 읽기 RPC들이 처음부터 `p_limit is null`을 함께 본 이유다.
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  -- 커서는 id 하나지만 전체 피드는 (created_at, id) 내림차순이다. 시간도 함께 찾아 행 비교를
  -- 쓰면 각 space의 idx_posts_active_space_created_at을 그대로 이용할 수 있다.
  if p_before_id is not null then
    select p.created_at into before_created_at from public.posts p where p.id=p_before_id;
  end if;

  return query
  select
    p.id,
    p.pub_id,
    p.title,
    p.content,
    p.is_anonymous,
    p.author_attribution,
    -- list_space_posts와 같은 관리자 전용 게이트(private.can_manage_space) -- 주석은 그쪽에 있다.
    private.can_manage_space(p.space_id) and exists(
      select 1 from public.space_anonymity_suspensions x
      where x.space_id=p.space_id and x.user_id=p.author_id and x.suspended_until > now()
    ),
    private.post_author(p.author_id, p.is_anonymous or p.author_attribution='staff'),
    p.author_id=caller_id,
    case when cat.id is null then null else
      jsonb_build_object('id',cat.id,'name',cat.name,'sort_order',cat.sort_order) end,
    jsonb_build_object('name',s.name,'type',s.type,'pub_id',s.pub_id),
    p.pinned_at,
    p.created_at,
    p.updated_at,
    coalesce(counts.comment_count,0),
    coalesce(counts.reaction_count,0),
    coalesce(summary.top_reactions,'[]'::jsonb),
    summary.my_reaction_id,
    coalesce(files.items,'[]'::jsonb)
  from public.posts p
  join public.spaces s on s.id=p.space_id and s.deleted_at is null
  join public.space_members sm
    on sm.space_id=p.space_id and sm.user_id=caller_id and sm.banned_at is null
  left join public.space_categories cat on cat.id=p.category_id
  left join lateral (
    select
      (select count(*) from public.comments c where c.post_id=p.id and c.deleted_at is null) as comment_count,
      (select count(*) from public.post_reactions r where r.post_id=p.id) as reaction_count
  ) counts on true
  left join lateral (select * from private.post_reaction_summary(p.id, caller_id)) summary on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,
      'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,
      'width',a.width,'height',a.height
    ) order by a.sort_order, a.id) as items
    from public.post_attachments a
    join public.mime_types mime on mime.content_type=a.content_type
    where a.post_id=p.id
  ) files on true
  where p.deleted_at is null
    and (p_before_id is null or (p.created_at, p.id) < (before_created_at, p_before_id))
  order by p.created_at desc, p.id desc
  limit p_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_space_posts(p_space_id bigint, p_category_id bigint DEFAULT NULL::bigint, p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content text, is_anonymous boolean, author_attribution public.author_attribution, is_author_anonymity_suspended boolean, author jsonb, is_mine boolean, category jsonb, pinned_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, comment_count bigint, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint, attachments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  before_created_at timestamptz;
begin
  if not private.can_participate_space(p_space_id) then raise exception 'space membership required'; end if;
  -- null을 빼먹으면 `limit null`이 되어 상한이 통째로 사라진다(null < 1은 참이 아니라 null이라
  -- 이 가드를 그냥 지나간다). 그러면 클라이언트가 p_limit=null 한 번으로 접근 가능한 글/댓글을
  -- 전부 빨아낼 수 있다 -- 05-chat의 읽기 RPC들이 처음부터 `p_limit is null`을 함께 본 이유다.
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

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
    page.author_attribution,
    -- 관리자에게만 뜨는 "익명 제한 취소" 메뉴 항목의 표시 여부. can_manage_space로 관리자가 아닌
    -- 호출자에게는 항상 false다 -- 그렇지 않으면 멤버 전원이 익명 글 목록을 훑어 "지금 정지 중인
    -- 사람이 쓴 글"을 공짜로 골라낼 수 있다. 이 함수가 이미 감수하기로 한 상습범 연결 유출(위
    -- suspend_anonymity 주석)조차 그 행동에 비용이 들게 설계돼 있는데, 목록에 상시로 뿌리면 그
    -- 비용이 사라져 정확히 그 문서가 경고하는 "공짜 작성자 지도"가 된다.
    private.can_manage_space(page.space_id) and exists(
      select 1 from public.space_anonymity_suspensions x
      where x.space_id=page.space_id and x.user_id=page.author_id and x.suspended_until > now()
    ),
    private.post_author(page.author_id, page.is_anonymous or page.author_attribution='staff'),
    page.author_id=caller_id,
    case when cat.id is null then null else
      jsonb_build_object('id',cat.id,'name',cat.name,'sort_order',cat.sort_order) end,
    page.pinned_at,
    page.created_at,
    page.updated_at,
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
  left join lateral (select * from private.post_reaction_summary(page.id, caller_id)) summary on true
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
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content_snippet text, author_attribution public.author_attribution, author jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare normalized_query text := private.normalize_search(p_query);
begin
  if p_space_id is null then raise exception 'space target required'; end if;
  if not private.can_participate_space(p_space_id) then raise exception 'space membership required'; end if;
  if p_query is null or char_length(btrim(p_query)) not between 1 and 200 or coalesce(normalized_query,'')='' then
    raise exception 'query must contain 1 to 200 characters';
  end if;

  return query
   select p.id, p.pub_id, p.title, left(p.content,300), p.author_attribution,
          private.post_author(p.author_id, p.is_anonymous or p.author_attribution='staff'),
         p.created_at
  from public.posts p
  where p.space_id=p_space_id
    and p.deleted_at is null
    -- 검색어의 %,_는 escape_like로 무력화한다(search_messages와 같은 이유). 둘 다 소문자로
    -- 접혀 있으니 like다.
    and (p.title_normalized like '%'||private.escape_like(normalized_query)||'%'
      or p.content_normalized like '%'||private.escape_like(normalized_query)||'%')
  order by p.created_at desc, p.id desc
  limit 50;
end;
$function$
;


  create policy "comment_reactions_select"
  on "public"."comment_reactions"
  as permissive
  for select
  to authenticated
using ((private.can_access_comment(comment_id) AND ((NOT is_anonymous) OR (user_id = private.current_profile_id()))));



  create policy "post_reactions_select"
  on "public"."post_reactions"
  as permissive
  for select
  to authenticated
using ((private.can_access_post(post_id) AND ((NOT is_anonymous) OR (user_id = private.current_profile_id()))));



  create policy "space_members_select"
  on "public"."space_members"
  as permissive
  for select
  to authenticated
using ((private.is_space_member(space_id) AND ((user_id = private.current_profile_id()) OR private.can_manage_space(space_id) OR (NOT (EXISTS ( SELECT 1
   FROM public.spaces s
  WHERE ((s.id = space_members.space_id) AND (s.anonymity_policy = 'required'::public.space_anonymity_policy))))))));


CREATE TRIGGER trg_set_comment_reaction_anonymity BEFORE INSERT ON public.comment_reactions FOR EACH ROW EXECUTE FUNCTION private.set_reaction_anonymity();

CREATE TRIGGER trg_set_post_reaction_anonymity BEFORE INSERT ON public.post_reactions FOR EACH ROW EXECUTE FUNCTION private.set_reaction_anonymity();

CREATE TRIGGER trg_enforce_anonymous_allowed_comments BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION private.enforce_content_anonymity();

CREATE TRIGGER trg_enforce_anonymous_allowed_posts BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION private.enforce_content_anonymity();

grant select (author_attribution) on table "public"."posts" to "authenticated";
grant insert (author_attribution) on table "public"."posts" to "authenticated";
grant select (author_attribution) on table "public"."comments" to "authenticated";
grant insert (author_attribution) on table "public"."comments" to "authenticated";
grant select (anonymity_policy) on table "public"."spaces" to "authenticated";
grant update (anonymity_policy) on table "public"."spaces" to "authenticated";

revoke execute on function private.enforce_content_anonymity() from public, anon, authenticated, service_role;
revoke execute on function private.set_reaction_anonymity() from public, anon, authenticated, service_role;

revoke execute on function public.create_space(public.space_type,text,text,text,public.space_join_policy,public.space_post_policy,public.space_anonymity_policy) from public, anon, authenticated, service_role;
grant execute on function public.create_space(public.space_type,text,text,text,public.space_join_policy,public.space_post_policy,public.space_anonymity_policy) to authenticated;

revoke execute on function public.create_post_with_attachments(bigint,text,text,jsonb,bigint,boolean,public.author_attribution) from public, anon, authenticated, service_role;
grant execute on function public.create_post_with_attachments(bigint,text,text,jsonb,bigint,boolean,public.author_attribution) to authenticated;

revoke execute on function public.list_space_posts(bigint,bigint,bigint,integer), public.list_feed_posts(bigint,integer), public.get_post(uuid), public.get_post_comments(bigint,bigint,integer), public.search_posts(text,bigint), public.get_post_anonymous_reaction_counts(bigint) from public, anon, authenticated, service_role;
grant execute on function public.list_space_posts(bigint,bigint,bigint,integer), public.list_feed_posts(bigint,integer), public.get_post(uuid), public.get_post_comments(bigint,bigint,integer), public.search_posts(text,bigint), public.get_post_anonymous_reaction_counts(bigint) to authenticated;

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

  if found and prior_until > now() then
    return query select
      ceil(extract(epoch from prior_until - now()) / 86400)::int4,
      prior_strikes,
      true;
    return;
  end if;

  -- 만료만으로 누범을 지우지 않는다. 오판은 undo_*_anonymity_suspension이 한 단계 되돌린다.
  if not found then prior_strikes := 0; end if;

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
$function$;
