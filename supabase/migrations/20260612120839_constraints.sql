alter table public.profiles
  add constraint profiles_auth_user_id_key unique (auth_user_id),
  add constraint profiles_pub_id_key unique (pub_id),
  add constraint profiles_student_number_key unique (student_number),
  add constraint profiles_cohort_check check (cohort is null or cohort between 1 and 100),
  add constraint profiles_class_no_check check (class_no is null or class_no > 0),
  add constraint profiles_student_number_check check (student_number is null or student_number ~ '^\d{6}$'),
  add constraint profiles_phone_number_check check (phone_number is null or phone_number ~ '^\+?[0-9]{8,15}$'),
  add constraint profiles_dorm_room_check check (dorm_room is null or dorm_room > 0),
  add constraint profiles_student_identity_check check (
    deleted_at is not null
    or status = 'none'
    or type <> 'student'
    or (student_number is not null and cohort is not null)
  ),
  add constraint profiles_name_check check (char_length(btrim(name)) between 1 and 50),
  add constraint profiles_anonymous_username_check check (
    anonymous_username is null
    or char_length(btrim(anonymous_username)) between 1 and 50
  ),
  add constraint profiles_description_check check (
    description is null or char_length(description) <= 2000
  );

create unique index profiles_anonymous_username_normalized_key
on public.profiles (lower(btrim(anonymous_username)))
where anonymous_username is not null;

alter table public.spaces
  add constraint spaces_pub_id_key unique (pub_id),
  add constraint spaces_member_count_check check (member_count >= 0),
  add constraint spaces_name_check check (char_length(btrim(name)) between 1 and 100),
  add constraint spaces_description_check check (
    description is null or char_length(description) <= 5000
  ),
  add constraint spaces_deleted_state_check check (deleted_at is not null or deleted_by is null);

create unique index spaces_active_group_name_key
on public.spaces (lower(btrim(name)))
where type = 'group' and deleted_at is null;

alter table public.space_members
  add constraint space_members_ban_state_check check (
    (banned_at is null and banned_by is null)
    or banned_at is not null
  ),
  add constraint space_members_ban_reason_check check (
    ban_reason is null or char_length(ban_reason) <= 1000
  );

create unique index space_members_one_owner_key
on public.space_members (space_id)
where role = 'owner';

alter table public.posts
  add constraint posts_pub_id_key unique (pub_id),
  add constraint posts_comment_count_check check (comment_count >= 0),
  add constraint posts_reaction_count_check check (reaction_count >= 0),
  add constraint posts_title_check check (char_length(btrim(title)) between 1 and 200),
  add constraint posts_content_check check (char_length(btrim(content)) between 1 and 50000),
  add constraint posts_deleted_state_check check (deleted_at is not null or deleted_by is null),
  add constraint posts_pin_state_check check (
    (is_pinned = false and pinned_at is null and pinned_by is null)
    or (is_pinned = true and pinned_at is not null)
  );

alter table public.post_attachments
  add constraint post_attachments_post_sort_key unique (post_id, sort_order),
  add constraint post_attachments_storage_key unique (storage_bucket, storage_path),
  add constraint post_attachments_bucket_check check (storage_bucket = 'post-files'),
  add constraint post_attachments_storage_path_check check (
    char_length(storage_path) between 1 and 1024
    and storage_path !~ '(^|/)\.\.?(/|$)'
  ),
  add constraint post_attachments_file_name_check check (char_length(btrim(file_name)) between 1 and 255),
  add constraint post_attachments_content_type_check check (char_length(btrim(content_type)) between 1 and 255),
  add constraint post_attachments_size_check check (size_bytes is null or size_bytes >= 0),
  add constraint post_attachments_sort_order_check check (sort_order >= 0),
  add constraint post_attachments_alt_check check (alt is null or char_length(alt) <= 1000),
  add constraint post_attachments_width_check check (width is null or width > 0),
  add constraint post_attachments_height_check check (height is null or height > 0);

alter table public.comments
  add constraint comments_parent_check check (parent_id is null or parent_id <> id),
  add constraint comments_content_check check (char_length(btrim(content)) between 1 and 10000),
  add constraint comments_placeholder_check check (
    deleted_at is not null or content <> '삭제된 댓글입니다.'
  ),
  add constraint comments_deleted_state_check check (deleted_at is not null or deleted_by is null);

