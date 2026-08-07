set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.purge_deleted_content(p_older_than interval DEFAULT '7 days'::interval, p_limit integer DEFAULT 100)
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
  orphan_total bigint := 0;
  removed bigint;
begin
  perform private.require_service_role();
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'limit must be between 1 and 1000'; end if;
  if p_older_than is null or p_older_than < interval '1 day' then raise exception 'purge cutoff must be at least 1 day'; end if;
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
  --
  -- 배치를 id 배열로 **한 번** 고정하고 그 안에서만 벗기면 안 된다: 최상위 댓글 삭제가 서브트리를
  -- 통째로 같은 deleted_at으로 만들기 때문에 큰 트리는 배치 경계에서 잘리고, 뽑힌 p_limit개가 전부
  -- "자식이 배치 밖에 있는" 중간 노드이면 한 행도 못 지운 채 다음 실행이 같은 집합을 다시 고른다
  -- -- 영영 안 줄어든다. 매 라운드 잎을 다시 찾으면 한 겹씩 확실히 벗겨진다.
  loop
    select array_agg(t.id) into target_comments
    from (
      select c.id from public.comments c
      where c.deleted_at < cutoff
        and not exists(select 1 from public.comments child where child.parent_id=c.id)
      order by c.deleted_at
      limit p_limit - orphan_total
    ) t;
    exit when target_comments is null;

    -- soft_delete_comment가 이미 지웠지만, service_role이 직접 소프트 삭제한 행도 있을 수 있다.
    delete from public.comment_reactions where comment_id=any(target_comments);
    delete from public.comments where id=any(target_comments);
    get diagnostics removed = row_count;
    comment_total := comment_total + removed;
    orphan_total := orphan_total + removed;
    exit when orphan_total >= p_limit;
  end loop;

  return query select post_total, comment_total;
end;
$function$
;

