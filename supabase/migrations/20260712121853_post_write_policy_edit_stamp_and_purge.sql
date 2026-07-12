create type "public"."space_post_policy" as enum ('all', 'managers');

drop policy "posts_insert" on "public"."posts";

alter table "public"."spaces" add column "post_policy" public.space_post_policy not null default 'all'::public.space_post_policy;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.can_post_in_space(p_space_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when (select s.post_policy from public.spaces s where s.id=p_space_id) = 'managers'
      then private.is_space_member(p_space_id, array['owner','admin','manager']::public.member_role[])
    else private.can_participate_space(p_space_id)
  end
$function$
;

CREATE OR REPLACE FUNCTION private.mark_comment_edited()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.content is not null then
    new.content := nullif(btrim(new.content), '');
  end if;
  -- soft_delete_comment도 content를 건드리므로(원문을 비운다) 이 트리거가 돈다. 삭제는 수정이
  -- 아니니 스탬프하지 않는다 -- 안 그러면 tombstone의 updated_at이 "삭제한 시각"이 돼 버린다.
  if old.deleted_at is null and new.deleted_at is null and new.content is distinct from old.content then
    new.updated_at := now();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.mark_post_edited()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.title := btrim(new.title);
  new.content := btrim(new.content);
  -- 카테고리 이동도 작성자가 한 변경이라 수정으로 친다(글에서 그 사람이 바꿀 수 있는 건 이 셋뿐이다).
  if new.title is distinct from old.title
    or new.content is distinct from old.content
    or new.category_id is distinct from old.category_id
  then
    new.updated_at := now();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.purge_deleted_content(p_older_than interval DEFAULT '30 days'::interval, p_limit integer DEFAULT 100)
 RETURNS TABLE(purged_posts bigint, purged_comments bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cutoff timestamptz;
  target_posts bigint[];
  target_comments bigint[];
  post_total bigint := 0;
  comment_total bigint := 0;
  removed bigint;
begin
  perform private.require_service_role();
  if p_limit not between 1 and 1000 then raise exception 'limit must be between 1 and 1000'; end if;
  if p_older_than < interval '1 day' then raise exception 'purge cutoff must be at least 1 day'; end if;
  cutoff := now() - p_older_than;

  select array_agg(t.id) into target_posts
  from (
    select p.id from public.posts p
    where p.deleted_at < cutoff
      and not exists(select 1 from public.post_attachments a where a.post_id=p.id)
    order by p.deleted_at
    limit p_limit
  ) t;

  if target_posts is not null then
    -- 글이 사라지면 그 댓글은 어차피 아무도 못 본다(can_access_post가 post.deleted_at을 본다).
    -- 살아 있는 댓글도 같이 간다 -- comments.post_id가 restrict라 남겨두면 글을 못 지운다.
    delete from public.comment_reactions cr using public.comments c
    where cr.comment_id=c.id and c.post_id=any(target_posts);
    delete from public.post_reactions where post_id=any(target_posts);

    -- parent_id가 restrict라 잎부터 벗겨야 한다. 답글->루트 2단계로는 임의 깊이를 못 지운다
    -- (cleanup_conversation이 messages에 같은 루프를 도는 것과 같은 이유).
    loop
      delete from public.comments c
      where c.post_id=any(target_posts)
        and not exists(select 1 from public.comments child where child.parent_id=c.id);
      get diagnostics removed = row_count;
      comment_total := comment_total + removed;
      exit when removed = 0;
    end loop;

    -- notifications / post_mentions / comment_mentions는 cascade라 알아서 따라간다.
    delete from public.posts where id=any(target_posts);
    get diagnostics post_total = row_count;
  end if;

  -- 살아 있는 글에 달린, 삭제된 지 오래된 댓글. 자식이 하나라도 있으면(살아 있든 죽었든) restrict
  -- 때문에 못 지운다 -- 그래서 잎만 걷는다. 자식이 전부 죽은 서브트리는 잎부터 차례로 걷혀 결국
  -- 통째로 사라지고, 살아 있는 답글이 하나라도 달린 tombstone은 계속 남는다(답글 사슬이 끊기면
  -- 안 되니 comments_select가 has_active_descendant로 그걸 계속 보여준다).
  select array_agg(t.id) into target_comments
  from (
    select c.id from public.comments c
    where c.deleted_at < cutoff
    order by c.deleted_at
    limit p_limit
  ) t;

  if target_comments is not null then
    -- soft_delete_comment가 이미 지웠지만, service_role이 직접 소프트 삭제한 행도 있을 수 있다.
    delete from public.comment_reactions where comment_id=any(target_comments);
    loop
      delete from public.comments c
      where c.id=any(target_comments)
        and not exists(select 1 from public.comments child where child.parent_id=c.id);
      get diagnostics removed = row_count;
      comment_total := comment_total + removed;
      exit when removed = 0;
    end loop;
  end if;

  return query select post_total, comment_total;
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
  -- security definer라 posts_insert 정책이 적용되지 않는다 -- 같은 검사를 여기서 다시 해야
  -- 이 RPC가 post_policy를 우회하는 뒷문이 되지 않는다.
  if not private.can_post_in_space(p_space_id) then raise exception 'not allowed to post in this space'; end if;

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


  create policy "posts_insert"
  on "public"."posts"
  as permissive
  for insert
  to authenticated
with check (((author_id = private.current_profile_id()) AND private.can_post_in_space(space_id)));


CREATE TRIGGER trg_mark_comment_edited BEFORE UPDATE OF content ON public.comments FOR EACH ROW EXECUTE FUNCTION private.mark_comment_edited();

CREATE TRIGGER trg_mark_post_edited BEFORE UPDATE OF title, content, category_id ON public.posts FOR EACH ROW EXECUTE FUNCTION private.mark_post_edited();



-- 여기부터는 손으로 붙인다. db diff는 grant를 아예 뱉지 않는다.
--
-- 1) can_post_in_space는 posts_insert 정책이 부른다. RLS 정책 표현식의 함수 호출은 **호출자
--    권한**으로 실행되므로, authenticated에 EXECUTE가 없으면 모든 글쓰기가
--    "permission denied for function can_post_in_space"로 죽는다. can_participate_space에
--    똑같이 grant가 붙어 있는 이유다.
revoke execute on function private.can_post_in_space(bigint) from public, anon, authenticated, service_role;
grant execute on function private.can_post_in_space(bigint) to authenticated;

-- 2) 트리거 함수는 아무도 직접 부를 필요가 없다.
revoke execute on function private.mark_post_edited(), private.mark_comment_edited()
from public, anon, authenticated, service_role;

-- 3) purge는 유지보수용이다. 안 잠그면 Postgres 기본값대로 EXECUTE가 PUBLIC에 열린 채 배포된다
--    (require_service_role()이 막긴 하지만, 문을 열어두고 안에서 막을 이유가 없다).
revoke execute on function public.purge_deleted_content(interval,int4) from public, anon, authenticated, service_role;
grant execute on function public.purge_deleted_content(interval,int4) to service_role;

-- 4) spaces의 새 컬럼 post_policy. 컬럼 단위 grant라 diff가 못 본다 -- 없으면 관리자가 공지형
--    그룹으로 전환할 수가 없고(update), 프론트가 현재 정책을 읽을 수도 없다(select).
grant select (post_policy) on public.spaces to authenticated;
grant update (post_policy) on public.spaces to authenticated;
