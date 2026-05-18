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
  student_number int4 [not null, unique]
  class_no int2 [null, note: 'Class number']
  grade int2 [not null, note: 'School year']
  gender profile_gender [null]
  phone_number text [not null]
  avatar_url text [null, note: 'Avatar URL or Supabase Storage path']
  birthday date [null]
  description text [null]
  status profile_status [not null, default: 'none', note: 'none -> pending after onboarding/survey -> accepted/rejected by admin']
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
  - UNIQUE (student_number)

  RLS:
  - User may update safe profile fields only.
  - role/status/status_updated_* must be admin-only or RPC-only.
  '''
}

Table permissions {
  key text [pk, note: 'Permission key, e.g. gongang, karaoke']
  name text [not null, note: 'Display name, e.g. 공강, 노래방']
  description text [null]
  created_at timestamptz [not null, default: `now()`]
}

Table user_permissions {
  user_id uuid [not null, ref: > profiles.id]
  permission_key text [not null, ref: > permissions.key]
  granted_at timestamptz [not null, default: `now()`]
  granted_by uuid [null, ref: > profiles.id]

  Note: '''
  Admin-controlled only.
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
  is_official boolean [not null, default: false]
  is_personal boolean [not null, default: false, note: 'Story-like personal group; hidden from normal group list']
  is_listed boolean [not null, default: true, note: 'Personal groups should be false']
  created_by uuid [null, ref: > profiles.id, note: 'On user deletion, set null']
  archived_at timestamptz [null, note: 'Archive instead of deleting group']
  archived_by uuid [null, ref: > profiles.id]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null]

  Note: '''
  Actual DB migration should add:
  - CHECK (NOT (is_official AND is_personal))
  - CHECK (NOT is_personal OR is_listed = false)
  - Partial unique index: UNIQUE (name) WHERE is_official = true
  - Partial unique index: UNIQUE (created_by) WHERE is_personal = true
  - Exactly one owner per group:
    * At most one owner by partial unique index on group_members(group_id) WHERE role = 'owner'
    * At least one owner by trigger/RPC or controlled group creation flow
  - created_by should use ON DELETE SET NULL in migration.
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
  comment_count int4 [not null, default: 0, note: 'Cached count; includes all comments and replies at every depth']
  reaction_count int4 [not null, default: 0, note: 'Cached count from post_reactions']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null]
  deleted_at timestamptz [null, note: 'Soft delete']
  deleted_by uuid [null, ref: > profiles.id]

  Note: '''
  Actual DB migration should add:
  - CHECK (comment_count >= 0)
  - CHECK (reaction_count >= 0)
  - RLS: author must be a member of group_id.
  - Partial index: (group_id, created_at DESC) WHERE deleted_at IS NULL
  - Admin-only hard delete.
  '''

  indexes {
    (group_id, created_at) [name: 'idx_posts_group_created_at']
    (author_id, created_at) [name: 'idx_posts_author_created_at']
    (deleted_at, created_at) [name: 'idx_posts_deleted_created_at']
  }
}

Table post_images {
  id uuid [pk, default: `uuid_generate_v7()`]
  post_id uuid [not null, ref: > posts.id]
  storage_path text [not null, note: 'Supabase Storage object path']
  sort_order int4 [not null, default: 0, note: 'Stable image order within a post']
  alt text [null, note: 'Accessible alt text']
  width int4 [null, note: 'Original image width']
  height int4 [null, note: 'Original image height']
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  Recommended FK in migration:
  - post_id ON DELETE CASCADE if admin hard-deletes post.
  '''

  indexes {
    (post_id, sort_order) [unique]
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
  - Soft-delete policy: deleted comments with children stay as placeholder.
  - post.comment_count should include all descendants at every depth.
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
  One-to-one room duplicates are prevented by direct_chat_pairs.
  For direct rooms:
  - is_group = false
  - name should be null
  - exactly two chat_room_members should exist
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
  - RLS: only room members can select/insert messages.
  '''

  indexes {
    (room_id, created_at) [name: 'idx_messages_room_created_at']
    (sender_id, created_at) [name: 'idx_messages_sender_created_at']
    (parent_id, created_at) [name: 'idx_messages_parent_created_at']
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
  Detailed read-tracking table.
  One row means the user has read the specific message.
  Keep this if the UI needs exact per-message read members.
  For faster unread counts, use chat_room_read_states.
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
  Used for unread count and room list ordering.
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
  post_images
  post_comments
  post_reactions
  comment_reactions
}

TableGroup chat {
  chat_rooms
  direct_chat_pairs
  chat_room_members
  messages
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