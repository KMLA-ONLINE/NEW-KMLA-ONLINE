Project school_community {
  database_type: 'PostgreSQL'

  Note: '''
  Supabase 기반 스키마.

  실제 마이그레이션에서 추가할 것:

- RLS 정책 (모든 public 테이블)
- 아래 명시된 CHECK 제약조건
- 아래 명시된 partial unique index
- 공강 중복 방지 exclusion constraint
- 캐시된 카운트/updated_at 트리거 및 RPC
- Supabase Storage 버킷 및 RLS 정책
- pg_trgm 확장 (한글 검색 지원)
- 아래 정의된 search RPC 함수

  ID 전략:

- 내부 테이블은 bigserial PK 사용 (성능)
- 외부 노출이 필요한 테이블(profiles, groups, communities, posts)은 uuid pub_id 컬럼 추가
- profiles.auth_user_id는 auth.users.id (uuid) 참조
- DBML `ref`에 ON DELETE 생략 — 각 테이블 Notes에 명시된 대로 마이그레이션 SQL에서 직접 추가

  Group vs Community:

- group: 앱 관리자가 관리하는 공식 그룹 (행정위 등)
- community: 사용자가 생성하는 비공식 그룹 (먹사팔 등)
- 구조는 같지만 다른 정책 적용을 위해 별도 테이블로 분리
  '''
  }

/* =========================================================
   Supabase Auth
   ========================================================= */

// 참조용 — 마이그레이션에서 auth.users를 직접 생성하지 말 것
Table auth.users {
  id uuid [pk]
}

/* =========================================================
   Supabase Storage
   ========================================================= */

// 생성할 Storage 버킷:
// - avatars: 프로필 이미지
// - group-images: 공식 그룹 대표 이미지
// - community-images: 커뮤니티 대표 이미지
// - post-files: 게시물 첨부파일
// - message-files: 메시지 첨부파일
//
// 버킷 정책은 각각 분리하여 관리 (접근 규칙이 다르므로)
// 오브젝트 경로 은닉에 의존하지 말고 RLS로 제어

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

Enum member_role {
  owner [note: '전체 제어']
  admin [note: '멤버 관리 + 핀 고정']
  manager [note: '핀 고정만 가능 (admin보다 약함)']
  member [note: '기본 멤버']
}

Enum notification_setting {
  none
  mentions
  all
}

Enum visibility {
  public
  invite_only
}

Enum gongang_location {
  B1
  two
  four
  ten
}

Enum club_type {
  major
  general
}

/* =========================================================
   Profiles / Permissions
   ========================================================= */

Table profiles {
  id bigserial [pk]
  auth_user_id uuid [not null, unique, ref: > auth.users.id]
  pub_id uuid [unique, default: `uuid_generate_v7()`, note: '외부 노출용 식별자']
  name text [not null, note: 'OAuth에서 가져온 초기 표시 이름']
  anonymous_username text [null, note: '익명 게시물/댓글에 표시될 이름']
  role app_role [not null, default: 'user', note: '관리자만 변경 가능']
  type profile_type [not null, default: 'student', note: '학생/교사/졸업생 구분 (app_role과 별개)']
  student_number char(6) [null, unique, note: '학생만 필수. 6자리 고정 (RLS 보조 수단)']
  class_no int2 [null, note: '반']
  cohort int2 [null, note: '기수 (e.g. 28)']
  gender profile_gender [null]
  phone_number text [null, note: '매우 권장, 필수는 아님']
  avatar_url text [null, note: '프로필 이미지 URL (avatars 버킷)']
  birthday date [null]
  description text [null]
  status profile_status [not null, default: 'none', note: 'none → 최초 정보 기록 완료 → pending → 관리자 승인/거절']
  dorm_room int2 [null]
  onboarding_completed_at timestamptz [null, note: '최초 설문']
  status_updated_at timestamptz [null]
  status_updated_by bigint [null, ref: > profiles.id]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null]

  Note: '''
  마이그레이션에서 추가할 제약:

- CHECK (cohort IS NULL OR cohort BETWEEN 1 AND 100)
- CHECK (class_no IS NULL OR class_no > 0)
- CHECK (student_number IS NULL OR student_number ~ '^\d{6}$')
- CHECK (dorm_room IS NULL OR dorm_room > 0)
- CHECK (type <> 'student' OR (student_number IS NOT NULL AND cohort IS NOT NULL))
- UNIQUE (student_number)

  RLS:

- 사용자는 자신의 안전한 필드만 수정 가능
- role/status/status_updated_*는 관리자 전용
- anonymous_username은 본인만 읽기 가능, 익명 게시물에만 타인에게 표시

  승인 흐름:

- Google OAuth만으로 커뮤니티 접근 불가
- status = none → 온보딩 제출 → pending → 관리자 승인/거절
- 승인된 사용자만 메인 라우트 접근 가능
  '''
  }

