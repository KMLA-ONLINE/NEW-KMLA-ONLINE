Project school_community {
  database_type: 'PostgreSQL'

  Note: '''
  Supabase-oriented schema.

  Actual Supabase migration should add:
  - create extension if not exists "pg_uuidv7"
  - RLS policies for every public table
  - CHECK constraints noted below
  - partial unique indexes noted below
  - exclusion constraints for gongang overlap prevention
  - triggers/RPCs for cached counts and updated_at
  - Supabase Storage buckets and storage.objects RLS policies noted below
  '''
}

/* =========================================================
   Supabase Auth
   ========================================================= */

// Visual reference only.
// Do not create auth.users manually in migration SQL.
Table auth.users {
  id uuid [pk]
}

/* =========================================================
   Supabase Storage
   ========================================================= */

// Create these Supabase Storage buckets:
// - avatars: profile images
// - group-images: group representative images
// - post-files: post attachments
// - message-files: message attachments
//
// Storage policy principles:
// - Keep bucket policies separate because profile/group images, post files,
//   and message files have different access rules.
// - Do not rely on hidden object paths as authorization.
// - Use storage.objects RLS policies that mirror profile, group, post,
//   and chat membership access rules.
// - Storage upsert requires INSERT + SELECT + UPDATE permissions.
// - post-files/message-files are general-purpose buckets for images, PDFs,
//   and documents.

/* =========================================================
   Enums
   ========================================================= */

Enum app_role {
  user
  admin
}

Enum profile_gender {
  male
  female
}

Enum profile_type {
  student
  teacher
  alumni
}

Enum profile_status {
  none
  pending
  accepted
  rejected
}

Enum group_member_role {
  owner
  admin
  member
}

Enum group_setting {
  none
  mentions
  all
}

Enum group_visibility {
  public
  invite_only
}

Enum reaction_type {
  like
  love
  laugh
  wow
  sad
  angry
}

Enum club_type {
  major
  general
}

/* =========================================================
   Profiles / Permissions
   ========================================================= */

Table profiles {
  id uuid [pk, ref: > auth.users.id]
  name text [not null, note: 'Initial display name from OAuth profile']
  role app_role [not null, default: 'user', note: 'Admin-controlled only']
  type profile_type [not null, default: 'student', note: 'School identity type; separate from admin/user app role']
  student_number int4 [null, unique, note: 'Required only for student profiles']
  class_no int2 [null, note: 'Class number']
  grade int2 [null, note: 'School year; required only for student profiles']
  gender profile_gender [null]
  phone_number text [null, note: 'Strongly recommended, but not required']
  avatar_url text [null, note: 'Avatar URL or avatars Storage path']
  birthday date [null]
  description text [null]
  status profile_status [not null, default: 'none', note: 'none -> pending after onboarding/survey -> accepted/rejected by app admin']
  dorm_room int2 [null]
  onboarding_completed_at timestamptz [null, note: 'Set when required survey/onboarding is completed']
  status_updated_at timestamptz [null]
  status_updated_by uuid [null, ref: > profiles.id]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null]

  Note: '''
  Actual DB migration should add:
  - CHECK (grade IS NULL OR grade BETWEEN 1 AND 3)
  - CHECK (class_no IS NULL OR class_no > 0)
  - CHECK (student_number IS NULL OR student_number > 0)
  - CHECK (dorm_room IS NULL OR dorm_room > 0)
  - CHECK (type <> 'student' OR (student_number IS NOT NULL AND grade IS NOT NULL))
  - UNIQUE (student_number)

  RLS:
  - User may update safe profile fields only.
  - role/status/status_updated_* must be admin-only or RPC-only.

  Approval flow:
  - Google OAuth alone does not grant community access.
  - New users start at status = 'none' until required profile/onboarding fields are submitted.
  - After onboarding, status becomes 'pending' and the user waits for app admin review.
  - Only app admins can set status to 'accepted' or 'rejected'.
  - Accepted users may access the main community routes and protected app data.
  '''
}

