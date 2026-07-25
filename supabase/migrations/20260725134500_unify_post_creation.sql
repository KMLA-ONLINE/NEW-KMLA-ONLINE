drop trigger if exists "trg_enforce_post_attachment_shape" on "public"."post_attachments";

drop policy "posts_insert" on "public"."posts";

drop function if exists "private"."enforce_post_attachment_shape"();

set check_function_bodies = off;

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
  -- security definer는 RLS를 우회하므로 이 함수가 post_policy를 직접 강제한다.
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

revoke insert (space_id,author_id,title,content,is_anonymous,author_attribution,category_id)
on public.posts from authenticated;

revoke usage, select on sequence public.posts_id_seq from authenticated;
revoke execute on function private.can_post_in_space(bigint) from authenticated;

revoke execute on function public.create_post_with_attachments(bigint,text,text,jsonb,bigint,boolean,public.author_attribution)
from public, anon, authenticated, service_role;
grant execute on function public.create_post_with_attachments(bigint,text,text,jsonb,bigint,boolean,public.author_attribution)
to authenticated;
