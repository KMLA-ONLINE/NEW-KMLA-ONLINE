create type "public"."notification_type" as enum ('post_comment', 'comment_reply', 'post_mention', 'comment_mention', 'message_mention', 'space_join_request', 'space_join_approved', 'space_join_rejected', 'space_invited', 'space_role_changed', 'space_anonymity_suspended', 'post_removed', 'comment_removed');

revoke select on table "public"."notifications" from "authenticated";

alter table "public"."notifications" drop constraint "notifications_body_check";

alter table "public"."notifications" drop constraint "notifications_content_check";

alter table "public"."notifications" drop constraint "notifications_message_target_check";

alter table "public"."notifications" drop constraint "notifications_title_check";

alter table "public"."notifications" drop constraint "notifications_comment_id_fkey";

alter table "public"."notifications" drop constraint "notifications_message_id_fkey";

alter table "public"."notifications" drop constraint "notifications_post_id_fkey";

alter table "public"."notifications" drop constraint "notifications_recipient_id_fkey";

alter table "public"."notifications" drop constraint "notifications_space_id_fkey";

drop index if exists "public"."idx_notifications_recipient_created_at";

drop index if exists "public"."idx_notifications_unread_recipient_created_at";


  create table "public"."comment_mentions" (
    "comment_id" bigint not null,
    "user_id" bigint not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."comment_mentions" enable row level security;


  create table "public"."post_mentions" (
    "post_id" bigint not null,
    "user_id" bigint not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."post_mentions" enable row level security;

alter table "public"."notifications" drop column "body";

alter table "public"."notifications" drop column "title";

alter table "public"."notifications" add column "actor_is_anonymous" boolean not null default false;

alter table "public"."notifications" add column "payload" jsonb;

alter table "public"."notifications" add column "type" public.notification_type not null;

CREATE UNIQUE INDEX comment_mentions_pkey ON public.comment_mentions USING btree (comment_id, user_id);

CREATE INDEX idx_comment_mentions_user ON public.comment_mentions USING btree (user_id);

CREATE INDEX idx_notifications_recipient ON public.notifications USING btree (recipient_id, id DESC);

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (recipient_id) WHERE (read_at IS NULL);

CREATE INDEX idx_post_mentions_user ON public.post_mentions USING btree (user_id);

CREATE UNIQUE INDEX post_mentions_pkey ON public.post_mentions USING btree (post_id, user_id);

CREATE UNIQUE INDEX uq_notifications_comment_event ON public.notifications USING btree (recipient_id, comment_id) WHERE ((comment_id IS NOT NULL) AND (type = ANY (ARRAY['post_comment'::public.notification_type, 'comment_reply'::public.notification_type, 'comment_mention'::public.notification_type])));

CREATE UNIQUE INDEX uq_notifications_post_mention ON public.notifications USING btree (recipient_id, post_id) WHERE (type = 'post_mention'::public.notification_type);

alter table "public"."comment_mentions" add constraint "comment_mentions_pkey" PRIMARY KEY using index "comment_mentions_pkey";

alter table "public"."post_mentions" add constraint "post_mentions_pkey" PRIMARY KEY using index "post_mentions_pkey";

alter table "public"."comment_mentions" add constraint "comment_mentions_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE not valid;

alter table "public"."comment_mentions" validate constraint "comment_mentions_comment_id_fkey";

alter table "public"."comment_mentions" add constraint "comment_mentions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."comment_mentions" validate constraint "comment_mentions_user_id_fkey";

alter table "public"."notifications" add constraint "notifications_actor_shape_check" CHECK (((type <> ALL (ARRAY['space_join_approved'::public.notification_type, 'space_join_rejected'::public.notification_type, 'space_role_changed'::public.notification_type, 'space_anonymity_suspended'::public.notification_type, 'post_removed'::public.notification_type, 'comment_removed'::public.notification_type])) OR (actor_id IS NULL))) not valid;

alter table "public"."notifications" validate constraint "notifications_actor_shape_check";

alter table "public"."notifications" add constraint "notifications_anonymous_needs_actor" CHECK (((NOT actor_is_anonymous) OR (actor_id IS NOT NULL))) not valid;

alter table "public"."notifications" validate constraint "notifications_anonymous_needs_actor";

alter table "public"."notifications" add constraint "notifications_no_self_notify" CHECK (((actor_id IS NULL) OR (actor_id <> recipient_id))) not valid;

alter table "public"."notifications" validate constraint "notifications_no_self_notify";

alter table "public"."notifications" add constraint "notifications_target_shape_check" CHECK (
CASE type
    WHEN 'post_comment'::public.notification_type THEN ((space_id IS NOT NULL) AND (post_id IS NOT NULL) AND (comment_id IS NOT NULL) AND (message_id IS NULL))
    WHEN 'comment_reply'::public.notification_type THEN ((space_id IS NOT NULL) AND (post_id IS NOT NULL) AND (comment_id IS NOT NULL) AND (message_id IS NULL))
    WHEN 'comment_mention'::public.notification_type THEN ((space_id IS NOT NULL) AND (post_id IS NOT NULL) AND (comment_id IS NOT NULL) AND (message_id IS NULL))
    WHEN 'comment_removed'::public.notification_type THEN ((space_id IS NOT NULL) AND (post_id IS NOT NULL) AND (comment_id IS NOT NULL) AND (message_id IS NULL))
    WHEN 'post_mention'::public.notification_type THEN ((space_id IS NOT NULL) AND (post_id IS NOT NULL) AND (comment_id IS NULL) AND (message_id IS NULL))
    WHEN 'post_removed'::public.notification_type THEN ((space_id IS NOT NULL) AND (post_id IS NOT NULL) AND (comment_id IS NULL) AND (message_id IS NULL))
    WHEN 'message_mention'::public.notification_type THEN ((message_id IS NOT NULL) AND (space_id IS NULL) AND (post_id IS NULL) AND (comment_id IS NULL))
    ELSE ((space_id IS NOT NULL) AND (post_id IS NULL) AND (comment_id IS NULL) AND (message_id IS NULL))
END) not valid;

alter table "public"."notifications" validate constraint "notifications_target_shape_check";

alter table "public"."post_mentions" add constraint "post_mentions_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE not valid;

alter table "public"."post_mentions" validate constraint "post_mentions_post_id_fkey";

alter table "public"."post_mentions" add constraint "post_mentions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."post_mentions" validate constraint "post_mentions_user_id_fkey";

alter table "public"."notifications" add constraint "notifications_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_comment_id_fkey";

alter table "public"."notifications" add constraint "notifications_message_id_fkey" FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_message_id_fkey";

alter table "public"."notifications" add constraint "notifications_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_post_id_fkey";

alter table "public"."notifications" add constraint "notifications_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_recipient_id_fkey";

alter table "public"."notifications" add constraint "notifications_space_id_fkey" FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_space_id_fkey";

set check_function_bodies = off;

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
  execute format('select count(*) from public.%I where %I = $1', tg_table_name, owner_column)
  into existing using owner_id;
  if existing >= private.max_mentions() then
    raise exception 'at most % people can be mentioned', private.max_mentions();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.max_mentions()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select 20 $function$
;

CREATE OR REPLACE FUNCTION private.notify_on_anonymity_suspended()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.notifications(recipient_id,type,space_id,payload)
  values (new.user_id,'space_anonymity_suspended',new.space_id,
          jsonb_build_object('suspended_until',new.suspended_until));
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_on_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_space_id bigint;
  post_author_id bigint;
  parent_author_id bigint;
begin
  select p.space_id, p.author_id into target_space_id, post_author_id
  from public.posts p where p.id=new.post_id and p.deleted_at is null;
  if target_space_id is null then return null; end if;

  if new.parent_id is not null then
    select c.author_id into parent_author_id
    from public.comments c where c.id=new.parent_id and c.deleted_at is null;
  end if;

  insert into public.notifications(recipient_id,type,actor_id,actor_is_anonymous,space_id,post_id,comment_id)
  select distinct on (r.recipient_id)
    r.recipient_id, r.type, new.author_id, new.is_anonymous, target_space_id, new.post_id, new.id
  from (
    -- 답글이 글 댓글보다 구체적이라 이긴다. 내 글에 달린 내 댓글에 답글이 달리면 알림은 하나다.
    select parent_author_id as recipient_id, 'comment_reply'::public.notification_type as type, 1 as priority
    union all
    select post_author_id, 'post_comment'::public.notification_type, 2
  ) r
  join public.space_members sm
    on sm.space_id=target_space_id and sm.user_id=r.recipient_id and sm.banned_at is null
  where r.recipient_id is not null
    and r.recipient_id <> new.author_id
    -- 'off'는 껐다는 뜻이고 'mentions'는 멘션만 받겠다는 뜻이다. 댓글은 'all'만 받는다.
    and sm.notification_setting='all'
  order by r.recipient_id, r.priority
  on conflict do nothing;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_on_comment_mention()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.notifications(recipient_id,type,actor_id,actor_is_anonymous,space_id,post_id,comment_id)
  select new.user_id,'comment_mention',c.author_id,c.is_anonymous,p.space_id,c.post_id,c.id
  from public.comments c
  join public.posts p on p.id=c.post_id and p.deleted_at is null
  join public.space_members sm
    on sm.space_id=p.space_id and sm.user_id=new.user_id and sm.banned_at is null
  where c.id=new.comment_id
    and c.deleted_at is null
    and c.author_id<>new.user_id
    and sm.notification_setting in ('mentions','all')
  on conflict (recipient_id, comment_id)
    where comment_id is not null and type in ('post_comment','comment_reply','comment_mention')
  do update set type='comment_mention';
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_on_comment_removed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_space_id bigint;
begin
  if new.deleted_by is null or new.deleted_by=new.author_id then return null; end if;
  select p.space_id into target_space_id from public.posts p where p.id=new.post_id;
  if target_space_id is null then return null; end if;
  insert into public.notifications(recipient_id,type,space_id,post_id,comment_id)
  values (new.author_id,'comment_removed',target_space_id,new.post_id,new.id);
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_on_join_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.notifications(recipient_id,type,actor_id,space_id)
  select sm.user_id,'space_join_request',new.user_id,new.space_id
  from public.space_members sm
  where sm.space_id=new.space_id
    and sm.role in ('owner','admin')
    and sm.banned_at is null
    and sm.user_id<>new.user_id;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_on_join_request_resolved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- 본인이 취소한 요청은 알릴 게 없다. security definer여도 auth.uid()는 호출자 그대로다.
  if old.user_id=private.current_profile_id() then return null; end if;
  -- 공간이 통째로 사라졌으면(하드 삭제) 보낼 곳이 없다.
  if not exists(select 1 from public.spaces where id=old.space_id) then return null; end if;

  insert into public.notifications(recipient_id,type,space_id)
  values (
    old.user_id,
    case when exists(
      select 1 from public.space_members sm
      where sm.space_id=old.space_id and sm.user_id=old.user_id and sm.banned_at is null
    ) then 'space_join_approved'::public.notification_type
    else 'space_join_rejected'::public.notification_type end,
    old.space_id
  );
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_on_post_mention()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.notifications(recipient_id,type,actor_id,actor_is_anonymous,space_id,post_id)
  select new.user_id,'post_mention',p.author_id,p.is_anonymous,p.space_id,p.id
  from public.posts p
  join public.space_members sm
    on sm.space_id=p.space_id and sm.user_id=new.user_id and sm.banned_at is null
  where p.id=new.post_id
    and p.deleted_at is null
    and p.author_id<>new.user_id
    and sm.notification_setting in ('mentions','all')
  -- uq_notifications_post_mention: 사람당 글당 한 번.
  on conflict do nothing;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_on_post_removed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.deleted_by is null or new.deleted_by=new.author_id then return null; end if;
  insert into public.notifications(recipient_id,type,space_id,post_id)
  values (new.author_id,'post_removed',new.space_id,new.id);
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_on_role_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.notifications(recipient_id,type,space_id,payload)
  values (new.user_id,'space_role_changed',new.space_id,
          jsonb_build_object('from',old.role,'to',new.role));
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_on_space_invite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.target_user_id is null or new.created_by is null then return null; end if;
  if new.created_by=new.target_user_id then return null; end if;
  insert into public.notifications(recipient_id,type,actor_id,space_id)
  values (new.target_user_id,'space_invited',new.created_by,new.space_id);
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  result bigint;
begin
  select count(*)::bigint into result
  from (
    select 1 from public.notifications n
    where n.recipient_id=caller_id and n.read_at is null
    limit 100
  ) capped;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_notifications(p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(id bigint, type public.notification_type, actor jsonb, actor_is_anonymous boolean, space jsonb, post jsonb, comment jsonb, conversation jsonb, payload jsonb, read_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
begin
  if p_limit not between 1 and 50 then raise exception 'limit must be between 1 and 50'; end if;

  return query
  select
    n.id,
    n.type,
    case when n.actor_is_anonymous or a.id is null then null
         else jsonb_build_object('id',a.id,'name',a.name,'avatar_url',a.avatar_url) end,
    n.actor_is_anonymous,
    case when s.id is null then null
         else jsonb_build_object('pub_id',s.pub_id,'name',s.name,'type',s.type) end,
    case when p.id is null then null
         else jsonb_build_object('pub_id',p.pub_id,'title',p.title) end,
    -- 삭제된 댓글은 soft_delete_comment가 content를 이미 비웠다. 알림이 원문을 되살리지 않는다.
    case when c.id is null then null
         else jsonb_build_object('id',c.id,'content',c.content,'is_deleted',c.deleted_at is not null) end,
    case when cv.id is null then null
         else jsonb_build_object('id',cv.id,'name',cv.name) end,
    n.payload,
    n.read_at,
    n.created_at
  from public.notifications n
  left join public.profiles a on a.id=n.actor_id
  left join public.spaces s on s.id=n.space_id
  left join public.posts p on p.id=n.post_id
  left join public.comments c on c.id=n.comment_id
  left join public.messages m on m.id=n.message_id
  left join public.conversations cv on cv.id=m.conversation_id
  where n.recipient_id=caller_id
    and (p_before_id is null or n.id < p_before_id)
  order by n.id desc
  limit p_limit;
end;
$function$
;

grant delete on table "public"."comment_mentions" to "authenticated";

grant select on table "public"."comment_mentions" to "authenticated";

grant delete on table "public"."comment_mentions" to "service_role";

grant insert on table "public"."comment_mentions" to "service_role";

grant select on table "public"."comment_mentions" to "service_role";

grant update on table "public"."comment_mentions" to "service_role";

grant delete on table "public"."post_mentions" to "authenticated";

grant select on table "public"."post_mentions" to "authenticated";

grant delete on table "public"."post_mentions" to "service_role";

grant insert on table "public"."post_mentions" to "service_role";

grant select on table "public"."post_mentions" to "service_role";

grant update on table "public"."post_mentions" to "service_role";


  create policy "comment_mentions_delete"
  on "public"."comment_mentions"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.comments c
  WHERE ((c.id = comment_mentions.comment_id) AND (c.author_id = private.current_profile_id()) AND (c.deleted_at IS NULL)))));



  create policy "comment_mentions_insert"
  on "public"."comment_mentions"
  as permissive
  for insert
  to authenticated
with check (((EXISTS ( SELECT 1
   FROM public.comments c
  WHERE ((c.id = comment_mentions.comment_id) AND (c.author_id = private.current_profile_id()) AND (c.deleted_at IS NULL)))) AND (EXISTS ( SELECT 1
   FROM ((public.comments c
     JOIN public.posts p ON ((p.id = c.post_id)))
     JOIN public.space_members sm ON ((sm.space_id = p.space_id)))
  WHERE ((c.id = comment_mentions.comment_id) AND (sm.user_id = comment_mentions.user_id) AND (sm.banned_at IS NULL))))));



  create policy "comment_mentions_select"
  on "public"."comment_mentions"
  as permissive
  for select
  to authenticated
using (private.can_access_comment(comment_id));



  create policy "post_mentions_delete"
  on "public"."post_mentions"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_mentions.post_id) AND (p.author_id = private.current_profile_id()) AND (p.deleted_at IS NULL)))));



  create policy "post_mentions_insert"
  on "public"."post_mentions"
  as permissive
  for insert
  to authenticated
