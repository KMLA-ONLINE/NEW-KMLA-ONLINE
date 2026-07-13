set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.comment_reaction_summary(p_comment_id bigint, p_caller_id bigint)
 RETURNS TABLE(top_reactions jsonb, my_reaction_id bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    coalesce((select jsonb_agg(t.icon order by t.n desc, t.icon)
      from (
        select rt.icon, count(*) as n
        from public.comment_reactions r join public.reaction_types rt on rt.id=r.reaction_type_id
        where r.comment_id=p_comment_id and rt.icon is not null
        group by rt.icon order by count(*) desc limit 3
      ) t),'[]'::jsonb),
    (select r.reaction_type_id from public.comment_reactions r where r.comment_id=p_comment_id and r.user_id=p_caller_id)
$function$
;

CREATE OR REPLACE FUNCTION private.insert_post_attachments(p_post_id bigint, p_attachments jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION private.post_reaction_summary(p_post_id bigint, p_caller_id bigint)
 RETURNS TABLE(top_reactions jsonb, my_reaction_id bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    coalesce((select jsonb_agg(t.icon order by t.n desc, t.icon)
      from (
        select rt.icon, count(*) as n
        from public.post_reactions r join public.reaction_types rt on rt.id=r.reaction_type_id
        where r.post_id=p_post_id and rt.icon is not null
        group by rt.icon order by count(*) desc limit 3
      ) t),'[]'::jsonb),
    (select r.reaction_type_id from public.post_reactions r where r.post_id=p_post_id and r.user_id=p_caller_id)
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
  -- security definer라 posts_insert 정책이 적용되지 않는다 -- 같은 검사를 여기서 다시 해야
  -- 이 RPC가 post_policy를 우회하는 뒷문이 되지 않는다.
  if not private.can_post_in_space(p_space_id) then raise exception 'not allowed to post in this space'; end if;

  -- 길이 제약과 카테고리 동일 space 검사는 테이블 check와 trg_validate_post_category가 한다.
  insert into public.posts(space_id,author_id,title,content,is_anonymous,category_id)
  values(p_space_id,caller_id,p_title,p_content,coalesce(p_is_anonymous,false),p_category_id)
  returning id, pub_id into new_post_id, new_pub_id;

  perform private.validate_post_attachments(new_post_id, space_pub_id, p_attachments);
  perform private.insert_post_attachments(new_post_id, p_attachments);

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
 RETURNS TABLE(comment_id bigint, parent_id bigint, content text, is_anonymous boolean, author jsonb, anonymous_label text, is_mine boolean, is_deleted boolean, created_at timestamp with time zone, updated_at timestamp with time zone, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint)
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

CREATE OR REPLACE FUNCTION public.list_space_posts(p_space_id bigint, p_category_id bigint DEFAULT NULL::bigint, p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content text, is_anonymous boolean, author jsonb, is_mine boolean, category jsonb, pinned_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, comment_count bigint, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint, attachments jsonb)
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
  perform private.insert_post_attachments(p_post_id, p_attachments);
end;
$function$
;



-- migra는 함수 grant를 내지 않는다. 새 private 헬퍼 셋을 명시적으로 회수한다(NULL ACL이면
-- 암묵적 EXECUTE TO PUBLIC이 되고, tests/00-privileges.sql이 그걸 잡는다). authenticated에게는
-- 열지 않는다 -- 이 함수들은 전부 security definer RPC 안에서만 소유자 권한으로 호출된다.
revoke execute on function private.post_reaction_summary(bigint,bigint), private.comment_reaction_summary(bigint,bigint), private.insert_post_attachments(bigint,jsonb) from public, anon, authenticated, service_role;

-- MIME seed 정리: post-files 버킷(24MB, 이미지+문서)이 실제로 거부하는 오디오/비디오 11종이
-- post_attachment_mime_types에 "허용"으로 등록돼 있어, 게시글은 그 타입을 절대 올릴 수 없는데도
-- 레지스트리는 받을 것처럼 거짓말했다. 게시판은 이미지+문서만 지원한다 -- 버킷 설정에 맞춘다.
-- (mime_types는 채팅이 쓰므로 건드리지 않고, post_attachment_mime_types에서만 뺀다.)
delete from public.post_attachment_mime_types where content_type like 'audio/%' or content_type like 'video/%';