Table permissions {
  key text [pk, note: '권한 키 (예: gongang, karaoke)']
  name text [not null, note: '표시 이름 (예: 공강, 노래방)']
  description text [null]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  앱 전체 기능 권한 레지스트리 (공강, 노래방 등).
  group/community 역할과 무관 — 멤버십 관리는 member tables에서 처리.

  user_permissions와의 관계:

- permissions: 사용 가능한 기능 정의
- user_permissions: 특정 사용자에게 기능 부여
  '''
}

Table user_permissions {
  user_id bigint [not null, ref: > profiles.id]
  permission_key text [not null, ref: > permissions.key]
  granted_at timestamptz [not null, default: `now()`]
  granted_by bigint [null, ref: > profiles.id]

  Note: '''
  관리자 전용. 앱 전체 기능 권한 부여 (group/community 접근 권한과 별개).
  '''

  indexes {
    (user_id, permission_key) [pk]
  }
}

/* =========================================================
   Groups (공식 그룹)
   ========================================================= */

Table groups {
  id bigserial [pk]
  pub_id uuid [unique, default: `uuid_generate_v7()`, note: '외부 노출용 식별자']
  name text [not null, unique, note: '공식 그룹 이름은 전역 고유']
  description text [null]
  image_url text [null, note: '그룹 이미지 (group-images 버킷)']
  visibility visibility [not null, default: 'public', note: 'public = 누구나 가입, invite_only = 초대 전용']
  created_by bigint [null, ref: > profiles.id]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null]

  Note: '''
  앱 관리자가 관리하는 공식 그룹 (반, 학교 동아리, 공식 조직).

  마이그레이션 추가사항:

- 관리자만 생성/삭제 가능
- 정확히 1명의 owner 필요 (partial unique index + 트리거)
- created_by: ON DELETE SET NULL
  '''
}

Table group_members {
  group_id bigint [not null, ref: > groups.id]
  user_id bigint [not null, ref: > profiles.id]
  role member_role [not null, default: 'member']
  notification_setting notification_setting [not null, default: 'mentions']
  banned_at timestamptz [null, note: '설정 시 해당 사용자 차단']
  banned_by bigint [null, ref: > profiles.id]
  ban_reason text [null, note: '차단 사유']
  joined_at timestamptz [not null, default: `now()`]

  Note: '''
  - Partial unique index: UNIQUE (group_id) WHERE role = 'owner'
  - RLS: 멤버만 그룹 데이터 접근 가능
  - banned_at 설정 시 그룹 및 게시물 접근 불가
  - owner/admin만 차단 가능
  '''

  indexes {
    (group_id, user_id) [pk]
    (user_id, joined_at) [name: 'idx_group_members_user_joined_at']
    (group_id, role) [name: 'idx_group_members_group_role']
  }
}

/* =========================================================
   Communities (사용자 생성)
   ========================================================= */

Table communities {
  id bigserial [pk]
  pub_id uuid [unique, default: `uuid_generate_v7()`, note: '외부 노출용 식별자']
  name text [not null]
  description text [null]
  image_url text [null, note: '커뮤니티 이미지 (community-images 버킷)']
  visibility visibility [not null, default: 'public', note: 'public = 누구나 가입, invite_only = 초대 전용']
  created_by bigint [null, ref: > profiles.id]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null]

  Note: '''
  사용자가 생성하는 비공식 그룹 + 먹사팔 등.

  마이그레이션 추가사항:

- 승인된 사용자라면 누구나 생성 가능
- 정확히 1명의 owner 필요
- created_by: ON DELETE SET NULL
- 이름 전역 고유 아님 (중복 가능)
  '''
}

Table community_members {
  community_id bigint [not null, ref: > communities.id]
  user_id bigint [not null, ref: > profiles.id]
  role member_role [not null, default: 'member']
  notification_setting notification_setting [not null, default: 'mentions']
  banned_at timestamptz [null, note: '설정 시 해당 사용자 차단']
  banned_by bigint [null, ref: > profiles.id]
  ban_reason text [null, note: '차단 사유']
  joined_at timestamptz [not null, default: `now()`]

  Note: '''
  - Partial unique index: UNIQUE (community_id) WHERE role = 'owner'
  - RLS: 멤버만 데이터 접근 가능
  - banned_at 설정 시 접근 불가
  '''

  indexes {
    (community_id, user_id) [pk]
    (user_id, joined_at) [name: 'idx_community_members_user_joined_at']
    (community_id, role) [name: 'idx_community_members_community_role']
  }
}

/* =========================================================
   Posts / Images / Comments
   ========================================================= */

Table posts {
  id bigserial [pk]
  pub_id uuid [unique, default: `uuid_generate_v7()`, note: '외부 노출용 식별자']
  group_id bigint [null, ref: > groups.id]
  community_id bigint [null, ref: > communities.id]
  author_id bigint [not null, ref: > profiles.id]
  title text [not null]
  content text [not null]
  is_anonymous boolean [not null, default: false, note: 'true면 anonymous_username으로 표시']
  search_vector tsvector [null, note: 'title+content → to_tsvector STORED']
  is_pinned boolean [not null, default: false, note: '그룹/커뮤니티 내 고정 공지']
  pinned_at timestamptz [null]
  pinned_by bigint [null, ref: > profiles.id]
  comment_count int4 [not null, default: 0, note: '댓글 수 캐시 (답글 포함)']
  reaction_count int4 [not null, default: 0, note: '리액션 수 캐시 (모든 종류 합계)']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null]
  deleted_at timestamptz [null, note: '소프트 삭제']
  deleted_by bigint [null, ref: > profiles.id]

  Note: '''
  하나의 게시물은 group 또는 community 중 하나에만 속함.

  마이그레이션 추가사항:

- CHECK (group_id IS NOT NULL OR community_id IS NOT NULL)
- CHECK (group_id IS NULL OR community_id IS NULL)
- CHECK (is_pinned 관련 일관성)
- CHECK (comment_count >= 0, reaction_count >= 0)
- search_vector = to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, '')) STORED
- ⚠ to_tsvector('simple')은 한글 형태소 분석 불가. pg_trgm ILIKE 검색을 함께 사용할 것
- author는 그룹/커뮤니티의 멤버여야 함
- owner/admin/manager만 핀 고정 가능
- Partial index: (group_id, pinned_at DESC) WHERE group_id IS NOT NULL AND ...
- Partial index: (community_id, pinned_at DESC) WHERE community_id IS NOT NULL AND ...

  익명:

