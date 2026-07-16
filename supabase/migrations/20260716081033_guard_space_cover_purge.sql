set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.purge_space(p_space_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists(
    select 1 from public.post_attachments a join public.posts p on p.id=a.post_id
    where p.space_id=p_space_id
  ) or exists(
    select 1 from public.spaces
    where id=p_space_id and (image_url is not null or cover_image_url is not null)
  ) then
    return false;
  end if;

  delete from public.comment_reactions r using public.comments c join public.posts p on p.id=c.post_id
  where r.comment_id=c.id and p.space_id=p_space_id;
  delete from public.post_reactions r using public.posts p
  where r.post_id=p.id and p.space_id=p_space_id;
  delete from public.notifications where space_id=p_space_id;

  -- comments.parent_id가 on delete restrict라 부모와 자식을 한 DELETE에 함께 담을 수 없다.
  -- 잎부터 벗겨 내려간다. 멘션은 comments/posts에 cascade로 매달려 같이 떨어진다.
  loop
    delete from public.comments c using public.posts p
    where c.post_id=p.id and p.space_id=p_space_id
      and not exists(select 1 from public.comments child where child.parent_id=c.id);
    exit when not found;
  end loop;

  delete from public.posts where space_id=p_space_id;
  delete from public.space_join_requests where space_id=p_space_id;
  delete from public.space_invites where space_id=p_space_id;
  delete from public.space_anonymity_suspensions where space_id=p_space_id;
  delete from public.space_categories where space_id=p_space_id;
  -- trg_validate_space_owner는 deferred라 커밋 시점에 센다. 그때는 spaces 행도 없어서 통과한다.
  delete from public.space_members where space_id=p_space_id;
  delete from public.spaces where id=p_space_id;
  return true;
end;
$function$
;


