-- migra가 생성 컬럼(content_normalized 등)의 ADD를 이 함수 정의보다 앞에 배치해, 그대로 적용하면
-- "function private.normalize_search does not exist"로 실패한다. 컬럼이 이 함수에 의존하므로 먼저 만든다.
set check_function_bodies = off;

create or replace function private.normalize_search(p text)
returns text language sql immutable set search_path to '' as $function$
  select case when p is null then null
    else regexp_replace(lower(normalize(p, nfc)), '\s+', '', 'g') end
$function$;

drop trigger if exists "trg_mark_post_edited" on "public"."posts";

drop index if exists "public"."idx_comments_content_search_gin";

drop index if exists "public"."idx_posts_author_created_at";

drop index if exists "public"."idx_messages_content_search_gin";

drop index if exists "public"."idx_posts_content_search_gin";

drop index if exists "public"."idx_posts_title_search_gin";

alter table "public"."comment_reactions" drop column "updated_at";

alter table "public"."messages" add column "content_normalized" text generated always as (private.normalize_search(content)) stored;

alter table "public"."post_reactions" drop column "updated_at";

alter table "public"."posts" add column "content_normalized" text generated always as (private.normalize_search(content)) stored;

alter table "public"."posts" add column "title_normalized" text generated always as (private.normalize_search(title)) stored;

CREATE INDEX idx_messages_content_search_gin ON public.messages USING gin (content_normalized extensions.gin_trgm_ops) WHERE (deleted_at IS NULL);

CREATE INDEX idx_posts_content_search_gin ON public.posts USING gin (content_normalized extensions.gin_trgm_ops) WHERE (deleted_at IS NULL);