- is_anonymous = true면 anonymous_username으로 표시
- author_id는 그대로 저장 (소유권/RLS용)
- owner/admin은 실제 작성자 확인 가능

  수정/삭제:

- 작성자는 제목/내용/첨부파일 무제한 수정 가능
- is_pinned 등은 owner/admin만 변경
- 소프트 삭제 (deleted_at IS NULL 필터링)
  '''

  indexes {
    (group_id, created_at) [name: 'idx_posts_group_created_at']
    (group_id, is_pinned, pinned_at, created_at) [name: 'idx_posts_group_pinned_created_at']
    (community_id, created_at) [name: 'idx_posts_community_created_at']
    (community_id, is_pinned, pinned_at, created_at) [name: 'idx_posts_community_pinned_created_at']
    (author_id, created_at) [name: 'idx_posts_author_created_at']
    (deleted_at, created_at) [name: 'idx_posts_deleted_created_at']
    (search_vector) [name: 'idx_posts_search_vector']
  }
}

Table post_attachments {
  id bigserial [pk]
  post_id bigint [not null, ref: > posts.id]
  storage_bucket text [not null, note: 'Storage 버킷 (post-files)']
  storage_path text [not null, note: 'Storage 오브젝트 경로']
  file_name text [not null, note: '원본 파일명']
  content_type text [not null, note: 'MIME 타입']
  size_bytes int8 [null]
  sort_order int4 [not null, default: 0, note: '정렬 순서']
  alt text [null, note: '이미지 대체 텍스트']
  width int4 [null]
  height int4 [null]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  post_id: ON DELETE CASCADE
  CHECK: size_bytes >= 0, sort_order >= 0, width/height > 0
  '''

  indexes {
    (post_id, sort_order) [unique]
    (storage_bucket, storage_path) [unique]
  }
}