with check (((EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_mentions.post_id) AND (p.author_id = private.current_profile_id()) AND (p.deleted_at IS NULL)))) AND (EXISTS ( SELECT 1
   FROM (public.posts p
     JOIN public.space_members sm ON ((sm.space_id = p.space_id)))
  WHERE ((p.id = post_mentions.post_id) AND (sm.user_id = post_mentions.user_id) AND (sm.banned_at IS NULL))))));



  create policy "post_mentions_select"
  on "public"."post_mentions"
  as permissive
  for select
  to authenticated
using (private.can_access_post(post_id));


CREATE TRIGGER trg_enforce_comment_mention_limit BEFORE INSERT ON public.comment_mentions FOR EACH ROW EXECUTE FUNCTION private.enforce_mention_limit('comment_id');

CREATE TRIGGER trg_notify_on_comment_mention AFTER INSERT ON public.comment_mentions FOR EACH ROW EXECUTE FUNCTION private.notify_on_comment_mention();

CREATE TRIGGER trg_notify_on_comment AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION private.notify_on_comment();

CREATE TRIGGER trg_notify_on_comment_removed AFTER UPDATE OF deleted_at ON public.comments FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION private.notify_on_comment_removed();

CREATE TRIGGER trg_enforce_post_mention_limit BEFORE INSERT ON public.post_mentions FOR EACH ROW EXECUTE FUNCTION private.enforce_mention_limit('post_id');

