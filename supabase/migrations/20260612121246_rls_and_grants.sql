create function private.is_app_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where auth_user_id=(select auth.uid()) and status='accepted' and deleted_at is null and role='admin')
$$;
create function private.is_space_member(p_space_id bigint,p_allowed_roles public.member_role[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.space_members sm join public.spaces s on s.id=sm.space_id join public.profiles p on p.id=sm.user_id
    where sm.space_id=p_space_id and p.auth_user_id=(select auth.uid()) and p.status='accepted' and p.deleted_at is null and s.deleted_at is null and sm.banned_at is null
      and (p_allowed_roles is null or sm.role=any(p_allowed_roles)))
$$;
create function private.is_room_member(p_room_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_accepted_user() and exists(select 1 from public.chat_room_members where room_id=p_room_id and user_id=private.current_profile_id())
$$;
create function private.can_manage_space(p_space_id bigint,p_allowed_roles public.member_role[] default array['owner','admin']::public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$ select private.is_space_member(p_space_id,p_allowed_roles) $$;
create function private.can_access_post(p_post_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.posts p where p.id=p_post_id and p.deleted_at is null and private.is_space_member(p.space_id))
$$;
create function private.can_access_comment(p_comment_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.comments c where c.id=p_comment_id and c.deleted_at is null and private.can_access_post(c.post_id))
$$;
create function private.can_access_message(p_message_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.messages m where m.id=p_message_id and m.deleted_at is null and private.is_room_member(m.room_id))
$$;
create function private.has_active_direct_reply(p_comment_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.comments where parent_id=p_comment_id and deleted_at is null)
$$;
create function private.has_permission(p_permission_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_accepted_user() and exists(select 1 from public.user_permissions where user_id=private.current_profile_id() and permission_key=p_permission_key)
$$;
create function private.is_club_round_open(p_round_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.club_apply_rounds where id=p_round_id and now()>=starts_at and now()<ends_at)
$$;

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.posts enable row level security;
alter table public.post_attachments enable row level security;
alter table public.comments enable row level security;
alter table public.reaction_types enable row level security;
alter table public.post_reactions enable row level security;
alter table public.comment_reactions enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.direct_chat_pairs enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_reads enable row level security;
alter table public.chat_room_read_states enable row level security;
alter table public.notifications enable row level security;
alter table public.gongangs enable row level security;
alter table public.song_requests enable row level security;
alter table public.clubs enable row level security;
alter table public.club_apply_rounds enable row level security;
alter table public.clubs_apply enable row level security;

create policy spaces_select on public.spaces for select to authenticated using (private.is_accepted_user() and deleted_at is null);
create policy space_members_select on public.space_members for select to authenticated using (private.is_space_member(space_id));
create policy space_members_update on public.space_members for update to authenticated using (user_id=private.current_profile_id() and private.is_space_member(space_id)) with check (user_id=private.current_profile_id() and private.is_space_member(space_id));

create policy posts_select on public.posts for select to authenticated using (deleted_at is null and private.is_space_member(space_id));
create policy posts_insert on public.posts for insert to authenticated with check (author_id=private.current_profile_id() and private.is_space_member(space_id));
create policy posts_update on public.posts for update to authenticated using (deleted_at is null and author_id=private.current_profile_id() and private.is_space_member(space_id)) with check (deleted_at is null and author_id=private.current_profile_id() and private.is_space_member(space_id));
create policy post_attachments_select on public.post_attachments for select to authenticated using (private.can_access_post(post_id));

create policy comments_select on public.comments for select to authenticated using (private.can_access_post(post_id) and (deleted_at is null or private.has_active_direct_reply(id)));
create policy comments_insert on public.comments for insert to authenticated with check (author_id=private.current_profile_id() and private.can_access_post(post_id));
create policy comments_update on public.comments for update to authenticated using (deleted_at is null and author_id=private.current_profile_id() and private.can_access_post(post_id)) with check (deleted_at is null and author_id=private.current_profile_id() and private.can_access_post(post_id));
create policy reaction_types_select on public.reaction_types for select to authenticated using (private.is_accepted_user());
create policy post_reactions_select on public.post_reactions for select to authenticated using (private.can_access_post(post_id));
create policy post_reactions_insert on public.post_reactions for insert to authenticated with check (user_id=private.current_profile_id() and private.can_access_post(post_id));
create policy post_reactions_update on public.post_reactions for update to authenticated using (user_id=private.current_profile_id() and private.can_access_post(post_id)) with check (user_id=private.current_profile_id() and private.can_access_post(post_id));
create policy post_reactions_delete on public.post_reactions for delete to authenticated using (user_id=private.current_profile_id() and private.can_access_post(post_id));
create policy comment_reactions_select on public.comment_reactions for select to authenticated using (private.can_access_comment(comment_id));
create policy comment_reactions_insert on public.comment_reactions for insert to authenticated with check (user_id=private.current_profile_id() and private.can_access_comment(comment_id));
create policy comment_reactions_update on public.comment_reactions for update to authenticated using (user_id=private.current_profile_id() and private.can_access_comment(comment_id)) with check (user_id=private.current_profile_id() and private.can_access_comment(comment_id));
create policy comment_reactions_delete on public.comment_reactions for delete to authenticated using (user_id=private.current_profile_id() and private.can_access_comment(comment_id));

create policy chat_rooms_select on public.chat_rooms for select to authenticated using (private.is_room_member(id));
create policy direct_chat_pairs_select on public.direct_chat_pairs for select to authenticated using (private.is_room_member(room_id));
create policy chat_room_members_select on public.chat_room_members for select to authenticated using (private.is_room_member(room_id));
create policy messages_select on public.messages for select to authenticated using (deleted_at is null and private.is_room_member(room_id));
create policy messages_insert on public.messages for insert to authenticated with check (sender_id=private.current_profile_id() and private.is_room_member(room_id));
create policy messages_update on public.messages for update to authenticated using (deleted_at is null and sender_id=private.current_profile_id() and private.is_room_member(room_id) and created_at>=now()-interval '15 minutes') with check (deleted_at is null and sender_id=private.current_profile_id() and private.is_room_member(room_id));
create policy message_attachments_select on public.message_attachments for select to authenticated using (private.can_access_message(message_id));
create policy message_reactions_select on public.message_reactions for select to authenticated using (private.can_access_message(message_id));
create policy message_reactions_insert on public.message_reactions for insert to authenticated with check (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy message_reactions_update on public.message_reactions for update to authenticated using (user_id=private.current_profile_id() and private.can_access_message(message_id)) with check (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy message_reactions_delete on public.message_reactions for delete to authenticated using (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy message_reads_select on public.message_reads for select to authenticated using (private.is_room_member((select room_id from public.messages where id=message_id)));
create policy message_reads_insert on public.message_reads for insert to authenticated with check (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy chat_room_read_states_select on public.chat_room_read_states for select to authenticated using (user_id=private.current_profile_id() and private.is_room_member(room_id));
create policy chat_room_read_states_insert on public.chat_room_read_states for insert to authenticated with check (user_id=private.current_profile_id() and private.is_room_member(room_id));
create policy chat_room_read_states_update on public.chat_room_read_states for update to authenticated using (user_id=private.current_profile_id() and private.is_room_member(room_id)) with check (user_id=private.current_profile_id() and private.is_room_member(room_id));

create policy notifications_select on public.notifications for select to authenticated using (recipient_id=private.current_profile_id());
create policy notifications_update on public.notifications for update to authenticated using (recipient_id=private.current_profile_id()) with check (recipient_id=private.current_profile_id());
create policy gongangs_select on public.gongangs for select to authenticated using (private.has_permission('gongang'));
create policy gongangs_insert on public.gongangs for insert to authenticated with check (owner_id=private.current_profile_id() and private.has_permission('gongang'));
create policy gongangs_update on public.gongangs for update to authenticated using (owner_id=private.current_profile_id() and private.has_permission('gongang')) with check (owner_id=private.current_profile_id() and private.has_permission('gongang'));
create policy gongangs_delete on public.gongangs for delete to authenticated using (owner_id=private.current_profile_id() and private.has_permission('gongang'));
create policy song_requests_select on public.song_requests for select to authenticated using (private.has_permission('karaoke'));
create policy song_requests_insert on public.song_requests for insert to authenticated with check (requester_id=private.current_profile_id() and private.has_permission('karaoke'));
create policy clubs_select on public.clubs for select to authenticated using (private.is_accepted_user());
create policy club_apply_rounds_select on public.club_apply_rounds for select to authenticated using (private.is_accepted_user());
create policy clubs_apply_select on public.clubs_apply for select to authenticated using (private.is_accepted_user());
create policy clubs_apply_insert on public.clubs_apply for insert to authenticated with check (user_id=private.current_profile_id() and private.is_club_round_open(round_id));
create policy clubs_apply_delete on public.clubs_apply for delete to authenticated using (user_id=private.current_profile_id() and private.is_club_round_open(round_id));

grant usage on schema public,private to authenticated,service_role;
grant execute on function private.current_profile_id(),private.is_accepted_user(),private.is_app_admin(),private.is_room_member(bigint),private.can_access_post(bigint),private.can_access_comment(bigint),private.can_access_message(bigint),private.has_active_direct_reply(bigint),private.has_permission(text),private.is_club_round_open(bigint),private.display_author_name(bigint,boolean) to authenticated;
grant execute on function private.is_space_member(bigint,public.member_role[]),private.can_manage_space(bigint,public.member_role[]) to authenticated;

grant select (pub_id,type,name,description,image_url,join_policy,member_count) on public.spaces to authenticated;
grant select on public.space_members,public.posts,public.post_attachments,public.comments,public.reaction_types,public.post_reactions,public.comment_reactions,public.chat_rooms,public.direct_chat_pairs,public.chat_room_members,public.messages,public.message_attachments,public.message_reactions,public.message_reads,public.chat_room_read_states,public.notifications,public.gongangs,public.song_requests,public.clubs,public.club_apply_rounds,public.clubs_apply to authenticated;
grant insert (space_id,title,content,is_anonymous) on public.posts to authenticated;
grant update (title,content,is_anonymous) on public.posts to authenticated;
grant insert (post_id,parent_id,content,is_anonymous) on public.comments to authenticated;
grant update (content) on public.comments to authenticated;
grant insert (post_id,reaction_type_id) on public.post_reactions to authenticated;
grant insert (comment_id,reaction_type_id) on public.comment_reactions to authenticated;
grant update (reaction_type_id) on public.post_reactions,public.comment_reactions to authenticated;
grant delete on public.post_reactions,public.comment_reactions to authenticated;
grant insert (room_id,parent_id,content) on public.messages to authenticated;
grant update (content) on public.messages to authenticated;
grant insert (message_id,reaction_type_id) on public.message_reactions to authenticated;
grant update (reaction_type_id) on public.message_reactions to authenticated;
grant delete on public.message_reactions to authenticated;
grant insert (message_id) on public.message_reads to authenticated;
grant insert (room_id,last_read_message_id) on public.chat_room_read_states to authenticated;
grant update (last_read_message_id) on public.chat_room_read_states to authenticated;
grant update (notification_setting) on public.space_members to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert (location,day_of_week,start_minute,end_minute,valid_from,valid_until) on public.gongangs to authenticated;
grant update (location,day_of_week,start_minute,end_minute,valid_from,valid_until) on public.gongangs to authenticated;
grant delete on public.gongangs to authenticated;
grant insert (url) on public.song_requests to authenticated;
grant insert (round_id,club_id) on public.clubs_apply to authenticated;
grant delete on public.clubs_apply to authenticated;

grant usage,select on sequence public.posts_id_seq,public.comments_id_seq,public.post_reactions_id_seq,public.comment_reactions_id_seq,public.messages_id_seq,public.message_reactions_id_seq,public.gongangs_id_seq,public.song_requests_id_seq,public.clubs_apply_id_seq to authenticated;

grant select,insert,update,delete on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema private from public,anon,service_role;