CREATE INDEX idx_posts_title_search_gin ON public.posts USING gin (title_normalized extensions.gin_trgm_ops) WHERE (deleted_at IS NULL);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.escape_like(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_')
$function$
;

CREATE OR REPLACE FUNCTION private.normalize_search(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case when p is null then null
    else regexp_replace(lower(normalize(p, nfc)), '\s+', '', 'g') end
$function$
;

CREATE OR REPLACE FUNCTION private.mark_message_edited()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare body_changed boolean;
begin
  if new.content is not null then
    new.content := nullif(btrim(new.content), '');
  end if;

  body_changed := new.content is distinct from old.content
    or new.content_ciphertext is distinct from old.content_ciphertext;

  -- 삭제는 편집이 아니다. soft_delete_message()도 본문을 비우는 UPDATE라서, 이 구분이
  -- 없으면 아래 편집 시간창이 그걸 붙잡아 15분 지난 자기 메시지를 지울 수 없게 만든다.
  -- (deleted_at에는 authenticated 컬럼 grant가 없다 -- security definer RPC와
  --  service_role만 세울 수 있고, 그 RPC가 발신자 본인인지 이미 확인한다.)
  if new.deleted_at is not null and old.deleted_at is null then
    return new;
  end if;

  -- 편집으로 본문을 비우는 것은 삭제를 가장한 우회다. messages_pin_update가 아무 멤버에게나 active
  -- row UPDATE를 열어주는데 그 정책엔 content is not null 조건이 없어(messages_update에는 있다),
  -- 발신자가 15분 내에 {"content": null}이나 공백만(위 nullif로 null이 된다)으로 PATCH하면
  -- deleted_at 없이 본문만 사라진 좀비 메시지가 된다 -- soft_delete_message를 거치지 않아 첨부·반응·
  -- 봉투 정리도 건너뛴다. 삭제(deleted_at 설정)는 위에서 이미 빠졌으니, 여기 오면 본문은 반드시 남아야 한다.
  if new.content is null and new.content_ciphertext is null then
    raise exception 'a message body cannot be emptied by an edit; delete it instead';
  end if;

  -- messages_pin_update lets any conversation member update an active
  -- message row (for pinning), which as a side effect widens row-level
  -- visibility for this UPDATE command as a whole. Column grants alone
  -- can't re-narrow that back down, so content edits are only actually
  -- authorized here: sender, within the edit window.
  if body_changed
    and (old.sender_id <> private.current_profile_id() or old.created_at < now() - interval '15 minutes')
  then
    raise exception 'not allowed to edit this message';
  end if;

  if old.deleted_at is null and new.deleted_at is null and body_changed then
    new.edited_at := now();
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
  -- INSERT에도 걸어 작성 시 앞뒤 공백을 지우지만(수정 때만 트리밍되던 비대칭 제거) updated_at은
  -- UPDATE일 때만 찍는다 -- 방금 만든 글은 수정된 적이 없다. old는 INSERT에 없으므로 tg_op 가드가
  -- 없으면 new.x is distinct from (null)이 참이 되어 갓 만든 글에 updated_at이 찍힌다.
  if tg_op = 'UPDATE' and (
       new.title is distinct from old.title
    or new.content is distinct from old.content
    or new.category_id is distinct from old.category_id
  ) then
    new.updated_at := now();
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

CREATE OR REPLACE FUNCTION public.edit_encrypted_message(p_id bigint, p_content_ciphertext text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true); target public.messages;
begin
  -- 내가 멤버인 대화의 메시지만 잡는다. 이 조건이 없으면 비멤버가 임의의 message_id로 "존재하나 /
  -- 1:1인가 / 내가 보냈나"를 예외 메시지 차이로 스캔할 수 있다(search_messages와 같은 방어).
  select * into target from public.messages
  where id=p_id and deleted_at is null and private.is_conversation_member(conversation_id)
  for update;
  if target.id is null then raise exception 'message not found'; end if;
  if not private.is_direct_conversation(target.conversation_id) then raise exception 'conversation is not end-to-end encrypted'; end if;
  if target.sender_id<>caller_id then raise exception 'message sender required'; end if;
  if target.created_at<now()-interval '15 minutes' then raise exception 'not allowed to edit this message'; end if;
  if p_content_ciphertext is null then raise exception 'message body required'; end if;

  -- edited_at은 trg_mark_message_edited가 찍는다.
  update public.messages set content_ciphertext=decode(p_content_ciphertext,'base64') where id=p_id;
end $function$
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

CREATE OR REPLACE FUNCTION public.search_messages(p_query text, p_conversation_id bigint)
 RETURNS TABLE(message_id bigint, content_snippet text, sender_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare normalized_query text := private.normalize_search(p_query);
begin
  if p_conversation_id is null then raise exception 'conversation target required'; end if;
  if p_query is null or char_length(btrim(p_query)) not between 1 and 200 or coalesce(normalized_query,'')='' then raise exception 'query must contain 1 to 200 characters'; end if;
  -- 멤버십을 **먼저** 본다. is_direct_conversation은 security definer라 RLS를 지나쳐 대화 타입을
  -- 답해 주므로, 이 순서가 뒤집히면 비멤버가 "예외가 뜨는가 / 빈 결과가 오는가"로 임의의
  -- conversation_id(bigserial이라 순차 추측된다)가 1:1인지를 스캔할 수 있다. 내용은 안 새지만
  -- 어떤 id가 DM인지가 샌다.
  if not private.is_conversation_member(p_conversation_id) then raise exception 'conversation membership required'; end if;
  if private.is_direct_conversation(p_conversation_id) then
    raise exception 'direct conversations are end-to-end encrypted: search them on the client';
  end if;
  -- content_normalized(생성 컬럼)로 비교해 그 위의 trgm 인덱스를 탄다. 검색어의 %,_는
  -- escape_like로 무력화한다 -- 안 그러면 '30%'가 와일드카드로 해석돼 1:1 클라이언트 검색과
  -- 다른 결과를 낸다. 둘 다 소문자로 접혀 있으니 ilike가 아니라 like다.
  return query select m.id,left(m.content,300),p.name,m.created_at
  from public.messages m join public.profiles p on p.id=m.sender_id
  where m.conversation_id=p_conversation_id
    and m.deleted_at is null
    and m.content is not null
    and m.content_normalized like '%'||private.escape_like(normalized_query)||'%'
  order by m.created_at desc,m.id desc limit 50;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_posts(p_query text, p_space_id bigint)
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content_snippet text, author jsonb, created_at timestamp with time zone)
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
  select p.id, p.pub_id, p.title, left(p.content,300),
         private.post_author(p.author_id, p.is_anonymous),
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
  -- can_manage_space가 아니라 can_curate_space다: 고정은 게시판을 정리하는 일이라 manager도 한다.
  -- (남의 글 삭제·익명 정지는 여전히 can_manage_space -- 그건 사람을 다루는 일이다.)
  -- 권한 조건을 SELECT에 합쳐 존재 오라클을 없앤다(soft_delete_post와 같은 이유).
  select space_id into target_space_id
  from public.posts
  where id=p_id and deleted_at is null and private.can_curate_space(space_id)
  for update;
  if not found then return; end if;

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
  target_space_id bigint;
begin
  -- soft_delete_post와 같은 이유로 권한 조건을 SELECT에 합친다: "없는 댓글"과 "권한 없는 댓글"이
  -- 똑같이 0행이 되어 존재 여부 오라클을 없앤다.
  select p.space_id into target_space_id
  from public.comments c
  join public.posts p on p.id=c.post_id
  where c.id=p_id and c.deleted_at is null
    and (c.author_id=caller_id or private.can_manage_space(p.space_id))
  for update of c;
  if not found then return; end if;

  delete from public.comment_reactions where comment_id=p_id;

  -- 행을 지우지 않고 본문만 비운다. 답글이 달려 있으면 tombstone으로 남아야 트리가 끊기지 않는데
  -- (comments_select의 has_active_descendant), 그때 원문이 딸려 나가면 안 된다.
  update public.comments
  set content=null, deleted_at=now(), deleted_by=caller_id
  where id=p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_message(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true); target_sender_id bigint;
begin
  -- 내 메시지만 잡는다(sender면 당연히 멤버다). 이 조건이 없으면 "없는 메시지 -> 조용한 리턴"과
  -- "남의 메시지 -> 예외"가 갈려, 비멤버가 임의 id로 메시지 존재·활성 여부를 알아내는 오라클이 된다.
  select sender_id into target_sender_id from public.messages
  where id=p_id and deleted_at is null and sender_id=caller_id
  for update;
  if target_sender_id is null then return; end if;

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by)
  select a.storage_bucket,a.storage_path,caller_id
  from public.message_attachments a
  where a.message_id=p_id
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  delete from public.message_attachments where message_id=p_id;
  delete from public.message_reactions where message_id=p_id;
  -- 본문이 사라진 메시지의 봉투는 아무것도 열지 않는다. 남겨두면 삭제된 메시지에 대해
  -- "누가 누구에게 봉인했는가"만 영원히 남는 셈이라, 지우는 쪽이 맞다.
  delete from public.message_keys where message_id=p_id;

  update public.messages
  set content=null,content_ciphertext=null,deleted_at=now(),deleted_by=caller_id
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
  target_space_id bigint;
begin
  -- 권한 조건을 SELECT에 합친다. "없는 글"과 "권한 없는 글"이 똑같이 0행이 되어, 학교 전체
  -- 승인 사용자가 id를 1부터 훑으며 "예외가 뜨나 / 조용히 성공하나"로 비공개 space(징계·상담
  -- 등)에 살아있는 글이 몇 개인지 세던 오라클을 없앤다. 권한이 있으면 그 글만 잡힌다.
  select space_id into target_space_id
  from public.posts
  where id=p_id and deleted_at is null
    and (author_id=caller_id or private.can_manage_space(space_id))
  for update;
  if not found then return; end if;

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

CREATE TRIGGER trg_mark_post_edited BEFORE INSERT OR UPDATE OF title, content, category_id ON public.posts FOR EACH ROW EXECUTE FUNCTION private.mark_post_edited();

drop policy "post_files_insert" on "storage"."objects";


  create policy "post_files_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'post-files'::text) AND (owner_id = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM public.spaces s
  WHERE ((s.pub_id = split_part(objects.name, '/'::text, 1)) AND (s.deleted_at IS NULL) AND private.can_participate_space(s.id) AND private.has_uuid_object_suffix(objects.name, (s.pub_id || '/'::text)))))));

-- migra는 함수 grant를 내지 않는다. 새로 만든 두 private 헬퍼에 손으로 넣는다 -- 안 넣으면
-- normalize_search는 NULL ACL(암묵적 EXECUTE TO PUBLIC, 00-privileges가 잡는다)로 남고,
-- search_messages(security invoker)는 authenticated가 두 함수를 실행하지 못해 죽는다.
revoke execute on function private.escape_like(text) from public, anon, service_role;
grant execute on function private.escape_like(text) to authenticated;
revoke execute on function private.normalize_search(text) from public, anon, service_role;
grant execute on function private.normalize_search(text) to authenticated;