Table permissions {
  key text [pk, note: 'Permission key, e.g. gongang, karaoke']
  name text [not null, note: 'Display name, e.g. 공강, 노래방']
  description text [null]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  Global feature permission registry.
  Use this for app-wide features such as gongang, karaoke, or other special tools.
  Do not use this for group-level roles; group authority belongs in group_members.role.
  '''
}

Table user_permissions {
  user_id uuid [not null, ref: > profiles.id]
  permission_key text [not null, ref: > permissions.key]
  granted_at timestamptz [not null, default: `now()`]
  granted_by uuid [null, ref: > profiles.id]

  Note: '''
  App admin-controlled only.
  Grants app-wide feature permissions, not group membership or group management rights.
  Normal clients should not directly insert/update/delete this table.
  '''

  indexes {
    (user_id, permission_key) [pk]
  }
}

/* =========================================================
   Groups
   ========================================================= */

Table groups {
  id uuid [pk, default: `uuid_generate_v7()`]
  name text [not null, note: 'Official group names should be unique by partial unique index']
  description text [null]
  image_url text [null, note: 'Group image URL or group-images Storage path']
  is_official boolean [not null, default: false, note: 'App admin-set official group marker; normally set once during initial setup']
  is_personal boolean [not null, default: false, note: 'Story-like personal group; hidden from normal group list']
  is_listed boolean [not null, default: true, note: 'Personal groups should be false']
  visibility group_visibility [not null, default: 'public', note: 'public = open join, invite_only = owner/admin invitation or direct member add only']
  created_by uuid [null, ref: > profiles.id, note: 'On user deletion, set null']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null]

  Note: '''
  Actual DB migration should add:
  - CHECK (NOT (is_official AND is_personal))
  - CHECK (NOT is_personal OR is_listed = false)
  - Public groups are joinable by accepted users according to RLS/RPC rules.
  - Invite-only groups do not accept join requests; owner/admin adds members directly.
  - Private-feeling groups are represented as visibility = 'invite_only' and is_listed = false.
  - Partial unique index: UNIQUE (name) WHERE is_official = true
  - Partial unique index: UNIQUE (created_by) WHERE is_personal = true
  - Exactly one owner per group:
    * At most one owner by partial unique index on group_members(group_id) WHERE role = 'owner'
    * At least one owner by trigger/RPC or controlled group creation flow
  - created_by should use ON DELETE SET NULL in migration.

  is_official policy:
  - Only app admins may set or change is_official.
  - Normal user-created groups must remain is_official = false.
  - Official status is expected to be set during initial setup and rarely changed.

  App admins only need limited global control for initial official group setup and intervention.
  Normal unofficial group management should be handled by group_members.role owner/admin.
  '''
}

Table group_members {
  group_id uuid [not null, ref: > groups.id]
  user_id uuid [not null, ref: > profiles.id]
  role group_member_role [not null, default: 'member']
  setting group_setting [not null, default: 'mentions']
  joined_at timestamptz [not null, default: `now()`]

  Note: '''
  Actual DB migration should add:
  - Partial unique index: UNIQUE (group_id) WHERE role = 'owner'
  - RLS: group members can see group data according to membership and group visibility.
  '''

  indexes {
    (group_id, user_id) [pk]
    (user_id, joined_at) [name: 'idx_group_members_user_joined_at']
    (group_id, role) [name: 'idx_group_members_group_role']
  }
}

/* =========================================================
   Posts / Images / Comments
   ========================================================= */

Table posts {
  id uuid [pk, default: `uuid_generate_v7()`]
  group_id uuid [not null, ref: > groups.id]
  author_id uuid [not null, ref: > profiles.id]
  title text [not null]
  content text [not null]
  search_vector tsvector [null, note: 'Generated from title/content for Postgres full-text search']
  is_pinned boolean [not null, default: false, note: 'Pinned notice within the group']
  pinned_at timestamptz [null]
  pinned_by uuid [null, ref: > profiles.id]
  comment_count int4 [not null, default: 0, note: 'Cached count; includes all comments and replies at every depth']
  reaction_count int4 [not null, default: 0, note: 'Cached count from post_reactions']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null]
  deleted_at timestamptz [null, note: 'Soft delete']
  deleted_by uuid [null, ref: > profiles.id]

  Note: '''
  Actual DB migration should add:
  - CHECK (is_pinned = true OR (pinned_at IS NULL AND pinned_by IS NULL))
  - CHECK (is_pinned = false OR pinned_at IS NOT NULL)
  - CHECK (comment_count >= 0)
  - CHECK (reaction_count >= 0)
  - Comment/reply count caches should be maintained by controlled RPCs or triggers on comment create/soft-delete.
  - Reaction count cache should be maintained by controlled RPCs or triggers on reaction create/update/delete.
  - Generated column: search_vector = to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, '')) STORED
  - RLS: author must be a member of group_id.
  - RLS: only group owner/admin can pin or unpin posts.
  - GIN index on search_vector for group post search.
  - Uses Postgres simple FTS. Korean search quality may need pg_trgm or language-specific search later.
  - Partial index: (group_id, pinned_at DESC) WHERE is_pinned = true AND deleted_at IS NULL
  - Partial index: (group_id, created_at DESC) WHERE deleted_at IS NULL

  Edit/deletion policy:
  - Post authors may edit their own title/content/attachments without a time limit.
  - Editing sets updated_at = now().
  - is_pinned/pinned_at/pinned_by are not normal author-editable fields; only group owner/admin may change them.
  - Post authors may soft-delete their own posts by setting deleted_at/deleted_by.
  - Default post queries should filter deleted_at IS NULL.
  '''

  indexes {
    (group_id, created_at) [name: 'idx_posts_group_created_at']
    (group_id, is_pinned, pinned_at, created_at) [name: 'idx_posts_group_pinned_created_at']
    (author_id, created_at) [name: 'idx_posts_author_created_at']
    (deleted_at, created_at) [name: 'idx_posts_deleted_created_at']
    (search_vector) [name: 'idx_posts_search_vector']
  }
}

Table post_attachments {
  id uuid [pk, default: `uuid_generate_v7()`]
  post_id uuid [not null, ref: > posts.id]
  storage_bucket text [not null, note: 'Supabase Storage bucket name; use post-files']
  storage_path text [not null, note: 'Supabase Storage object path inside bucket']
  file_name text [not null, note: 'Original or display file name']
  content_type text [not null, note: 'MIME type. UI may initially allow images only.']
  size_bytes int8 [null, note: 'File size in bytes when available']
  sort_order int4 [not null, default: 0, note: 'Stable attachment order within a post']
  alt text [null, note: 'Accessible alt text for image attachments']
  width int4 [null, note: 'Original image width for image attachments']
  height int4 [null, note: 'Original image height for image attachments']
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  General attachment table. The DB can store any file type.

  Recommended FK in migration:
  - post_id ON DELETE CASCADE if admin hard-deletes post.

  Actual DB migration should add:
  - CHECK (size_bytes IS NULL OR size_bytes >= 0)
  - CHECK (sort_order >= 0)
  - CHECK (width IS NULL OR width > 0)
  - CHECK (height IS NULL OR height > 0)
  '''

  indexes {
    (post_id, sort_order) [unique]
    (storage_bucket, storage_path) [unique]
  }
}

