# Schema Explanation

이 문서는 Supabase schema 관련 파일을 사람이 빠르게 이해하기 위한 설명서다. 실제 기준은 항상 `supabase/migrations/`의 SQL 파일이며, `docs/SCHEMA.md`와 `docs/migration.md`는 그 SQL을 작성하고 검토하기 위한 설계/실행 문서다.

## 전체 구조

이 schema는 KMLA Online의 학교 커뮤니티 기능을 위한 PostgreSQL/Supabase 구조다. 큰 축은 다음과 같다.

- Auth와 profile: Supabase Auth 사용자를 `profiles`에 연결하고, 가입 승인 상태와 권한을 관리한다.
- Spaces: 공식 그룹과 사용자 커뮤니티를 `spaces` 하나로 통합하고, 멤버십/역할/차단을 `space_members`로 관리한다.
- Content: 게시글, 댓글, 첨부파일, 익명 작성, 핀 고정, soft delete를 처리한다.
- Reactions: 게시글/댓글/메시지 반응 타입과 사용자별 반응을 관리한다.
- Chat: 1:1 채팅, 그룹 채팅, 메시지, 첨부파일, 읽음 상태를 관리한다.
- Notifications: 게시글/댓글/메시지 등에서 발생하는 알림을 저장하고, space 알림은 멤버별 설정에 따라 생성 여부를 결정한다.
- Utilities: 공강표와 노래 신청 같은 부가 기능을 저장한다.
- Clubs: 동아리와 신청 기간, 사용자 신청을 관리한다.
- Storage: Supabase Storage 버킷, `storage.objects` RLS, 첨부파일 finalize, cleanup queue를 관리한다.
- Security: 모든 public domain table에 RLS를 적용하고, 직접 table 변경보다 RPC/trigger/helper로 상태 전이를 제한한다.

## 문서 파일

### `docs/SCHEMA.md`

DBML 형태의 사람이 읽는 데이터 모델 문서다. 테이블, enum, 주요 인덱스, 관계, storage bucket, 검색 RPC 계약을 한눈에 보기 위해 필요하다. SQL migration처럼 실행되는 파일은 아니지만, 테이블 구조를 논의하거나 리뷰할 때 가장 빠른 참조점이다.

### `docs/migration.md`

SQL migration을 어떤 순서와 의도로 작성해야 하는지 설명하는 실행서다. 각 migration section이 담당하는 테이블, constraint, trigger, RPC, RLS, storage 정책, 검증 절차를 포함한다. PR 리뷰어가 SQL 파일만 보고 의도를 추측하지 않도록 만드는 문서다.

### `docs/explaination.md`

현재 파일이다. `SCHEMA.md`와 `migration.md`보다 더 짧게, “무엇이 어디에 있고 왜 필요한가”를 설명한다. 새로 참여한 사람이 schema 관련 파일의 역할을 빠르게 파악하는 용도다.

## Supabase 설정

### `supabase/config.toml`

로컬 Supabase 프로젝트 설정이다. API 노출 schema, DB 버전, auth, storage, edge runtime, function entrypoint를 정의한다. 특히 `public`이 API schema로 노출되므로 SQL migration에서 RLS와 grant/revoke를 명확히 해 두는 이유와 직접 연결된다.

## Migration 파일

Migration은 이름순으로 적용된다. 앞 파일이 만든 enum/table/function을 뒤 파일이 참조하므로 순서가 중요하다.

### `supabase/migrations/20260611072414_remote_schema.sql`

Supabase remote baseline을 담은 시작점이다. 기본 extension과 public schema privilege 상태를 기록한다. 이후 migration들이 이 baseline 위에서 불필요한 default privilege를 회수하고 앱 전용 schema를 올릴 수 있게 해 준다.

### `supabase/migrations/20260612001825_foundation.sql`

앱 schema의 바닥을 만든다. `private` schema, `pg_trgm`, `btree_gist`, 그리고 `app_role`, `profile_status`, `space_type` 같은 enum들을 생성한다. 뒤의 모든 table/RPC/RLS가 이 enum과 private helper 공간에 의존하므로 가장 먼저 필요하다.