Table comments {
  id bigserial [pk]
  post_id bigint [not null, ref: > posts.id]
  author_id bigint [not null, ref: > profiles.id]
  parent_id bigint [null, ref: > comments.id, note: 'null=최상위, non-null=1레벨 답글']
  content text [not null]
  search_vector tsvector [null, note: '전문 검색용 generated column']
  is_anonymous boolean [not null, default: false]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null]
  deleted_at timestamptz [null, note: '소프트 삭제; 답글이 있으면 placeholder 유지']
  deleted_by bigint [null, ref: > profiles.id]

  Note: '''
  1레벨 중첩만 허용:
  - parent_id IS NULL → 최상위 댓글
  - parent_id IS NOT NULL → 최상위 댓글에 대한 답글 (중첩 답글 불가)

  CHECK: parent_id <> id
  부모와 자식은 같은 post_id여야 함 (트리거 또는 RPC로 강제)
  post.comment_count는 모든 댓글 포함 (답글 포함)
  search_vector = to_tsvector('simple', coalesce(content, '')) STORED
  '''

  indexes {
    (post_id, parent_id, created_at) [name: 'idx_comments_tree']
    (author_id, created_at) [name: 'idx_comments_author_created_at']
    (deleted_at, created_at) [name: 'idx_comments_deleted_created_at']
    (search_vector) [name: 'idx_comments_search_vector']
  }
}

/* =========================================================
   Reactions
   ========================================================= */

Table reaction_types {
  id bigserial [pk]
  key text [not null, unique, note: '예: like, love, laugh, wow, sad, angry']
  name text [not null, note: '표시 이름 (예: 좋아요, 사랑해요)']
  icon text [null, note: '아이콘 식별자']
  sort_order int2 [not null, default: 0]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  리액션 종류 레지스트리 (permissions 테이블과 동일한 패턴).
  새로운 리액션 타입은 이 테이블에 행을 추가하여 확장.
  '''
}

Table post_reactions {
  id bigserial [pk]
  post_id bigint [not null, ref: > posts.id]
  user_id bigint [not null, ref: > profiles.id]
  reaction_type_id bigint [not null, ref: > reaction_types.id]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null, note: '리액션 종류 변경 시 갱신']

  Note: '''
  사용자당 게시물당 1개의 리액션만 가능.
  리액션 종류 변경은 같은 행의 reaction_type_id를 UPDATE.
  취소는 행 삭제. post_id: ON DELETE CASCADE.
  '''

  indexes {
    (post_id, user_id) [unique]
    (post_id, reaction_type_id) [name: 'idx_post_reactions_type_count']
    (user_id, created_at) [name: 'idx_post_reactions_user_created_at']
  }
}

Table comment_reactions {
  id bigserial [pk]
  comment_id bigint [not null, ref: > comments.id]
  user_id bigint [not null, ref: > profiles.id]
  reaction_type_id bigint [not null, ref: > reaction_types.id]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null, note: '리액션 종류 변경 시 갱신']

  Note: '''
  사용자당 댓글당 1개의 리액션만 가능.
  comment_id: ON DELETE CASCADE.
  '''

  indexes {
    (comment_id, user_id) [unique]
    (comment_id, reaction_type_id) [name: 'idx_comment_reactions_type_count']
    (user_id, created_at) [name: 'idx_comment_reactions_user_created_at']
  }
}

/* =========================================================
   Chat
   ========================================================= */

Table chat_rooms {
  id bigserial [pk]
  name text [null, note: 'null = 1:1 채팅']
  is_group boolean [not null, default: false]
  created_by bigint [null, ref: > profiles.id]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  채팅방은 groups/communities와 독립적.
  1:1 중복 방지는 direct_chat_pairs에서 처리.

  1:1 방: is_group = false, name = null, 멤버 정확히 2명
  단체 방: is_group = true, 멤버십은 chat_room_members로만 관리
  '''
  }