Table post_comments {
  id uuid [pk, default: `uuid_generate_v7()`]
  post_id uuid [not null, ref: > posts.id]
  author_id uuid [not null, ref: > profiles.id]
  parent_id uuid [null, ref: > post_comments.id, note: 'Null for top-level comments; points to direct parent for replies']
  depth int2 [not null, default: 0, note: '0 = top-level comment; max 4. Determines nesting level in UI.']
  content text [not null]
  reply_count int4 [not null, default: 0, note: 'Cached direct child count']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null]
  deleted_at timestamptz [null, note: 'Soft delete; if reply_count > 0, render as deleted placeholder']
  deleted_by uuid [null, ref: > profiles.id]

  Note: '''
  Supports up to depth 4 (5 levels total: 0-4).
  Querying a full subtree requires recursive CTE:
    WITH RECURSIVE tree AS (
      SELECT * FROM post_comments WHERE id = $root_id
      UNION ALL
      SELECT c.* FROM post_comments c JOIN tree t ON c.parent_id = t.id
    )

  Actual DB migration should add:
  - CHECK (parent_id IS NULL OR parent_id <> id)
  - CHECK (depth BETWEEN 0 AND 4)
  - CHECK ((depth = 0 AND parent_id IS NULL) OR (depth > 0 AND parent_id IS NOT NULL))
  - depth must equal parent.depth + 1; enforce via trigger or RPC.
  - Parent comment and child comment must share the same post_id; enforce via trigger or RPC.
  - CHECK (reply_count >= 0)
  - post.comment_count should include all descendants at every depth.

  Deletion policy:
  - Comment authors may soft-delete their own comments by setting deleted_at/deleted_by.
  - Default comment queries should filter or render according to deleted_at.
  - Deleted comments with children stay as placeholders.
  '''

  indexes {
    (post_id, parent_id, created_at) [name: 'idx_post_comments_tree']
    (author_id, created_at) [name: 'idx_post_comments_author_created_at']
    (deleted_at, created_at) [name: 'idx_post_comments_deleted_created_at']
  }
}