### `supabase/migrations/20260612001830_identity.sql`

사용자 identity 계층을 만든다. `profiles`, `permissions`, `user_permissions`, Auth user 생성 trigger, `private.current_profile_id()`, `private.is_accepted_user()`를 정의한다. 이후 대부분의 RLS와 RPC가 “현재 사용자의 profile id”와 “승인된 사용자 여부”를 기준으로 동작하므로 핵심 기반 파일이다.

### `supabase/migrations/20260612120344_tables_spaces.sql`

`spaces`와 `space_members`를 만든다. 공식 그룹과 커뮤니티를 하나의 공간 모델로 통합하고, 멤버 역할, 알림 설정(`off`/`mentions`/`all`), 차단 상태를 저장한다. 게시글, 채팅, 알림, storage 접근 권한의 출발점이다.

### `supabase/migrations/20260612120411_tables_content.sql`

`posts`, `post_attachments`, `comments`를 만든다. 게시판의 본문 데이터와 첨부파일 metadata, 댓글 tree를 저장한다. soft delete, 익명 작성, comment/reaction count 같은 사용자-facing 콘텐츠 기능의 중심이다.

### `supabase/migrations/20260612120414_tables_reactions.sql`

`reaction_types`, `post_reactions`, `comment_reactions`를 만든다. 반응 종류를 registry로 관리하고, 사용자당 하나의 반응만 허용하는 구조의 기반이다. reaction count cache와 RLS 정책이 이 테이블들에 붙는다.

### `supabase/migrations/20260612120417_tables_chat.sql`

채팅 도메인 테이블을 만든다. `chat_rooms`, `direct_chat_pairs`, `chat_room_members`, `messages`, message attachment/reaction/read state를 포함한다. 1:1 채팅 중복 방지, 그룹 채팅 멤버십, 메시지 읽음 상태를 분리해 다루기 위해 필요하다.

### `supabase/migrations/20260612120420_tables_notifications.sql`

`notifications`를 만든다. 알림 수신자, actor, 관련 post/comment/message/space, 읽음 시간을 저장한다. 알림은 여러 도메인을 가리키므로 nullable FK와 `space_type` 동기화 trigger가 뒤에서 붙고, space 알림 설정은 `create_notification` RPC에서 적용된다.

### `supabase/migrations/20260612120424_tables_utilities.sql`

`gongangs`, `song_requests`를 만든다. 공강 예약/표시와 노래 신청 같은 부가 기능을 별도 도메인으로 분리한다. 공강은 시간 range 충돌 방지 constraint가 뒤에서 추가된다.

### `supabase/migrations/20260612120427_tables_clubs.sql`

`clubs`, `club_apply_rounds`, `clubs_apply`를 만든다. 동아리 정보, 신청 기간, 사용자 신청을 저장한다. 신청 기간 중복 방지와 신청 가능 여부 검사는 constraint/RPC/RLS에서 이어진다.

### `supabase/migrations/20260612120836_indexes.sql`

조회 성능을 위한 index를 모은다. profile 상태, space directory, 게시글/댓글/메시지 목록, 반응 count, 채팅 room, 알림, 공강, 동아리 신청, 한글 검색용 trigram expression index를 포함한다. table 정의와 분리되어 있어 성능 목적의 변경을 리뷰하기 쉽다.

### `supabase/migrations/20260612120839_constraints.sql`

데이터 무결성 규칙을 모은다. unique, check, exclusion constraint를 추가해 잘못된 상태가 DB에 들어가지 못하게 한다. 예를 들어 학생 번호/전화번호 형식, soft delete 상태, pinned 상태, direct chat pair 정규화, 공강 시간 충돌, 동아리 신청 기간 충돌을 DB 레벨에서 막는다.

### `supabase/migrations/20260612120843_triggers.sql`

자동 계산과 상태 보호 trigger를 모은다. 작성자 identity stamping, post의 `space_type` 동기화, notification의 space type 동기화, 댓글/메시지 parent 검증, direct chat 불변성, count cache, `updated_at`, 메시지 edit 상태, Auth user 삭제 후 profile 연결 해제를 처리한다. 클라이언트가 놓칠 수 있는 일관성을 DB가 보장하게 만드는 파일이다.