Table direct_chat_pairs {
  room_id bigint [pk, ref: > chat_rooms.id]
  user1_id bigint [not null, ref: > profiles.id]
  user2_id bigint [not null, ref: > profiles.id]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  1:1 채팅의 중복 방지용.
  중요: CHECK (user1_id < user2_id), UNIQUE (user1_id, user2_id)
  room_id는 is_group = false인 방이어야 함.
  생성 RPC는 chat_rooms + direct_chat_pairs + chat_room_members 2개를 원자적으로 생성.
  '''

  indexes {
    (user1_id, user2_id) [unique]
    (user1_id, created_at) [name: 'idx_direct_chat_pairs_user1_created_at']
    (user2_id, created_at) [name: 'idx_direct_chat_pairs_user2_created_at']
  }
}

Table chat_room_members {
  room_id bigint [not null, ref: > chat_rooms.id]
  user_id bigint [not null, ref: > profiles.id]
  joined_at timestamptz [not null, default: `now()`]

  Note: '''
  방별 역할 없음. 기존 멤버는 누구나 다른 사용자 추가 가능.
  필요시 추후 role 추가.
  '''

  indexes {
    (room_id, user_id) [pk]
    (user_id, joined_at) [name: 'idx_chat_room_members_user_joined_at']
  }
}

Table messages {
  id bigserial [pk]
  room_id bigint [not null, ref: > chat_rooms.id]
  sender_id bigint [not null, ref: > profiles.id]
  parent_id bigint [null, ref: > messages.id, note: '1레벨 답글만 허용']
  content text [not null]
  search_vector tsvector [null, note: 'content → to_tsvector STORED']
  is_edited boolean [not null, default: false]
  edited_at timestamptz [null]
  deleted_at timestamptz [null, note: '소프트 삭제']
  deleted_by bigint [null, ref: > profiles.id]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  CHECK: parent_id <> id
  sender는 room의 멤버여야 함
  search_vector = to_tsvector('simple', coalesce(content, '')) STORED
  ⚠ to_tsvector('simple')은 한글 형태소 분석 불가. pg_trgm ILIKE 검색을 함께 사용할 것

  수정: 15분 이내만 가능
  삭제: 소프트 삭제
  '''

  indexes {
    (room_id, created_at) [name: 'idx_messages_room_created_at']
    (sender_id, created_at) [name: 'idx_messages_sender_created_at']
    (parent_id, created_at) [name: 'idx_messages_parent_created_at']
    (search_vector) [name: 'idx_messages_search_vector']
  }
}

Table message_attachments {
  id bigserial [pk]
  message_id bigint [not null, ref: > messages.id]
  storage_bucket text [not null, note: 'message-files 버킷']
  storage_path text [not null]
  file_name text [not null]
  content_type text [not null, note: 'MIME 타입']
  size_bytes int8 [null]
  sort_order int4 [not null, default: 0]
  width int4 [null]
  height int4 [null]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  message_id: ON DELETE CASCADE.
  CHECK: size_bytes >= 0, sort_order >= 0, width/height > 0
  '''

  indexes {
    (message_id, sort_order) [unique]
    (storage_bucket, storage_path) [unique]
  }
}

Table message_reactions {
  id bigserial [pk]
  message_id bigint [not null, ref: > messages.id]
  user_id bigint [not null, ref: > profiles.id]
  reaction_type_id bigint [not null, ref: > reaction_types.id]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [null, note: '리액션 종류 변경 시 갱신']

  Note: '''
  사용자당 메시지당 1개의 리액션만 가능.
  message_id: ON DELETE CASCADE.
  '''

  indexes {
    (message_id, user_id) [unique]
    (message_id, reaction_type_id) [name: 'idx_message_reactions_type_count']
    (user_id, created_at) [name: 'idx_message_reactions_user_created_at']
  }
}

Table message_reads {
  message_id bigint [not null, ref: > messages.id]
  user_id bigint [not null, ref: > profiles.id]
  read_at timestamptz [not null, default: `now()`]

  Note: '''
  세부 읽음 추적용 (선택사항).
  읽지 않음 카운트의 source of truth는 chat_room_read_states.
  이 테이블은 특정 메시지의 읽은 멤버 목록이 필요할 때만 사용.
  대규모 방에서는 전체 읽음 목록 대신 읽음 수나 최근 메시지만 표시.
  '''

  indexes {
    (message_id, user_id) [pk]
    (user_id, read_at) [name: 'idx_message_reads_user_read_at']
  }
}

Table chat_room_read_states {
  room_id bigint [not null, ref: > chat_rooms.id]
  user_id bigint [not null, ref: > profiles.id]
  last_read_message_id bigint [null, ref: > messages.id]
  last_read_at timestamptz [not null, default: `now()`]

  Note: '''
  읽지 않음 카운트의 source of truth.
  방 목록 정렬에도 사용. 세밀한 업데이트보다는 coarse-grained 유지.
  last_read_message_id는 같은 room_id여야 함.
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
  id bigserial [pk]
  recipient_id bigint [not null, ref: > profiles.id]
  actor_id bigint [null, ref: > profiles.id, note: 'null = 시스템 알림']
  title text [null]
  body text [null]
  group_id bigint [null, ref: > groups.id]
  community_id bigint [null, ref: > communities.id]
  post_id bigint [null, ref: > posts.id]
  comment_id bigint [null, ref: > comments.id]
  message_id bigint [null, ref: > messages.id]
  read_at timestamptz [null]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  인앱 알림 최소 테이블. 푸시 토큰 테이블 아님.
  '''

  indexes {
    (recipient_id, created_at) [name: 'idx_notifications_recipient_created_at']
    (recipient_id, read_at, created_at) [name: 'idx_notifications_recipient_read_created_at']
    (group_id, created_at) [name: 'idx_notifications_group_created_at']
    (community_id, created_at) [name: 'idx_notifications_community_created_at']
  }
}

/* =========================================================
   Gongang / Song Requests
   ========================================================= */

Table gongangs {
  id bigserial [pk]
  location gongang_location [not null]
  owner_id bigint [not null, ref: > profiles.id]
  day_of_week int2 [not null, note: '0-6 (일=0, 월=1, ...)']
  start_minute int2 [not null, note: '00:00 기준 분 (540 = 09:00)']
  end_minute int2 [not null, note: '종료 분 (exclusive). 기본 120분.']
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  week_start 제거 — 학기/년 단위 주간 반복 스케줄.

  CHECK: day_of_week 0-6, start_minute 0-1439, end_minute 1-1440, start < end
  동일 위치/소유자의 중복 예약은 exclusion constraint로 방지
  '''

  indexes {
    (location, day_of_week, start_minute, end_minute) [unique]
    (owner_id) [name: 'idx_gongangs_owner']
    (location, day_of_week, start_minute) [name: 'idx_gongangs_location_time']
  }
}