/* =========================================================
   Reactions
   ========================================================= */

Table post_reactions {
  id uuid [pk, default: `uuid_generate_v7()`]
  post_id uuid [not null, ref: > posts.id]
  user_id uuid [not null, ref: > profiles.id]
  type reaction_type [not null]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null, note: 'Set when reaction type changes']

  Note: '''
  One user can have only one reaction per post.
  Changing reaction should update type on the existing row.
  Recommended FK in migration: post_id ON DELETE CASCADE if admin hard-deletes post.
  '''

  indexes {
    (post_id, user_id) [unique]
    (post_id, created_at) [name: 'idx_post_reactions_post_created_at']
    (post_id, type) [name: 'idx_post_reactions_post_type']
    (user_id, created_at) [name: 'idx_post_reactions_user_created_at']
  }
}

Table comment_reactions {
  id uuid [pk, default: `uuid_generate_v7()`]
  comment_id uuid [not null, ref: > post_comments.id]
  user_id uuid [not null, ref: > profiles.id]
  type reaction_type [not null]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null, note: 'Set when reaction type changes']

  Note: '''
  One user can have only one reaction per comment.
  Changing reaction should update type on the existing row.
  Recommended FK in migration: comment_id ON DELETE CASCADE if admin hard-deletes comment.
  '''

  indexes {
    (comment_id, user_id) [unique]
    (comment_id, created_at) [name: 'idx_comment_reactions_comment_created_at']
    (comment_id, type) [name: 'idx_comment_reactions_comment_type']
    (user_id, created_at) [name: 'idx_comment_reactions_user_created_at']
  }
}

/* =========================================================
   Chat
   ========================================================= */