### `supabase/migrations/20260612121242_rpc_functions.sql`

앱의 주요 mutation/search/admin 작업을 RPC로 제공한다. space 생성/수정/가입/멤버 관리, direct/group chat 생성, 게시글 pin, onboarding/profile review, 권한 변경, soft delete, 검색, club 관리, notification 생성과 설정 필터링, purge/cleanup 등 상태 전이를 함수 안에 모은다. RLS와 grant를 단순화하고, 클라이언트가 직접 위험한 column을 수정하지 않게 하기 위해 필요하다.

### `supabase/migrations/20260612121246_rls_and_grants.sql`

public domain table들의 RLS policy와 role별 grant를 정의한다. `authenticated`가 볼 수 있는 행과 수정할 수 있는 column을 제한하고, `anon`에는 도메인 접근을 주지 않는다. Supabase Data API로 노출되는 `public` schema에서 실제 보안 경계를 만드는 파일이다.

### `supabase/migrations/20260612121249_storage_buckets.sql`

Storage bucket, storage object RLS, attachment finalize RPC, cleanup queue, maintenance RPC를 만든다. 파일 업로드/다운로드를 object path 은닉에 의존하지 않고 DB 권한과 연결한다. 삭제된 content의 파일 정리와 cached count reconciliation도 이 파일에서 service role 작업으로 묶는다.

## Test / Verification 파일

### `supabase/tests/schema_runtime_check.sql`

migration 적용 후 runtime 계약을 확인하는 SQL이다. Auth trigger, direct chat 재사용, 검색, direct chat 불변성, soft delete/purge, 권한 제한, storage cleanup queue, MIME allowlist, service role grant를 검사한다. `BEGIN`/`ROLLBACK`으로 감싸져 반복 실행해도 상태를 남기지 않는다.

### `supabase/tests/schema_rls_check.sql`

RLS와 identity stamping을 실제 `authenticated` role context에서 확인한다. author/sender id 주입 차단, post/message/read state 자동 stamping, room membership 제거 후 read state 접근 차단을 검사한다. policy가 문서대로 작동하는지 확인하는 방어용 스크립트다.

### `supabase/tests/storage_maintenance_check.ps1`

로컬 Supabase와 `storage-maintenance` Edge Function을 함께 검증하는 PowerShell 스크립트다. cleanup queue에 임시 작업을 넣고 maintenance function이 claim/complete하는지 확인한다. SQL만으로 검증하기 어려운 Storage API 삭제 worker 경계를 테스트하기 위해 필요하다.

## Edge Function 파일

### `supabase/functions/README.md`

Edge Function의 로컬 실행, production deploy, storage maintenance scheduling 절차를 설명한다. 업로드/다운로드는 Supabase Storage SDK와 `storage.objects` RLS로 직접 처리하고, function은 cleanup worker만 남긴다.

### `supabase/functions/storage-maintenance/index.ts`

secret key로만 호출되는 maintenance worker다. cleanup queue를 claim하고 Storage object를 삭제한 뒤 완료/실패 상태를 RPC로 기록하며, 오래된 알림 정리, soft-deleted content purge, cached count reconciliation도 실행한다. 사용자 요청 흐름에서 무거운 정리 작업을 분리하기 위해 필요하다.

### `supabase/functions/storage-maintenance/deno.json`

`storage-maintenance`의 Deno import map이다. service-role 기반 maintenance function의 dependency 버전을 고정한다.

## 읽는 순서 추천

처음 보는 사람은 다음 순서가 가장 이해하기 쉽다.

1. `docs/explaination.md`로 파일 역할을 파악한다.
2. `docs/SCHEMA.md`에서 테이블과 관계의 전체 지도를 본다.
3. `docs/migration.md`에서 migration 적용 순서와 보안/운영 계약을 읽는다.
4. `supabase/migrations/`를 파일명 순서대로 읽는다.
5. `supabase/tests/`로 어떤 계약을 실제로 검증하는지 확인한다.
6. `supabase/functions/`로 Storage 권한 흐름과 운영 maintenance를 확인한다.