Table song_requests {
  id bigserial [pk]
  requester_id bigint [not null, ref: > profiles.id]
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
  id bigserial [pk]
  name text [not null, unique]
  description text [null, note: '동아리 설명/홍보용']
  type club_type [not null, default: 'major']
  created_at timestamptz [not null, default: `now()`]
}

Table club_apply_rounds {
  id bigserial [pk]
  name text [not null, note: '예: 2026 1학기 동아리 신청']
  starts_at timestamptz [null]
  ends_at timestamptz [null]
  created_by bigint [null, ref: > profiles.id]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  라운드 방식 — 상태 대신 라운드 시작/종료로 신청 기간 관리.
  is_active 제거 (starts_at/ends_at으로 추론).
  활성 라운드는 starts_at NOT NULL 권장.
  '''
}

Table clubs_apply {
  id bigserial [pk]
  round_id bigint [not null, ref: > club_apply_rounds.id]
  user_id bigint [not null, ref: > profiles.id]
  club_id bigint [not null, ref: > clubs.id]
  created_at timestamptz [not null, default: `now()`]

  Note: '''
  사용자당 여러 동아리 신청 가능.
  같은 라운드에서 같은 동아리 중복 신청 차단 (unique index).
  survey/수집용 — 승인/거절 상태 없음.
  '''

  indexes {
    (round_id, user_id, club_id) [unique]
    (round_id, club_id, created_at) [name: 'idx_clubs_apply_round_club_created_at']
    (round_id, user_id, created_at) [name: 'idx_clubs_apply_round_user_created_at']
  }
}

/* =========================================================
   검색 RPC 함수
   ========================================================= */

// 마이그레이션에서 생성할 검색 RPC.
// pg_trgm 확장 기반의 ILIKE 검색이 한글에서 더 정확하므로
// to_tsvector('simple', ...) GIN 검색과 함께 병용.
//
// RPC: search_posts(query text, space_type text, space_id bigint)
//   - space_type: 'group' | 'community' | null (전체)
//   - space_id: 특정 공간으로 제한
//   - posts.title/content + comments.content 에서 ILIKE '%query%' 매칭
//   - is_anonymous = true인 경우에도 author_id는 검색 가능 (admin용)
//   - deleted_at IS NULL 인 행만 포함
//   - 결과: post_id, title, content_snippet, author_name, space_name, created_at, match_type
//
// RPC: search_messages(query text, room_id bigint)
//   - 특정 채팅방 내 메시지 검색
//   - content ILIKE '%query%'
//   - deleted_at IS NULL

/* =========================================================
   Table Groups
   ========================================================= */

TableGroup identity {
  profiles
  permissions
  user_permissions
}

TableGroup official {
  groups
  group_members
}

TableGroup unofficial {
  communities
  community_members
}

TableGroup content {
  posts
  post_attachments
  comments
  reaction_types
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
