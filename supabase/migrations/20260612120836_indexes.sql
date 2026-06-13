create index idx_profiles_status_deleted_at on public.profiles (status, deleted_at);
create index idx_profiles_status_updated_by on public.profiles (status_updated_by);
create index idx_user_permissions_permission_key on public.user_permissions (permission_key);
create index idx_user_permissions_granted_by on public.user_permissions (granted_by);

create index idx_spaces_active_directory on public.spaces (join_policy, member_count)
where deleted_at is null;
create index idx_spaces_created_by on public.spaces (created_by);
create index idx_spaces_deleted_by on public.spaces (deleted_by);
create index idx_space_members_user_joined_at on public.space_members (user_id, joined_at);
create index idx_space_members_space_role on public.space_members (space_id, role);
create index idx_space_members_active_user_space on public.space_members (user_id, space_id)
where banned_at is null;
create index idx_space_members_active_space_user_role on public.space_members (space_id, user_id, role)
where banned_at is null;
create index idx_space_members_banned_by on public.space_members (banned_by);

create index idx_posts_title_normalized_trgm on public.posts
using gin ((regexp_replace(lower(title), '\s+', '', 'g')) extensions.gin_trgm_ops)
where deleted_at is null;
create index idx_posts_content_normalized_trgm on public.posts
using gin ((regexp_replace(lower(content), '\s+', '', 'g')) extensions.gin_trgm_ops)
where deleted_at is null;
create index idx_comments_content_normalized_trgm on public.comments
using gin ((regexp_replace(lower(content), '\s+', '', 'g')) extensions.gin_trgm_ops)
where deleted_at is null;
create index idx_messages_content_normalized_trgm on public.messages
using gin ((regexp_replace(lower(content), '\s+', '', 'g')) extensions.gin_trgm_ops)
where deleted_at is null;

create index idx_posts_space_created_at on public.posts (space_id, space_type, created_at);
create index idx_posts_space_pinned_created_at on public.posts (space_id, is_pinned, pinned_at, created_at);
create index idx_posts_space_type_created_at on public.posts (space_type, created_at);
create index idx_posts_author_created_at on public.posts (author_id, created_at);
create index idx_posts_deleted_created_at on public.posts (deleted_at, created_at);
create index idx_posts_active_space_created_at on public.posts (space_id, created_at desc, id desc)
where deleted_at is null;
create index idx_posts_pinned on public.posts (space_id, pinned_at desc)
where is_pinned = true and deleted_at is null;
create index idx_posts_pinned_by on public.posts (pinned_by);
create index idx_posts_deleted_by on public.posts (deleted_by);

create index idx_comments_tree on public.comments (post_id, parent_id, created_at);
create index idx_comments_author_created_at on public.comments (author_id, created_at);
create index idx_comments_deleted_created_at on public.comments (deleted_at, created_at);
create index idx_comments_active_post_created_at on public.comments (post_id, created_at)
where deleted_at is null;
create index idx_comments_active_parent on public.comments (parent_id)
where deleted_at is null;
create index idx_comments_parent_id on public.comments (parent_id);
create index idx_comments_deleted_by on public.comments (deleted_by);

create index idx_post_reactions_type_count on public.post_reactions (post_id, reaction_type_id);
create index idx_post_reactions_user_created_at on public.post_reactions (user_id, created_at);
create index idx_post_reactions_reaction_type_id on public.post_reactions (reaction_type_id);
create index idx_comment_reactions_type_count on public.comment_reactions (comment_id, reaction_type_id);
create index idx_comment_reactions_user_created_at on public.comment_reactions (user_id, created_at);
create index idx_comment_reactions_reaction_type_id on public.comment_reactions (reaction_type_id);

create index idx_direct_chat_pairs_user1_created_at on public.direct_chat_pairs (user1_id, created_at);
create index idx_direct_chat_pairs_user2_created_at on public.direct_chat_pairs (user2_id, created_at);
create index idx_chat_room_members_user_joined_at on public.chat_room_members (user_id, joined_at);
create index idx_chat_room_members_user_room on public.chat_room_members (user_id, room_id);
create index idx_chat_rooms_created_by on public.chat_rooms (created_by);
create index idx_messages_room_created_at on public.messages (room_id, created_at);
create index idx_messages_sender_created_at on public.messages (sender_id, created_at);
create index idx_messages_parent_created_at on public.messages (parent_id, created_at);
create index idx_messages_active_room_created_at on public.messages (room_id, created_at)
where deleted_at is null;
create index idx_messages_deleted_by on public.messages (deleted_by);
create index idx_message_reactions_type_count on public.message_reactions (message_id, reaction_type_id);
create index idx_message_reactions_user_created_at on public.message_reactions (user_id, created_at);
create index idx_message_reactions_reaction_type_id on public.message_reactions (reaction_type_id);
create index idx_message_reads_user_read_at on public.message_reads (user_id, read_at);
create index idx_chat_room_read_states_user_last_read_at on public.chat_room_read_states (user_id, last_read_at);
create index idx_chat_room_read_states_last_read_message_id on public.chat_room_read_states (last_read_message_id);

create index idx_notifications_recipient_created_at on public.notifications (recipient_id, created_at);
create index idx_notifications_recipient_read_created_at on public.notifications (recipient_id, read_at, created_at);
create index idx_notifications_unread_recipient_created_at on public.notifications (recipient_id, created_at desc)
where read_at is null;
create index idx_notifications_space_created_at on public.notifications (space_id, space_type, created_at);
create index idx_notifications_actor_id on public.notifications (actor_id);
create index idx_notifications_post_id on public.notifications (post_id);
create index idx_notifications_comment_id on public.notifications (comment_id);
create index idx_notifications_message_id on public.notifications (message_id);

create index idx_gongangs_owner on public.gongangs (owner_id);
create index idx_gongangs_location_time on public.gongangs (location, day_of_week, start_minute);
create index idx_song_requests_requester_requested_at on public.song_requests (requester_id, requested_at);
create index idx_song_requests_requested_at on public.song_requests (requested_at);
create index idx_club_apply_rounds_period on public.club_apply_rounds (starts_at, ends_at);
create index idx_club_apply_rounds_created_by on public.club_apply_rounds (created_by);
create index idx_clubs_apply_round_club_created_at on public.clubs_apply (round_id, club_id, created_at);
create index idx_clubs_apply_round_user_created_at on public.clubs_apply (round_id, user_id, created_at);
create index idx_clubs_apply_user_id on public.clubs_apply (user_id);
create index idx_clubs_apply_club_id on public.clubs_apply (club_id);