CREATE TRIGGER trg_notify_on_post_mention AFTER INSERT ON public.post_mentions FOR EACH ROW EXECUTE FUNCTION private.notify_on_post_mention();

CREATE TRIGGER trg_notify_on_post_removed AFTER UPDATE OF deleted_at ON public.posts FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION private.notify_on_post_removed();

CREATE TRIGGER trg_notify_on_anonymity_suspended AFTER INSERT OR UPDATE OF suspended_until ON public.space_anonymity_suspensions FOR EACH ROW WHEN ((new.suspended_until > now())) EXECUTE FUNCTION private.notify_on_anonymity_suspended();

CREATE TRIGGER trg_notify_on_space_invite AFTER INSERT ON public.space_invites FOR EACH ROW EXECUTE FUNCTION private.notify_on_space_invite();

CREATE TRIGGER trg_notify_on_join_request AFTER INSERT ON public.space_join_requests FOR EACH ROW EXECUTE FUNCTION private.notify_on_join_request();

CREATE CONSTRAINT TRIGGER trg_notify_on_join_request_resolved AFTER DELETE ON public.space_join_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.notify_on_join_request_resolved();

CREATE TRIGGER trg_notify_on_role_changed AFTER UPDATE OF role ON public.space_members FOR EACH ROW WHEN ((old.role IS DISTINCT FROM new.role)) EXECUTE FUNCTION private.notify_on_role_changed();