Table chat_rooms {
  id uuid [pk, default: `uuid_generate_v7()`]
  name text [null, note: 'Null means one-to-one chat']
  is_group boolean [not null, default: false]
  created_by uuid [null, ref: > profiles.id, note: 'On user deletion, set null']
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  Chat rooms are independent from community groups.
  Do not add groups.id linkage here; group chat means a standalone multi-member chat room.

  One-to-one room duplicates are prevented by direct_chat_pairs.
  For direct rooms:
  - is_group = false
  - name should be null
  - exactly two chat_room_members should exist

  For group chat rooms:
  - is_group = true
  - membership is controlled only by chat_room_members, not group_members.
  '''
}

Table direct_chat_pairs {
  room_id uuid [pk, ref: > chat_rooms.id]
  user1_id uuid [not null, ref: > profiles.id]
  user2_id uuid [not null, ref: > profiles.id]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  CRITICAL: Actual DB migration MUST add:
  - CHECK (user1_id < user2_id)
    Without this, the same two users can create duplicate rooms
    by swapping user1_id and user2_id. Always enforce user1_id < user2_id
    before insert (in RPC or application layer) so UNIQUE (user1_id, user2_id)
    is effective.
  - UNIQUE (user1_id, user2_id)
  - room_id should reference a chat_rooms row where is_group = false.
  - A controlled RPC should create chat_rooms, direct_chat_pairs,
    and two chat_room_members atomically.
  '''

  indexes {
    (user1_id, user2_id) [unique]
    (user1_id, created_at) [name: 'idx_direct_chat_pairs_user1_created_at']
    (user2_id, created_at) [name: 'idx_direct_chat_pairs_user2_created_at']
  }
}

Table chat_room_members {
  room_id uuid [not null, ref: > chat_rooms.id]
  user_id uuid [not null, ref: > profiles.id]
  joined_at timestamptz [not null, default: `now()`]

  Note: '''
  Chat membership policy:
  - No per-room member roles.
  - Any existing room member may add another accepted user to the room.
  - If moderation becomes necessary later, add a role or explicit room management model then.
  '''

  indexes {
    (room_id, user_id) [pk]
    (user_id, joined_at) [name: 'idx_chat_room_members_user_joined_at']
  }
}

Table messages {
  id uuid [pk, default: `uuid_generate_v7()`]
  room_id uuid [not null, ref: > chat_rooms.id]
  sender_id uuid [not null, ref: > profiles.id]
  parent_id uuid [null, ref: > messages.id, note: 'One-level message reply only']
  content text [not null]
  search_vector tsvector [null, note: 'Generated from content for Postgres full-text search']
  is_edited boolean [not null, default: false]
  edited_at timestamptz [null]
  deleted_at timestamptz [null, note: 'Soft delete']
  deleted_by uuid [null, ref: > profiles.id]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  Actual DB migration should add:
  - CHECK (parent_id IS NULL OR parent_id <> id)
  - sender_id must be a member of room_id.
  - parent_id message must belong to the same room_id.
  - parent_id should point only to a top-level message.
  - Generated column: search_vector = to_tsvector('simple', coalesce(content, '')) STORED
  - GIN index on search_vector for room message search.
  - Uses Postgres simple FTS. Korean search quality may need pg_trgm or language-specific search later.
  - RLS: only room members can select/insert messages.

  Edit/delete policy:
  - Message senders may edit their own messages only within 15 minutes of created_at.
  - Editing sets is_edited = true and edited_at = now().
  - Message senders may soft-delete their own messages by setting deleted_at/deleted_by.
  - Default message queries should filter or render according to deleted_at.
  - Deleting a message does not immediately delete Storage objects; handle attachment cleanup separately if needed.
  '''

  indexes {
    (room_id, created_at) [name: 'idx_messages_room_created_at']
    (sender_id, created_at) [name: 'idx_messages_sender_created_at']
    (parent_id, created_at) [name: 'idx_messages_parent_created_at']
    (search_vector) [name: 'idx_messages_search_vector']
  }
}

Table message_attachments {
  id uuid [pk, default: `uuid_generate_v7()`]
  message_id uuid [not null, ref: > messages.id]
  storage_bucket text [not null, note: 'Supabase Storage bucket name; use message-files']
  storage_path text [not null, note: 'Supabase Storage object path inside bucket']
  file_name text [not null, note: 'Original or display file name']
  content_type text [not null, note: 'MIME type. UI may initially allow images only.']
  size_bytes int8 [null, note: 'File size in bytes when available']
  sort_order int4 [not null, default: 0, note: 'Stable attachment order within a message']
  width int4 [null, note: 'Original image width for image attachments']
  height int4 [null, note: 'Original image height for image attachments']
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  General attachment table. The DB can store any file type.

  Recommended FK in migration:
  - message_id ON DELETE CASCADE if admin hard-deletes message.

  Actual DB migration should add:
  - CHECK (size_bytes IS NULL OR size_bytes >= 0)
  - CHECK (sort_order >= 0)
  - CHECK (width IS NULL OR width > 0)
  - CHECK (height IS NULL OR height > 0)
  '''

  indexes {
    (message_id, sort_order) [unique]
    (storage_bucket, storage_path) [unique]
  }
}

