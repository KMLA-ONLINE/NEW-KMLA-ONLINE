drop function if exists "private"."suspend_anonymity"(p_space_id bigint, p_author_id bigint);

drop function if exists "public"."suspend_comment_author_anonymity"(p_comment_id bigint);

drop function if exists "public"."suspend_post_author_anonymity"(p_post_id bigint);

alter table "public"."space_anonymity_suspensions" drop column "strike_count";

alter table "public"."post_attachments" add constraint "post_attachments_dimension_check" CHECK ((((width IS NULL) = (height IS NULL)) AND ((width IS NULL) OR ((width >= 1) AND (width <= 65535) AND (height >= 1) AND (height <= 65535))))) not valid;

alter table "public"."post_attachments" validate constraint "post_attachments_dimension_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.suspend_anonymity(p_space_id bigint, p_author_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  insert into public.space_anonymity_suspensions(space_id,user_id,suspended_until,suspended_by)
  values (p_space_id, p_author_id, now() + interval '7 days', caller_id)
  on conflict (space_id,user_id) do update
  set suspended_until=excluded.suspended_until,
      suspended_by=excluded.suspended_by,
      created_at=excluded.created_at
  where public.space_anonymity_suspensions.suspended_until <= now();
end;
$function$
;

CREATE OR REPLACE FUNCTION private.undo_anonymity_suspension(p_space_id bigint, p_author_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_current_profile(true);
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  delete from public.space_anonymity_suspensions
  where space_id=p_space_id and user_id=p_author_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.validate_post_attachments(p_post_id bigint, p_space_pub_id text, p_attachments jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare expected_prefix text := p_space_pub_id || '/';
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
      -- width/height는 선택이지만 규칙은 post_attachments_dimension_check와 같다: 함께 오고,
      -- 오면 1..65535다. 여기서도 보는 이유는 실패 메시지다 -- 테이블 제약에만 맡기면 클라이언트가
      -- 'invalid post attachment' 대신 제약 이름이 박힌 23514를 받는다.
      -- 숫자가 아닌 값은 타입부터 걸러낸다(문자열이 오면 아래 ::int4가 raw 22P02로 터진다).
      or coalesce(jsonb_typeof(item.value->'width'),'null') not in ('number','null')
      or coalesce(jsonb_typeof(item.value->'height'),'null') not in ('number','null')
      or (item.value->>'width' is null) <> (item.value->>'height' is null)
      or (item.value->>'width')::int4 not between 1 and 65535
      or (item.value->>'height')::int4 not between 1 and 65535
      or (
        not exists(
          select 1 from public.post_attachments a
          where a.post_id=p_post_id and a.storage_path=item.value->>'storage_path'
        )
        and not exists(
          select 1 from storage.objects o
          where o.bucket_id='post-files'
            and o.name=item.value->>'storage_path'
            -- 내가 올린 blob만. 경로에 uid가 없어졌으므로 "남의 첨부를 자기 글에 붙이기"를
            -- 막던 일이 이 owner_id 검사로 넘어온다(예전엔 경로 prefix의 uid가 그 역할).
            -- storage.objects.owner_id는 text 컬럼이다(uuid인 owner와 헷갈리지 말 것).
            and o.owner_id=(select auth.uid())::text
            and o.created_at>=now()-interval '24 hours'
            and o.metadata->>'mimetype'=item.value->>'content_type'
            and (o.metadata->>'size')::int8=(item.value->>'size_bytes')::int8
        )
      )
  ) then raise exception 'invalid post attachment'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.suspend_comment_author_anonymity(p_comment_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target record;
begin
  select * into target from private.require_anonymous_comment_author(p_comment_id);
  perform private.suspend_anonymity(target.space_id, target.author_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.suspend_post_author_anonymity(p_post_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target record;
begin
  select * into target from private.require_anonymous_post_author(p_post_id);
  perform private.suspend_anonymity(target.space_id, target.author_id);
end;
$function$
;