-- 여기부터는 손으로 붙인다. db diff가 못 보는 것들이다.
--
-- 1) 컬럼 단위 grant. diff는 위에서 `revoke select on table notifications from authenticated`만
--    뱉고 재-grant는 뱉지 않는다. 이게 없으면 알림함이 통째로 안 읽히는 건 물론이고, '읽음 표시'
--    UPDATE도 실패한다 -- Postgres는 UPDATE ... WHERE에 쓰인 컬럼에도 SELECT 권한을 요구한다.
--    actor_id는 일부러 뺀다: 익명 댓글의 알림에 actor_id가 실려 있으면 글쓴이가 그걸 읽어서
--    익명을 깬다(posts/comments의 author_id를 회수한 것이 알림함으로 우회된다).
grant select (id, type, read_at, created_at) on public.notifications to authenticated;

-- 멘션 insert도 컬럼 단위로 좁힌다. diff는 테이블 전체 insert를 뱉는데, 그러면 클라이언트가
-- created_at까지 정할 수 있어 멘션 시각을 소급해 꾸밀 수 있고, 나중에 추가되는 컬럼도 딸려 간다.
-- (schema_runtime_check가 이 규칙을 강제한다.)
grant insert (post_id,user_id) on public.post_mentions to authenticated;
grant insert (comment_id,user_id) on public.comment_mentions to authenticated;

-- 2) 함수 grant. diff는 함수 권한을 아예 뱉지 않아서, 이걸 안 붙이면 새 함수의 EXECUTE가
--    Postgres 기본값대로 PUBLIC에 열린 채로 배포된다.
revoke execute on function public.list_notifications(bigint,int4), public.get_unread_notification_count() from public, anon, authenticated, service_role;
grant execute on function public.list_notifications(bigint,int4), public.get_unread_notification_count() to authenticated;

revoke execute on function
  private.max_mentions(), private.enforce_mention_limit(),
  private.notify_on_comment(), private.notify_on_post_mention(), private.notify_on_comment_mention(),
  private.notify_on_post_removed(), private.notify_on_comment_removed(),
  private.notify_on_join_request(), private.notify_on_join_request_resolved(),
  private.notify_on_space_invite(), private.notify_on_role_changed(),
  private.notify_on_anonymity_suspended()
from public, anon, authenticated, service_role;