Table message_reactions {
  id uuid [pk, default: `uuid_generate_v7()`]
  message_id uuid [not null, ref: > messages.id]
  user_id uuid [not null, ref: > profiles.id]
  type reaction_type [not null]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null, note: 'Set when reaction type changes']

  Note: '''
  One user can have only one reaction per message.
  Changing reaction should update type on the existing row.
  Recommended FK in migration: message_id ON DELETE CASCADE if admin hard-deletes message.
  '''

  indexes {
    (message_id, user_id) [unique]
    (message_id, created_at) [name: 'idx_message_reactions_message_created_at']
    (message_id, type) [name: 'idx_message_reactions_message_type']
    (user_id, created_at) [name: 'idx_message_reactions_user_created_at']
  }
}

Table message_reads {
  message_id uuid [not null, ref: > messages.id]
  user_id uuid [not null, ref: > profiles.id]
  read_at timestamptz [not null, default: `now()`]

  Note: '''
  Optional detailed read-tracking table.
  One row means the user has read the specific message.

  Important product/performance rule:
  - This is NOT the source of truth for unread counts.
  - Do NOT insert rows for every unread message whenever a user opens a room.
  - Use this only when the UI needs exact per-message read members, such as a message detail view.
  - For one-to-one rooms, prefer chat_room_read_states only; exact read members are implied by the other participant's last_read state.
  - For group rooms, use this selectively for exact read-member lists, not for baseline unread tracking.
  - For large rooms, prefer read counts or limited recent-message reads over full read-member lists.
  - chat_room_read_states is the source of truth for unread counts and room-list read position.

  Recommended FK in migration: message_id ON DELETE CASCADE if admin hard-deletes message.
  '''

  indexes {
    (message_id, user_id) [pk]
    (user_id, read_at) [name: 'idx_message_reads_user_read_at']
  }
}

Table chat_room_read_states {
  room_id uuid [not null, ref: > chat_rooms.id]
  user_id uuid [not null, ref: > profiles.id]
  last_read_message_id uuid [null, ref: > messages.id]
  last_read_at timestamptz [not null, default: `now()`]

  Note: '''
  Fast read state table.
  Source of truth for unread count, last-read position, and room list ordering.
  Update this when a user reads a room or reaches a newer message.
  Keep writes coarse-grained; avoid updating it for every message bubble as it becomes visible.

  Actual DB migration should ensure last_read_message_id belongs to the same room_id.
  '''

  indexes {
    (room_id, user_id) [pk]
    (user_id, last_read_at) [name: 'idx_chat_room_read_states_user_last_read_at']
  }
}

/* =========================================================
   Notifications
   ========================================================= */