alter table public.reaction_types
  add constraint reaction_types_key_key unique (key),
  add constraint reaction_types_key_check check (char_length(btrim(key)) between 1 and 100),
  add constraint reaction_types_name_check check (char_length(btrim(name)) between 1 and 100);

alter table public.post_reactions
  add constraint post_reactions_post_user_key unique (post_id, user_id);
alter table public.comment_reactions
  add constraint comment_reactions_comment_user_key unique (comment_id, user_id);

alter table public.chat_rooms
  add constraint chat_rooms_name_check check (
    (is_group = false and name is null)
    or (is_group = true and char_length(btrim(name)) between 1 and 100)
  );

alter table public.direct_chat_pairs
  add constraint direct_chat_pairs_users_check check (user1_id < user2_id),
  add constraint direct_chat_pairs_users_key unique (user1_id, user2_id);

alter table public.messages
  add constraint messages_parent_check check (parent_id is null or parent_id <> id),
  add constraint messages_content_check check (char_length(btrim(content)) between 1 and 10000),
  add constraint messages_deleted_state_check check (deleted_at is not null or deleted_by is null),
  add constraint messages_edit_state_check check (
    (is_edited = false and edited_at is null)
    or (is_edited = true and edited_at is not null)
  );

alter table public.message_attachments
  add constraint message_attachments_message_sort_key unique (message_id, sort_order),
  add constraint message_attachments_storage_key unique (storage_bucket, storage_path),
  add constraint message_attachments_bucket_check check (storage_bucket = 'message-files'),
  add constraint message_attachments_storage_path_check check (
    char_length(storage_path) between 1 and 1024
    and storage_path !~ '(^|/)\.\.?(/|$)'
  ),
  add constraint message_attachments_file_name_check check (char_length(btrim(file_name)) between 1 and 255),
  add constraint message_attachments_content_type_check check (char_length(btrim(content_type)) between 1 and 255),
  add constraint message_attachments_size_check check (size_bytes is null or size_bytes >= 0),
  add constraint message_attachments_sort_order_check check (sort_order >= 0),
  add constraint message_attachments_width_check check (width is null or width > 0),
  add constraint message_attachments_height_check check (height is null or height > 0);

alter table public.message_reactions
  add constraint message_reactions_message_user_key unique (message_id, user_id);

alter table public.notifications
  add constraint notifications_title_check check (title is null or char_length(title) <= 200),
  add constraint notifications_body_check check (body is null or char_length(body) <= 2000),
  add constraint notifications_content_check check (
    nullif(btrim(title), '') is not null or nullif(btrim(body), '') is not null
  ),
  add constraint notifications_message_target_check check (
    message_id is null or (space_id is null and post_id is null and comment_id is null)
  );

alter table public.gongangs
  add constraint gongangs_day_of_week_check check (day_of_week between 0 and 6),
  add constraint gongangs_start_minute_check check (start_minute between 0 and 1439),
  add constraint gongangs_end_minute_check check (end_minute between 1 and 1440),
  add constraint gongangs_time_order_check check (start_minute < end_minute),
  add constraint gongangs_validity_check check (valid_from <= valid_until),
  add constraint gongangs_no_overlap exclude using gist (
    location with =,
    day_of_week with =,
    time_range with &&,
    validity_range with &&
  );

alter table public.song_requests
  add constraint song_requests_url_check check (
    char_length(url) between 1 and 2048
    and url ~ '^https://'
  );

alter table public.clubs
  add constraint clubs_name_key unique (name),
  add constraint clubs_name_check check (char_length(btrim(name)) between 1 and 100),
  add constraint clubs_description_check check (
    description is null or char_length(description) <= 5000
  );

alter table public.club_apply_rounds
  add constraint club_apply_rounds_name_check check (char_length(btrim(name)) between 1 and 100),
  add constraint club_apply_rounds_period_check check (starts_at < ends_at),
  add constraint club_apply_rounds_no_overlap exclude using gist (apply_range with &&);

alter table public.clubs_apply
  add constraint clubs_apply_round_user_club_key unique (round_id, user_id, club_id);