Table notifications {
  id uuid [pk, default: `uuid_generate_v7()`]
  recipient_id uuid [not null, ref: > profiles.id]
  actor_id uuid [null, ref: > profiles.id, note: 'Null for system notifications']
  title text [null]
  body text [null]
  group_id uuid [null, ref: > groups.id]
  post_id uuid [null, ref: > posts.id]
  comment_id uuid [null, ref: > post_comments.id]
  message_id uuid [null, ref: > messages.id]
  read_at timestamptz [null]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  Minimal in-app notification table.
  Add only if app needs notification list, unread badge, or notification history.
  This table is not a push token table.
  '''

  indexes {
    (recipient_id, created_at) [name: 'idx_notifications_recipient_created_at']
    (recipient_id, read_at, created_at) [name: 'idx_notifications_recipient_read_created_at']
    (group_id, created_at) [name: 'idx_notifications_group_created_at']
  }
}

/* =========================================================
   Gongang / Song Requests
   ========================================================= */

Table gongangs {
  id uuid [pk, default: `uuid_generate_v7()`]
  location text [not null, note: 'Space identifier']
  owner_id uuid [not null, ref: > profiles.id]
  week_start date [not null, note: 'Week start date']
  day_of_week int2 [not null, note: '0-6']
  start_minute int2 [not null, note: 'Minutes from 00:00; e.g. 540 = 09:00']
  end_minute int2 [not null, note: 'Minutes from 00:00; exclusive end. Current intended duration is 120 minutes.']
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  Uses minutes instead of hours to preserve future flexibility.
  Current intended slot duration: 2 hours.

  Actual DB migration should add:
  - CHECK (day_of_week BETWEEN 0 AND 6)
  - CHECK (start_minute BETWEEN 0 AND 1439)
  - CHECK (end_minute BETWEEN 1 AND 1440)
  - CHECK (start_minute < end_minute)
  - Optional if fixed 2-hour slots are final: CHECK (end_minute - start_minute = 120)
  - Prevent overlapping reservations for the same location using exclusion constraint.
  - Prevent overlapping reservations by the same owner using exclusion constraint.
  '''

  indexes {
    (location, week_start, day_of_week, start_minute, end_minute) [unique]
    (owner_id, week_start) [name: 'idx_gongangs_owner_week_start']
    (location, week_start, day_of_week, start_minute) [name: 'idx_gongangs_space_time']
  }
}

Table song_requests {
  id uuid [pk, default: `uuid_generate_v7()`]
  requester_id uuid [not null, ref: > profiles.id]
  url text [not null]
  requested_at timestamptz [not null, default: `now()`]

  indexes {
    (requester_id, requested_at) [name: 'idx_song_requests_requester_requested_at']
    (requested_at) [name: 'idx_song_requests_requested_at']
  }
}

/* =========================================================
   Clubs
   ========================================================= */

Table clubs {
  id uuid [pk, default: `uuid_generate_v7()`]
  name text [not null, unique]
  type club_type [not null, default: 'major']
  created_at timestamptz [not null, default: `now()`]
}

Table club_apply_rounds {
  id uuid [pk, default: `uuid_generate_v7()`]
  name text [not null, note: 'e.g. 2026 first semester club survey']
  starts_at timestamptz [null]
  ends_at timestamptz [null]
  is_active boolean [not null, default: true]
  created_by uuid [null, ref: > profiles.id]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  Use rounds instead of status if applications are survey-like.
  To reset applications, close current round and create a new round.
  Actual DB migration may add a partial unique index to allow only one active round.
  '''
}

Table clubs_apply {
  id uuid [pk, default: `uuid_generate_v7()`]
  round_id uuid [not null, ref: > club_apply_rounds.id]
  user_id uuid [not null, ref: > profiles.id]
  club_id uuid [not null, ref: > clubs.id]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  Multiple club applications per user are allowed.
  Duplicate application to the same club in the same round is blocked.
  No accepted/rejected status is included because this table is for survey/collection.
  '''

  indexes {
    (round_id, user_id, club_id) [unique]
    (round_id, club_id, created_at) [name: 'idx_clubs_apply_round_club_created_at']
    (round_id, user_id, created_at) [name: 'idx_clubs_apply_round_user_created_at']
  }
}

/* =========================================================
   Table Groups
   ========================================================= */

TableGroup identity {
  profiles
  permissions
  user_permissions
}

TableGroup community {
  groups
  group_members
  posts
  post_attachments
  post_comments
  post_reactions
  comment_reactions
}

TableGroup chat {
  chat_rooms
  direct_chat_pairs
  chat_room_members
  messages
  message_attachments
  message_reactions
  message_reads
  chat_room_read_states
}

TableGroup notifications_domain {
  notifications
}

TableGroup utilities {
  gongangs
  song_requests
}

TableGroup clubs_domain {
  clubs
  club_apply_rounds
  clubs_apply
}
