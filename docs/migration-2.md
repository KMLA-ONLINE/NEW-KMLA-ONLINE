# school_community — Supabase 마이그레이션 계획서 2/2

## Improvement Log

- 실행일: 2026-06-11
- STEP 1 — Adversarial review: 미해결 설계 이견 12건 발견, 전부 해결 또는 accepted trade-off로 명시
- STEP 2 — Edge-case stress test: 필수 공격 시나리오 12건에서 누락·불명확 보호 규칙 발견, 전부 acceptance criteria와 대응 결정으로 반영
- STEP 3 — Internal consistency check: 점검 범주 a–g 7개 모두에서 최소 1개 정합성 보완점 발견, 현재 모두 통과
- STEP 4 — Cross-domain coherence: 교차 도메인 충돌 5건 발견, 전부 해결 또는 accepted trade-off로 명시
- 이미 건전했던 부분: 내부 bigserial + 외부 일반 UUID 전략, no-CASCADE 기본 원칙, 1레벨 댓글/메시지 답글 모델, private Storage bucket 기본값은 유지했다.

### Every [REVISED] decision

- [REVISED] migration-1: 모든 hard purge는 service role 전용 관리 작업으로만 수행하고, 대상 부모 행을 잠근 뒤 자식 행·Storage 오브젝트를 명시된 순서로 제거한다. 일반 사용자와 `authenticated` 역할에는 부모/자식 도메인 테이블의 hard DELETE 권한을 부여하지 않는다.
- [REVISED] migration-1: `16_rls_and_grants`는 테이블별로 직접 REST/SDK 호출에 허용할 작업과 컬럼 allowlist를 명시한다. allowlist에 없는 식별자·역할·상태·감사·소프트 삭제 컬럼은 직접 INSERT/UPDATE할 수 없고 검증 RPC만 변경한다.
- [REVISED] migration-1: profile 최초 생성은 Auth 사용자 생성 후 실행되는 신뢰된 trigger 또는 service-role 서버 경로만 수행한다. 클라이언트는 `profiles` INSERT 권한을 받지 않으며 본인 profile의 허용된 온보딩 컬럼만 UPDATE할 수 있다.
- [REVISED] migration-1: `withdraw_profile()`은 owner인 space뿐 아니라 `app_role = 'admin'`인 사용자도 역할 이관 전까지 거부한다. space의 admin/manager 역할은 탈퇴를 막지 않으며, 탈퇴 즉시 승인 상태 검사에서 제외되어 권한을 잃고 owner/admin이 후속 정리할 수 있다.
- [REVISED] migration-1: auth.users 직접 삭제도 profile lifecycle 검증을 우회하지 못하도록 Auth 삭제 trigger가 owner/app admin이면 삭제를 거부하고, 그 외 사용자는 profile 익명화·withdrawn 처리를 수행한 뒤 auth_user_id를 NULL로 만든다. 관리자가 profile status를 accepted 이외로 변경하는 RPC도 owner/app admin 이관 검사를 적용한다.
- [REVISED] migration-1: profile `name`은 trim 후 1~50자다. nullable인 `anonymous_username`은 NULL이 아닌 경우에만 trim 후 1~50자와 정규화 UNIQUE를 강제한다. `description`은 최대 2,000자, `phone_number`는 허용 형식과 최대 길이를 검증한다.
- [REVISED] migration-1: `is_anonymous`는 보안상 익명성을 제공하지 않고 UI에서 실명 대신 전역 pseudonym을 표시하는 기능으로 정의한다. `anonymous_username`은 게시물 간 연결 가능하며, 조회 권한이 있는 사용자는 `author_id`도 볼 수 있다.
- [REVISED] migration-1: `anonymous_username`은 저장 전후 trim된 값이어야 하고 대소문자를 구분하지 않는 정규화 값으로 전역 UNIQUE를 검사한다. 공백 또는 대소문자 차이만으로 기존 pseudonym을 가장할 수 없다.
- [REVISED] migration-1: 익명 post/comment의 표시 이름은 profile의 `anonymous_username`을 우선 사용하고, NULL이면 `익명 {author_id}`를 반환한다. fallback은 기존 내부 `author_id`를 사용하므로 별도 컬럼을 추가하지 않는다.
- [REVISED] migration-1: group 이름 고유성은 활성 group에만 적용하여 `type = 'group' AND deleted_at IS NULL`인 행끼리 전역 고유하게 한다. 삭제된 group을 복구할 때 같은 이름의 활성 group이 이미 있으면 복구를 거부하고 관리자에게 이름 변경 또는 충돌 group 정리를 요구한다.
- [REVISED] migration-1: space 이름은 trim 후 1~100자, description은 최대 5,000자로 제한한다. 활성 group 이름 고유성은 대소문자를 구분하지 않는 정규화 이름으로 검사한다.
- [REVISED] migration-1: spaces의 가입 방식은 `join_policy = auto_join | invite_only`로 관리하고 `create_space()` 호출자가 생성 시 선택한다. `auto_join`은 accepted 사용자의 `join_space()` 호출 즉시 membership을 생성하고, `invite_only`는 owner/admin의 초대·추가 RPC만 membership을 생성한다.
- [REVISED] migration-1: spaces에 `member_count int4 NOT NULL DEFAULT 0` 캐시 컬럼을 추가한다. `space_members` INSERT/DELETE가 현재 멤버 수를 원자적으로 증감하고 운영 reconciliation job이 실제 행 수와 대조한다.
- [REVISED] migration-1: `create_space()` RPC가 space와 최초 owner membership을 한 트랜잭션에서 생성한다. `spaces`와 owner 역할의 직접 INSERT를 금지하며, 생성 완료 시 owner가 정확히 한 명인지 검증한다.
- [REVISED] migration-1: owner 양도 RPC는 대상 space와 현재/신규 owner membership 행을 잠그고, partial unique index 경합을 피하도록 기존 owner 강등과 신규 owner 승격을 하나의 트랜잭션에서 수행한다.
- [REVISED] migration-1: `private.is_space_member()`는 현재 profile이 `accepted`, 비탈퇴 상태이고 membership의 `banned_at IS NULL`, 대상 space의 `deleted_at IS NULL`일 때만 true를 반환한다. owner/admin/manager 검사도 같은 활성 조건을 공유한다.
- [REVISED] migration-1: 게시물 title은 trim 후 1~200자, content는 trim 후 1~50,000자로 제한한다. comments content는 trim 후 1~10,000자로 제한하며 placeholder 문구는 soft-delete RPC만 기록할 수 있다.
- [REVISED] migration-1: posts 직접 INSERT는 `space_id`, `title`, `content`, `is_anonymous`만 클라이언트 입력으로 허용하고 `author_id`는 현재 profile ID와 일치하도록 `WITH CHECK`한다. 대상 space가 활성 상태이고 호출자가 accepted·비차단 멤버일 때만 허용한다.
- [REVISED] migration-1: `is_anonymous = true`인 post/comment INSERT와 posts의 `is_anonymous` false→true UPDATE는 작성자 본인·활성 parent·활성 membership을 검사하고, `anonymous_username`이 NULL이면 `익명 {author_id}` fallback을 사용하므로 허용한다. posts의 true→false UPDATE도 작성자의 실명 표시 전환이므로 `anonymous_username` 존재 여부와 무관하게 허용한다.
- [REVISED] migration-1: posts 직접 UPDATE는 작성자의 `title`, `content`, `is_anonymous`만 허용하며, 작성자가 여전히 accepted·비차단 멤버이고 post/space가 삭제되지 않은 경우에만 허용한다. `space_id`, `space_type`, `author_id`, pin/count/audit 필드는 직접 변경할 수 없다.
- [REVISED] migration-1: feed pagination은 `(created_at DESC, id DESC)` keyset cursor를 사용한다. 페이지 사이에 소프트 삭제된 행은 다음 페이지에서 제외하며, 완전한 snapshot 일관성은 제공하지 않는 accepted trade-off로 문서화한다.
- [REVISED] migration-1: Storage object 삭제가 포함된 attachment cleanup은 migration-2 section 17에서 정한 scheduled Edge Function/service-role worker로 수행한다.
- [REVISED] migration-1: post attachment 업로드는 `post-files/{post_pub_id}/{uploader_auth_uid}/{random_object_id}` 경로만 허용하고, 업로드 후 `finalize_post_attachment()` RPC가 작성자·활성 post·오브젝트 경로·bucket·크기·MIME를 검증한 뒤 attachment 행을 생성한다.
- [REVISED] migration-1: `finalize_post_attachment()` 호출자는 해당 post의 작성자여야 한다. space 관리자 권한만으로 다른 사용자의 post에 attachment를 추가할 수 없으며, 관리자 첨부가 필요해지면 별도 감사 로그가 있는 관리 RPC로 설계한다.
- [REVISED] migration-1: 참조 attachment 행이 없는 Storage 오브젝트는 생성 후 24시간이 지나면 orphan cleanup job이 삭제한다. 7일 soft-delete cleanup은 참조된 오브젝트를 Storage에서 먼저 삭제하고 성공한 항목의 attachment 행만 삭제하며, 실패 항목은 다음 실행에서 재시도한다.
- [REVISED] migration-1: comments 직접 INSERT/UPDATE는 현재 profile을 `author_id`로 강제하고, accepted·비차단 멤버가 활성 post에만 작성하도록 검증한다. `post_id`, `parent_id`, `author_id`, 삭제·감사 필드는 생성 후 직접 변경할 수 없다.
- [REVISED] migration-1: `soft_delete_comment()`은 원문과 검색 노출을 제거하고 placeholder 표시용 고정 문구로 content를 교체한다. 답글이 있는 삭제 댓글은 멤버에게 placeholder 행으로 보이며, 답글이 없는 삭제 댓글은 일반 SELECT에서 숨긴다.
- [REVISED] migration-1: reaction 직접 INSERT/UPDATE/DELETE는 현재 profile의 `user_id`만 허용하고, accepted·비차단 사용자가 활성 parent에만 수행할 수 있다. parent가 소프트 삭제되면 reaction은 조회·변경할 수 없으며 hard purge 작업이 reaction을 먼저 삭제한다.
- [REVISED] migration-1: reaction_count 트리거는 동시 요청에서도 원자적 증감 또는 행 잠금을 사용하고, UPDATE에서 parent 변경은 column-level GRANT로 금지한다. 운영 검증 작업은 캐시값과 실제 활성 reaction 수를 주기적으로 대조한다.
- [REVISED] migration-1: post/comment/message reaction의 직접 UPDATE allowlist는 `reaction_type_id`만 허용한다. parent FK와 `user_id`는 생성 후 변경할 수 없고, 새 reaction type은 `reaction_types`에 존재해야 한다. reaction type 비활성화가 필요해지면 별도 상태 컬럼과 정책을 추가하기 전까지 registry 행을 삭제하지 않는다.
- [REVISED] migration-1: 캐시 카운트는 `posts.reaction_count`만 유지한다. comment reaction count와 message reaction count는 캐시 컬럼·증감 트리거를 만들지 않고 필요 시 각 reaction 테이블에서 집계한다.
- [REVISED] migration-2: `create_direct_chat()`은 정규화된 `(user1_id, user2_id)` unique 충돌을 정상 경합으로 처리한다. 한 트랜잭션에서 생성 INSERT를 시도하고 충돌 시 이미 생성된 pair의 room_id를 다시 조회해 반환하며, 실패한 생성 트랜잭션의 chat_room은 rollback되어 orphan room이 남지 않는다.
- [REVISED] migration-2: chat room, direct pair, membership의 직접 INSERT/UPDATE/DELETE를 금지한다. 단체 방 생성과 멤버 추가/제거도 검증 RPC로만 수행하고, 제거된 사용자는 다음 쿼리부터 messages, attachments, reactions, reads, read_states를 조회할 수 없다.
- [REVISED] migration-2: group room에서는 현재 멤버가 accepted 사용자를 초대할 수 있지만, 일반 멤버는 자기 자신만 나갈 수 있다. 다른 멤버 강제 제거는 group room의 활성 `created_by` 또는 app admin만 수행하며, direct room 멤버는 제거할 수 없다.
- [REVISED] migration-2: direct room은 `name IS NULL`, group room은 trim 후 1~100자인 name을 가져야 한다. message content는 trim 후 1~10,000자로 제한한다.
- [REVISED] migration-2: messages 직접 INSERT는 `room_id`, `parent_id`, `content`만 입력받고 `sender_id`는 현재 profile ID로 강제한다. 호출자는 accepted·비탈퇴 상태의 현재 room 멤버여야 하며, parent가 있으면 활성 상태의 동일 room 최상위 메시지여야 한다.
- [REVISED] migration-2: 메시지는 작성 후 15분이 지나면 내용 수정은 금지하지만 작성자는 언제든 소프트 삭제할 수 있다. 이는 의도된 비대칭이며, 삭제 후 placeholder 노출 여부는 댓글과 달리 메시지 목록에서 행을 숨기는 것으로 확정한다.
- [REVISED] migration-2: 삭제된 message의 활성 답글은 계속 표시할 수 있지만 삭제된 parent 본문은 노출하지 않는다. 클라이언트는 parent 조회가 차단되면 “삭제된 메시지” 참조로 표시하며, 삭제된 parent에 새 답글을 추가할 수 없다.
- [REVISED] migration-2: message reaction은 현재 profile의 `user_id`만 허용하고, accepted 상태의 현재 room 멤버가 활성 message에만 생성·변경·삭제할 수 있다.
- [REVISED] migration-2: `message_reads`는 RLS로 제한한다. 현재 room 멤버만 SELECT할 수 있고, 사용자는 자신의 `user_id`에 대해서만 활성 message의 read 행을 INSERT할 수 있으며 UPDATE/DELETE는 허용하지 않는다.
- [REVISED] migration-2: `chat_room_read_states`는 현재 room 멤버가 자신의 행만 INSERT/UPDATE할 수 있다. room membership이 제거되는 즉시 SELECT/UPDATE가 차단되고, 멤버 제거 RPC는 해당 사용자의 read_state와 선택적 message_reads를 명시적으로 정리한다.
- [REVISED] migration-2: `last_read_message_id`와 `last_read_at`은 동일 room 안에서 앞으로만 이동할 수 있다. 더 오래된 메시지로 되돌리는 직접 UPDATE는 trigger 또는 RPC가 거부한다.
- [REVISED] migration-2: client가 직접 UPDATE할 수 있는 read-state 컬럼은 `last_read_message_id`뿐이다. `user_id`, `room_id`, `last_read_at`은 직접 변경할 수 없고, 검증 trigger가 동일 room의 활성 message와 단조 증가를 확인한 뒤 `last_read_at = now()`를 서버 시각으로 기록한다.
- [REVISED] migration-2: notifications 직접 INSERT는 금지하고 신뢰된 notification RPC 또는 service role만 생성한다. recipient는 자신의 행만 SELECT할 수 있고 `read_at`만 UPDATE할 수 있으며, `recipient_id`, actor와 target FK, title/body는 변경할 수 없다.
- [REVISED] migration-2: notification title은 최대 200자, body는 최대 2,000자로 제한하며 둘 중 하나 이상은 trim 후 비어 있지 않아야 한다.
- [REVISED] migration-2: gongangs에 `valid_from`, `valid_until`과 generated date range를 추가하고 `valid_from <= valid_until`을 강제한다. exclusion constraint는 location, day_of_week, time_range, 유효 date range가 모두 겹치는 예약만 차단한다.
- [REVISED] migration-2: gongangs의 generated stored 컬럼 이름은 `time_range int4range`, `validity_range daterange`로 고정한다. club_apply_rounds에는 `starts_at`, `ends_at` 기반 generated stored `apply_range tstzrange`를 추가하고 exclusion constraint가 이 컬럼을 사용한다.
- [REVISED] migration-2: gongangs 직접 INSERT는 별도 `gongang` permission을 가진 accepted 사용자에게만 허용하고 `owner_id`를 현재 profile로 강제한다. UPDATE/DELETE도 본인 행에만 허용하며 location/time 변경은 exclusion constraint를 다시 통과해야 한다.
- [REVISED] migration-2: exclusion constraint는 owner와 무관하게 동일 location/day/time_range의 전체 중복을 차단한다. SCHEMA.md의 “동일 위치/소유자” 표현은 “동일 위치”로 해석한다.
- [REVISED] migration-2: 이번 스키마에서 song_requests는 append-only 요청 로그로 유지하고 상태 컬럼을 추가하지 않는다. accepted 사용자 중 별도 permission 보유자만 자신의 requester_id로 INSERT할 수 있으며 클라이언트 UPDATE/DELETE는 허용하지 않는다.
- [REVISED] migration-2: song request는 HTTPS URL만 허용하고 최대 2,048자로 제한한다. 사용자별 요청 빈도 제한은 서버/API 계층에서 적용하며 DB는 requester/time 인덱스로 감사를 지원한다.
- [REVISED] migration-2: club_apply_rounds는 `starts_at`, `ends_at`을 NOT NULL로 하고 `starts_at < ends_at` CHECK를 추가한다. 동일 club application 도메인에서 기간이 겹치는 round는 exclusion constraint로 차단하여 동시 INSERT에도 하나만 성공하게 한다.
- [REVISED] migration-2: clubs_apply 직접 INSERT는 accepted 사용자가 자신의 `user_id`로 현재 시각이 round 범위 안에 있을 때만 허용한다. `round_id`, `user_id`, `club_id`는 생성 후 직접 변경할 수 없고, 신청 취소는 round 종료 전 본인 행 DELETE만 허용한다.
- [REVISED] migration-2: posts feed의 `(created_at DESC, id DESC)` keyset cursor와 일치하도록 `idx_posts_active_space_created_at`의 키는 `(space_id, created_at DESC, id DESC) WHERE deleted_at IS NULL`로 생성한다. 위 예시의 id 없는 정의는 이 결정으로 대체한다.
- [REVISED] migration-2: section 16의 활성 상태·멤버십 RLS 조건을 지원하도록 다음 조회 패턴에 맞는 인덱스를 반드시 포함한다.
- [REVISED] migration-2: `deleted_by`, `banned_by`, `pinned_by`의 `ON DELETE SET NULL`과 충돌하지 않도록 상태 CHECK는 감사 주체의 영구 존재를 요구하지 않는다. 각 상태 변경 RPC는 변경 시점에는 actor를 반드시 기록하지만, 이후 actor profile이 삭제되어 FK가 NULL이 되는 것은 허용한다.
- [REVISED] migration-2: Storage bucket upload 제한은 avatar 5 MiB, space image 10 MiB, post file 25 MiB, message file 25 MiB로 설정한다. 허용 MIME은 bucket별 allowlist로 제한하고 finalize RPC에서 다시 검증한다.
- [REVISED] migration-2: 사용자 또는 관리자가 입력하는 나머지 text에도 명시적 상한을 둔다. chat room/club/round 이름은 trim 후 1~100자, space/club description은 최대 5,000자, `ban_reason`과 attachment `alt`는 최대 1,000자, attachment `file_name`과 `content_type`은 최대 255자다. Storage path는 고정 prefix 규칙과 최대 길이를 검증한다.
- [REVISED] migration-2: 아래 감사용 FK 원칙을 `13_constraints` 구현 체크리스트로 사용한다.
- [REVISED] migration-2: direct chat의 정확히 두 멤버 불변식은 transaction 종료 시 실행되는 deferred constraint trigger로 최종 검증한다. RPC 중간 단계에서 잠시 membership이 0~1개인 상태는 허용하되 commit 시 pair의 두 사용자와 정확히 일치하지 않으면 전체 transaction을 rollback한다.
- [REVISED] migration-2: direct chat membership 불변식의 deferred constraint trigger는 `direct_chat_pairs`와 `chat_room_members` 양쪽의 INSERT/UPDATE/DELETE에서 실행되어야 한다. pair 행만 감시해서 membership 단독 변경을 놓치는 구현은 허용하지 않는다.
- [REVISED] migration-2: `trg_update_post_comment_count`는 INSERT, DELETE, `post_id` 변경, `deleted_at`의 NULL↔non-NULL 변경을 처리한다. `trg_update_post_reaction_count`는 INSERT, DELETE, `post_id` 변경을 처리하며 `reaction_type_id`만 바뀌는 UPDATE는 count를 변경하지 않는다.
- [REVISED] migration-2: `trg_update_space_member_count`는 membership INSERT/DELETE에서 parent space 행을 원자적으로 증감한다. role·notification·ban 상태 UPDATE는 membership 행 수가 변하지 않으므로 count를 변경하지 않는다.
- [REVISED] migration-2: cache 증감은 parent post/space 행에 대한 원자적 UPDATE로 수행하고, hard purge·대량 관리 작업 후에는 검증 Job이 실제 child 수로 cache를 재조정할 수 있다.
- [REVISED] migration-2: comment reaction count와 message reaction count는 캐시하지 않는다. section 14에는 이를 위한 count trigger를 추가하지 않고 필요 시 reaction 테이블에서 집계한다.
- [REVISED] migration-2: `trg_mark_message_edited`는 일반 content 수정에만 편집 감사를 기록한다. `soft_delete_message()`가 placeholder를 쓰지 않고 행을 숨기는 결정이므로 soft-delete는 content를 변경하지 않으며 edit 감사와 섞이지 않는다.
- [REVISED] migration-2: `messages`에는 `updated_at` 컬럼이 없고 편집 감사에는 `edited_at`을 사용하므로 `trg_messages_updated_at`은 생성하지 않는다.
- [REVISED] migration-2: unique 충돌 재조회 시 pair 행이 아직 보이지 않는 짧은 경합은 제한된 재시도 또는 row lock으로 처리하고, 임의 횟수 무한 재시도는 금지한다.
- [REVISED] migration-2: space 생성과 chat group membership 변경은 검증 RPC 전용이다.
- [REVISED] migration-2: space와 space membership의 모든 변경은 아래 검증 RPC로만 수행한다.
- [REVISED] migration-2: `set_post_pin()`은 활성 space의 owner/admin/manager만 활성 post의 pin 상태를 변경하고 `pinned_at`, `pinned_by`를 원자적으로 기록·해제한다. pin 관련 컬럼은 직접 UPDATE할 수 없다.
- [REVISED] migration-2: `submit_onboarding()`은 status `none` 또는 `rejected`인 본인 profile만 잠그고 `name`, `type`, `student_number`, `class_no`, `cohort`, `gender`, `phone_number`, `birthday`, `description`, `dorm_room`을 허용된 payload로 검증한다. 학생 필수값을 확인하고 `onboarding_completed_at`을 서버 시각으로 기록한 뒤 `pending`으로 전환한다. `review_profile()`은 app admin만 pending profile을 accepted/rejected로 변경하고 status 감사 필드를 기록하며, 승인 후 신원·기숙사 필드 변경은 별도 관리자 검증 RPC만 허용한다.
- [REVISED] migration-2: `set_anonymous_username()`은 withdrawn이 아닌 본인 profile을 잠그고, non-NULL 값에는 trim·길이·정규화 UNIQUE를 검증한다. NULL 해제를 허용하며 기존 익명 콘텐츠는 즉시 `익명 {author_id}` fallback으로 표시된다. non-NULL 변경은 기존 익명 콘텐츠 표시명에도 소급 적용된다.
- [REVISED] migration-2: accepted profile을 비활성 상태로 전환하는 `change_profile_status()`는 대상이 owner 또는 app admin이면 이관 전까지 거부한다. `change_app_role()`은 대상과 현재 accepted admin 집합을 잠그고, 변경 후 accepted app admin이 최소 한 명 남도록 검증한다. 최초 app admin bootstrap만 배포 시 service role 전용 절차로 수행한다.
- [REVISED] migration-2: 양도 대상은 accepted·비차단 기존 space 멤버여야 하며, 호출자/current owner/new owner membership 행을 잠근 뒤 commit 시 owner가 정확히 한 명인지 검증한다.
- [REVISED] migration-2: soft-delete RPC는 대상 행과 권한 판정에 필요한 membership 행을 잠그고, 활성 parent 여부를 다시 검사한다. space 삭제는 새 post/comment/attachment 쓰기를 즉시 차단하며, post 삭제는 새 comment/reaction/attachment 쓰기를 즉시 차단한다.
- [REVISED] migration-2: soft-delete 권한은 domain별로 고정한다. space는 owner/admin, post/comment는 작성자 또는 해당 space owner/admin, message는 sender 본인만 수행할 수 있다. app admin의 콘텐츠 강제 삭제가 필요해지면 별도 감사 로그가 있는 moderation RPC를 추가한다.
- [REVISED] migration-2: space/post/message soft-delete는 content를 변경하지 않고 삭제 감사 필드만 기록한다. comment soft-delete만 원문 노출을 막기 위해 content를 고정 placeholder로 교체하면서 삭제 감사 필드를 함께 기록한다.
- [REVISED] migration-2: withdrawal 시작 시 profile 행을 잠그고 owner/app admin 역할을 다시 검사한다. 탈퇴 완료 후 기존 JWT가 남아 있어도 모든 RLS helper가 profile status/deleted_at을 매 요청 조회하므로 도메인 접근을 거부한다.
- [REVISED] migration-2: attachment finalize RPC는 호출자, 활성 parent, parent 접근 권한, 허용 bucket/path prefix, Storage object 존재, MIME/크기 제한을 검증한 후 attachment 행을 생성한다. 같은 object 경로 재사용은 unique 제약으로 거부한다.
- [REVISED] migration-2: post attachment는 post 작성자만, message attachment는 message 작성자만 finalize할 수 있다. room membership이나 space 관리 권한만으로 다른 사용자의 parent에 attachment를 연결할 수 없다.
- [REVISED] migration-2: `finalize_avatar()`는 본인 avatar prefix의 실제 object, MIME, 크기를 검증한 뒤에만 `profiles.avatar_url`을 갱신한다. `finalize_space_image()`는 활성 space의 owner/admin만 호출할 수 있고 해당 space prefix의 실제 object를 검증한 뒤 이미지를 연결한다. 두 이미지 URL은 직접 profile/space UPDATE로 변경할 수 없다.
- [REVISED] migration-2: `request_attachment_removal()`은 post/message 작성자와 활성 parent를 다시 검증하고 attachment cleanup queue에 멱등 요청을 기록한다. 호출자는 attachment 행이나 Storage object를 직접 삭제할 수 없고, service-role worker가 object 삭제 성공 후 attachment 행을 삭제한다.
- [REVISED] migration-2: service-role 전용 관리 작업은 아래 순서와 멱등성을 보장한다.
- [REVISED] migration-2: 검색 RPC는 `SECURITY INVOKER`로 실행한다. 직접 변경이 금지된 컬럼을 갱신하거나 여러 RLS 테이블을 원자적으로 변경해야 하는 mutation RPC만 `SECURITY DEFINER SET search_path = ''`를 사용한다.
- [REVISED] migration-2: 모든 외부 RPC는 생성 직후 PUBLIC/anon의 EXECUTE를 revoke한다. 사용자 호출 mutation/search RPC만 `authenticated`에 명시적으로 grant하고 내부 helper·purge·cleanup RPC는 authenticated에 grant하지 않는다. 모든 SECURITY DEFINER 함수는 함수 본문에서 `(SELECT auth.uid())`, accepted/withdrawn 상태와 대상 권한을 다시 검증한다.
- [REVISED] migration-2: `submit_onboarding()`, `set_anonymous_username()`, `withdraw_profile()` 같은 profile lifecycle RPC는 accepted 전용 helper를 사용하지 않고 각 함수가 허용하는 정확한 상태 전이를 검사한다. 그 외 도메인 mutation/search RPC는 accepted·비탈퇴 상태를 요구한다.
- [REVISED] migration-2: 익명 작성자 표시를 반환하는 검색 RPC·서버 조회는 `private.display_author_name(p_author_id, p_is_anonymous)`를 사용한다. `p_is_anonymous = false`이면 profile name, true이면 `anonymous_username`, 값이 NULL이면 `익명 {author_id}`를 반환한다.
- [REVISED] migration-2: search_posts는 `private.can_access_post(post_id)`와 활성 space/post 조건을 적용하고, 댓글 match도 접근 가능한 활성 댓글만 포함한다. 빈 문자열·과도하게 긴 query는 거부하거나 제한한다.
- [REVISED] migration-2: search_messages는 호출 시점의 `private.is_room_member(p_room_id)`를 검사하고, membership 제거 또는 탈퇴 직후에는 결과를 반환하지 않는다.
- [REVISED] migration-2: 기본 권한 회수 이후 새 객체를 만드는 각 migration은 객체 생성 직후 필요한 역할의 GRANT를 같은 migration에서 명시한다. 따라서 `16_rls_and_grants`는 section 16까지 존재하는 객체를 재부여하고, section 17은 새 private queue와 sequence의 service_role 권한을 별도로 재부여한다. 미래 migration도 이 절차를 따른다.
- [REVISED] migration-2: service_role GRANT 검증은 cleanup enqueue/dequeue, hard purge, notification INSERT, sequence 기반 INSERT를 각각 실행해 권한 누락 없이 동작하는지 확인한다. service_role의 RLS bypass는 객체 GRANT 누락을 대체하지 않는다.
- [REVISED] migration-2: spaces의 공개 메타데이터는 table-level SELECT를 부여하지 않고 column-level SELECT만 grant한다. 내부 `id`, `created_by`, 감사·삭제 필드는 비가입 사용자에게 직접 노출하지 않으며, 클라이언트 식별과 상세 이동에는 `pub_id`를 사용한다. RLS는 accepted 사용자가 `deleted_at IS NULL`인 행만 조회하게 한다.
- [REVISED] migration-2: 아래 matrix가 `authenticated` 역할의 직접 REST/SDK 접근 상한이다. 각 허용 작업에는 대응 RLS가 반드시 존재하며, 표시되지 않은 작업은 GRANT하지 않는다.
- [REVISED] migration-2: bigserial sequence 권한은 위 matrix에서 직접 INSERT를 허용한 테이블에만 부여한다. RPC 전용 INSERT 테이블의 sequence는 authenticated에 직접 grant하지 않는다.
- [REVISED] migration-2: 위 column-level GRANT allowlist에 `space_members.notification_setting`의 자기 행 UPDATE를 추가한다. `space_id`, `user_id`, role, ban 감사 필드는 직접 변경할 수 없으며, 나머지 allowlist와 RPC 전용 경계는 그대로 유지한다.
- [REVISED] migration-2: helper 목록을 아래와 같이 확장하고, 정책에서는 재귀 가능성이 있는 membership/parent 테이블을 직접 조회하지 않는다.
- [REVISED] migration-2: 모든 helper는 현재 profile의 `status = 'accepted' AND deleted_at IS NULL`을 공통 전제로 사용한다. space helper는 활성 space와 `banned_at IS NULL`, room helper는 현재 membership 존재를 매 호출 시 검사한다.
- [REVISED] migration-2: helper는 private schema에 두고 Data API에서 직접 호출할 수 없게 한다. 정책 평가에 필요한 최소 schema USAGE/함수 EXECUTE만 부여하며, 외부 RPC처럼 authenticated가 임의 파라미터로 직접 호출할 수 없음을 검증한다.
- [REVISED] migration-2: 승인 후 일반 profile 본인 직접 UPDATE allowlist는 `name`, `gender`, `phone_number`, `birthday`, `description`만 허용한다. `anonymous_username`은 `set_anonymous_username()`, 신원·기숙사·onboarding 필드는 `submit_onboarding()` 또는 관리자 검증 RPC, `avatar_url`은 `finalize_avatar()`만 변경한다. 나머지 식별자·역할·상태·감사 필드는 관리자·탈퇴 lifecycle RPC 전용이다.
- [REVISED] migration-2: 삭제된 space의 membership은 일반 사용자에게 노출하지 않으며, space soft-delete 직후 하위 posts/comments/reactions/attachments의 모든 읽기·쓰기는 helper를 통해 차단한다.
- [REVISED] migration-2: space_members의 직접 UPDATE는 현재 accepted·비차단 멤버가 자기 행의 `notification_setting`만 변경할 때 허용한다. UPDATE 후에도 동일한 `space_id`, `user_id`, role, ban 상태를 유지하도록 column-level GRANT와 `WITH CHECK`를 적용한다.
- [REVISED] migration-2: 비가입 accepted 사용자도 활성 space의 이름, 설명, 이미지, 유형, `member_count`, `join_policy`를 조회할 수 있다. space membership 목록과 posts/comments/attachments 등 하위 데이터는 현재 멤버에게만 노출한다.
- [REVISED] migration-2: posts INSERT/UPDATE 정책은 `WITH CHECK`에서 `author_id = private.current_profile_id()`, 활성 space, accepted·비차단 membership을 검사한다. column-level GRANT는 section 06의 allowlist 외 컬럼을 차단한다.
- [REVISED] migration-2: posts의 `is_anonymous` false→true와 true→false UPDATE를 모두 작성자에게 허용한다. 두 방향 모두 활성 post·space, accepted·비차단 membership, 변경 불가 식별자 유지 조건을 검사하며, false→true에서 `anonymous_username`이 NULL이면 `익명 {author_id}` fallback을 사용한다.
- [REVISED] migration-2: 삭제 댓글 placeholder SELECT는 `private.can_access_post(post_id)`를 사용하고, `deleted_at IS NULL OR EXISTS(active direct reply)` 조건을 적용한다. reply 존재 검사는 SECURITY DEFINER helper로 수행해 comments RLS 재귀를 피한다.
- [REVISED] migration-2: comments UPDATE는 작성자 본인의 활성 댓글에만 허용하고, 활성 post·space 및 accepted·비차단 membership을 `USING`과 `WITH CHECK`에서 다시 검증한다. placeholder와 삭제·관계·감사 필드는 직접 UPDATE할 수 없다.
- [REVISED] migration-2: messages INSERT/UPDATE 정책은 호출 시점의 room membership과 accepted 상태를 다시 검사하고, `sender_id = private.current_profile_id()`를 WITH CHECK한다.
- [REVISED] migration-2: messages UPDATE는 작성자 본인의 활성 message에만, 생성 후 15분 이내에만 허용한다. `room_id`, `parent_id`, `sender_id`, edit/deletion 감사 필드는 직접 변경할 수 없으며 content 변경 trigger가 `is_edited`, `edited_at`을 기록한다.
- [REVISED] migration-2: attachments와 reactions 정책은 각각 `private.can_access_post/comment/message()`를 사용해 parent의 활성 상태와 호출자의 현재 접근 권한을 검사한다. notifications는 recipient 본인 조건만 직접 검사하고, gongangs/song_requests는 `private.has_permission()`, clubs_apply는 `private.is_club_round_open()`을 사용한다.
- [REVISED] migration-2: user_permissions, permissions, reaction_types, club/round 관리 변경은 app admin RPC 전용이며 직접 client UPDATE/DELETE 권한을 부여하지 않는다.
- [REVISED] migration-2: 익명 작성자 표시값은 `anonymous_username`을 우선 반환하고 NULL이면 `익명 {author_id}`를 반환한다. 이 fallback은 post/comment INSERT와 posts의 `is_anonymous` 양방향 UPDATE에서 동일하게 적용한다.
- [REVISED] migration-2: Storage 경로 규칙은 고정 prefix와 식별자를 사용한다.
- [REVISED] migration-2: 사용자가 임의 bucket/path를 attachment 테이블에 기록할 수 없도록 attachment 행 생성은 finalize RPC 전용이다. DB의 `storage_bucket/storage_path` unique 제약과 Storage object 경로 검증을 함께 적용한다.
- [REVISED] migration-2: `authenticated`에는 `storage.objects`의 직접 INSERT/UPDATE/DELETE 정책을 부여하지 않는다. trusted Edge Function/server upload authorization endpoint가 현재 사용자 상태, parent 소유권, 경로, 파일당 제한, 사용자별 quota/rate limit을 검증한 뒤 짧은 수명의 signed upload URL을 발급한다. 직접 REST/SDK Storage 쓰기는 거부하고, SELECT만 아래 bucket별 RLS로 허용한다.
- [REVISED] migration-2: finalize 단계는 클라이언트가 제출한 MIME 문자열만 신뢰하지 않고 server-detected MIME과 허용 확장자/형식을 검증한다. avatar/space image는 안전한 raster image 형식만 허용하고 SVG/HTML은 거부한다. post/message 파일의 실행·스크립트 가능 형식은 거부하거나 강제 attachment 다운로드로 제공하며, 운영 환경에서는 악성 파일 검사 통과 후에만 finalize한다.
- [REVISED] migration-2: avatar SELECT는 accepted 사용자에게 허용한다. avatar write authorization endpoint는 본인 prefix의 새 random object만 허용하고, `finalize_avatar()`가 검증 후 참조를 교체한다.
- [REVISED] migration-2: space image SELECT는 accepted 사용자의 활성 space directory 조회 정책을 상속한다. write authorization endpoint와 `finalize_space_image()`는 활성 space의 owner/admin 및 해당 `space_pub_id` prefix만 허용한다.
- [REVISED] migration-2: post file SELECT는 현재 post 접근 권한을 상속한다. write authorization endpoint와 finalize RPC는 활성 post 작성자 및 작성자 auth uid가 포함된 prefix만 허용하고, 제거는 cleanup queue와 service-role worker만 수행한다.
- [REVISED] migration-2: message file SELECT는 현재 room membership과 활성 message 접근 권한을 상속한다. write authorization endpoint와 finalize RPC는 현재 room 멤버인 활성 message 작성자 및 작성자 auth uid가 포함된 prefix만 허용하고, 제거는 cleanup queue와 service-role worker만 수행한다.
- [REVISED] migration-2: deferred cleanup 작업을 이 목록에서 통합 관리한다.
- [REVISED] migration-2: explicit attachment removal 요청은 Data API에 노출하지 않는 `private.attachment_cleanup_queue`에 기록한다. authenticated는 queue 테이블 권한을 받지 않고 검증 RPC만 호출하며, service-role worker만 dequeue·상태 갱신할 수 있다.
- [REVISED] migration-2: `17_storage_buckets`는 `private.attachment_cleanup_queue`를 생성한다. 컬럼은 `id`, `storage_bucket`, `storage_path`, `requested_by`, `requested_at`, `available_at`, `attempts`, `last_error`, `processed_at`이며 `(storage_bucket, storage_path)`를 unique로 두고 pending dequeue용 `(processed_at, available_at)` 인덱스를 생성한다.
- [REVISED] migration-2: `17_storage_buckets`는 queue 생성 직후 `private.attachment_cleanup_queue`에 `SELECT, INSERT, UPDATE, DELETE`, queue bigserial sequence에 `USAGE, SELECT`를 service_role에 명시적으로 GRANT한다. 같은 객체의 권한은 `PUBLIC`, `anon`, `authenticated`에서 명시적으로 REVOKE한다.
- [REVISED] migration-2: Storage object 삭제가 필요한 cleanup은 scheduled Edge Function/service-role worker로 수행한다. pg_cron은 DB 대상 후보를 enqueue하거나 DB-only 정리에만 사용하며 Storage object를 SQL로 직접 삭제하지 않는다.
- [REVISED] migration-2: 아래 시나리오는 migration 구현과 검증의 필수 acceptance criteria다.
- [REVISED] migration-2: 현재 production-readiness 범위의 open TODO는 없다. 기존 TODO는 모두 확정 결정으로 해결되었다.

### Remaining accepted trade-offs

- 익명 표시는 전역 pseudonym이므로 활동 연결이 가능하고 권한 있는 사용자는 author_id를 볼 수 있다.
- anonymous_username 변경은 기존 익명 post/comment 표시명에도 소급 적용된다.
- anonymous_username이 NULL인 익명 콘텐츠는 내부 author_id를 포함한 `익명 {author_id}`로 표시된다.
- feed pagination은 keyset cursor를 사용하지만 페이지 사이의 완전한 snapshot 일관성은 제공하지 않는다.
- 메시지는 15분 이후 편집할 수 없지만 언제든 소프트 삭제할 수 있다.
- 삭제된 메시지의 답글은 남고 parent 본문은 숨긴다.
- space admin/manager는 역할 이관 없이 탈퇴할 수 있다.
- group chat creator가 비활성화되면 타인 강제 제거는 app admin이 담당한다.
- song_requests는 처리 상태 없는 append-only 로그다.
- 승인 사용자는 profile의 비마스킹 컬럼을 조회할 수 있다.

---

## 마이그레이션 순서 개요

[`migration-1.md`의 07. Reactions 테이블](./migration-1.md#07-reactions-테이블) 적용 후 아래 순서대로 진행한다.

1. [08. tables_chat — chat 관련 테이블](#08-chat-테이블)
2. [09. tables_notifications — notifications](#09-notifications-테이블)
3. [10. tables_utilities — gongangs, song_requests](#10-utilities-테이블)
4. [11. tables_clubs — clubs, club_apply_rounds, clubs_apply](#11-clubs-테이블)
5. [12. indexes — 전체 도메인 인덱스](#12-인덱스)
6. [13. constraints — CHECK, partial unique, exclusion](#13-제약조건)
7. [14. triggers — 검증·동기화·캐시 트리거](#14-트리거)
8. [15. rpc_functions — 원자적·권한 변경 함수](#15-rpc-함수)
9. [16. rls_and_grants — RLS 및 최소 GRANT](#16-rls-정책-및-grant)
10. [17. storage_buckets — Storage 버킷 및 정책](#17-storage-버킷)

---

## 08. Chat 테이블

**파일:** `{타임스탬프}_08_tables_chat.sql`

### chat_rooms

DECIDED: `created_by`는 ON DELETE SET NULL.

### direct_chat_pairs

DECIDED: `room_id`는 ON DELETE RESTRICT.

DECIDED: `user1_id < user2_id` 순서 강제:

```sql
CHECK (user1_id < user2_id)
```

DECIDED: 1:1 채팅 생성은 반드시 RPC `create_direct_chat(p_other_user_id)`로 처리 (`15_rpc_functions`에서 정의). 호출자 ID는 `auth.uid()`에서 유도하며 클라이언트 직접 INSERT를 금지한다.

DECIDED: `direct_chat_pairs.room_id`는 `is_group = false`인 방만 참조할 수 있고, pair의 두 사용자와 `chat_room_members`의 정확히 두 멤버가 일치해야 한다. 생성 RPC와 검증 트리거로 강제한다.

DECIDED: 1:1 방의 `chat_room_members` 직접 INSERT/DELETE는 금지한다. 단체 방만 검증 RPC를 통해 멤버를 추가/제거한다.

[REVISED] DECIDED: `create_direct_chat()`은 정규화된 `(user1_id, user2_id)` unique 충돌을 정상 경합으로 처리한다. 한 트랜잭션에서 생성 INSERT를 시도하고 충돌 시 이미 생성된 pair의 room_id를 다시 조회해 반환하며, 실패한 생성 트랜잭션의 chat_room은 rollback되어 orphan room이 남지 않는다.

[REVISED] DECIDED: chat room, direct pair, membership의 직접 INSERT/UPDATE/DELETE를 금지한다. 단체 방 생성과 멤버 추가/제거도 검증 RPC로만 수행하고, 제거된 사용자는 다음 쿼리부터 messages, attachments, reactions, reads, read_states를 조회할 수 없다.

REASON: 클라이언트가 다른 사용자를 임의 멤버로 추가하거나, 제거된 직후 read state를 계속 읽는 권한 잔존을 막아야 한다.

[REVISED] DECIDED: group room에서는 현재 멤버가 accepted 사용자를 초대할 수 있지만, 일반 멤버는 자기 자신만 나갈 수 있다. 다른 멤버 강제 제거는 group room의 활성 `created_by` 또는 app admin만 수행하며, direct room 멤버는 제거할 수 없다.

[REVISED] DECIDED: direct room은 `name IS NULL`, group room은 trim 후 1~100자인 name을 가져야 한다. message content는 trim 후 1~10,000자로 제한한다.

### messages

DECIDED: `room_id`는 ON DELETE RESTRICT.

DECIDED: `sender_id`는 ON DELETE RESTRICT.

DECIDED: `parent_id`는 ON DELETE RESTRICT (댓글과 동일).

DECIDED: `deleted_by`는 ON DELETE SET NULL.

DECIDED: 메시지 수정 15분 제한은 내용 수정 RPC와 RLS 정책으로 함께 강제:

```sql
USING (
  sender_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  AND created_at > now() - interval '15 minutes'
  AND deleted_at IS NULL
)
```

DECIDED: `search_vector`는 generated stored column (posts와 동일한 방식).

DECIDED: 메시지 답글은 같은 room의 최상위 메시지만 가리킬 수 있다. `trg_validate_message_parent`에서 강제한다.

[REVISED] DECIDED: messages 직접 INSERT는 `room_id`, `parent_id`, `content`만 입력받고 `sender_id`는 현재 profile ID로 강제한다. 호출자는 accepted·비탈퇴 상태의 현재 room 멤버여야 하며, parent가 있으면 활성 상태의 동일 room 최상위 메시지여야 한다.

[REVISED] DECIDED: 메시지는 작성 후 15분이 지나면 내용 수정은 금지하지만 작성자는 언제든 소프트 삭제할 수 있다. 이는 의도된 비대칭이며, 삭제 후 placeholder 노출 여부는 댓글과 달리 메시지 목록에서 행을 숨기는 것으로 확정한다.

[REVISED] DECIDED: 삭제된 message의 활성 답글은 계속 표시할 수 있지만 삭제된 parent 본문은 노출하지 않는다. 클라이언트는 parent 조회가 차단되면 “삭제된 메시지” 참조로 표시하며, 삭제된 parent에 새 답글을 추가할 수 없다.

REASON: 오래된 대화 내용의 변조는 막되 사용자의 삭제 요청은 시간 제한 없이 허용한다.

### message_reactions

DECIDED: `message_id`는 ON DELETE RESTRICT. 메시지 영구 삭제 관리 작업이 리액션을 먼저 삭제한다.

DECIDED: 리액션 변경은 `reaction_type_id` UPDATE로 처리하고, 취소는 본인 행 DELETE로 처리한다.

[REVISED] DECIDED: message reaction은 현재 profile의 `user_id`만 허용하고, accepted 상태의 현재 room 멤버가 활성 message에만 생성·변경·삭제할 수 있다.

### message_reads

DECIDED: 소규모 그룹/1:1 채팅에서 "누가 읽었는지" 표시가 필요한 경우에만 사용.

REASON: 대규모 방에서는 행이 폭발적으로 증가하므로, 읽지 않음 카운트의 source of truth는 `chat_room_read_states`로만 관리.

[REVISED] DECIDED: `message_reads`는 RLS로 제한한다. 현재 room 멤버만 SELECT할 수 있고, 사용자는 자신의 `user_id`에 대해서만 활성 message의 read 행을 INSERT할 수 있으며 UPDATE/DELETE는 허용하지 않는다.

REASON: 애플리케이션 레이어 제한만으로는 직접 REST 호출을 막지 못한다.

### chat_room_read_states

DECIDED: `last_read_message_id`는 같은 `room_id`의 메시지여야 함. 트리거(`14_triggers`)로 강제.

[REVISED] DECIDED: `chat_room_read_states`는 현재 room 멤버가 자신의 행만 INSERT/UPDATE할 수 있다. room membership이 제거되는 즉시 SELECT/UPDATE가 차단되고, 멤버 제거 RPC는 해당 사용자의 read_state와 선택적 message_reads를 명시적으로 정리한다.

[REVISED] DECIDED: `last_read_message_id`와 `last_read_at`은 동일 room 안에서 앞으로만 이동할 수 있다. 더 오래된 메시지로 되돌리는 직접 UPDATE는 trigger 또는 RPC가 거부한다.

[REVISED] DECIDED: client가 직접 UPDATE할 수 있는 read-state 컬럼은 `last_read_message_id`뿐이다. `user_id`, `room_id`, `last_read_at`은 직접 변경할 수 없고, 검증 trigger가 동일 room의 활성 message와 단조 증가를 확인한 뒤 `last_read_at = now()`를 서버 시각으로 기록한다.

---

## 09. Notifications 테이블

**파일:** `{타임스탬프}_09_tables_notifications.sql`

DECIDED: `actor_id`는 ON DELETE SET NULL.

DECIDED: `space_id`는 ON DELETE SET NULL.

DECIDED: `post_id`는 ON DELETE SET NULL.

DECIDED: `comment_id`는 ON DELETE SET NULL.

DECIDED: `message_id`는 ON DELETE SET NULL.

REASON: 원본 콘텐츠가 삭제되어도 알림 기록은 남긴다. 클라이언트에서 NULL 체크 후 "삭제된 콘텐츠" 표시.

DECIDED: `space_type`은 `notifications` INSERT 트리거(`14_triggers`)에서 `spaces.type`으로부터 자동 설정.

DECIDED: 읽은 알림은 생성 후 30일이 지나면 주기적으로 삭제한다.

* 대상 조건: `read_at IS NOT NULL AND created_at < now() - interval '30 days'`
* 읽지 않은 알림은 자동 삭제하지 않는다.

[REVISED] DECIDED: notifications 직접 INSERT는 금지하고 신뢰된 notification RPC 또는 service role만 생성한다. recipient는 자신의 행만 SELECT할 수 있고 `read_at`만 UPDATE할 수 있으며, `recipient_id`, actor와 target FK, title/body는 변경할 수 없다.

[REVISED] DECIDED: notification title은 최대 200자, body는 최대 2,000자로 제한하며 둘 중 하나 이상은 trim 후 비어 있지 않아야 한다.

---

## 10. Utilities 테이블

**파일:** `{타임스탬프}_10_tables_utilities.sql`

### gongangs

DECIDED: 시간 범위 중복 방지는 `int4range` + exclusion constraint로 처리 (`13_constraints`에서 정의):

```sql
ALTER TABLE gongangs ADD COLUMN time_range int4range
  GENERATED ALWAYS AS (int4range(start_minute, end_minute, '[)')) STORED;

ALTER TABLE gongangs ADD COLUMN validity_range daterange
  GENERATED ALWAYS AS (daterange(valid_from, valid_until, '[]')) STORED;

ALTER TABLE gongangs ADD CONSTRAINT gongangs_no_overlap
  EXCLUDE USING gist (
    location WITH =,
    day_of_week WITH =,
    time_range WITH &&,
    validity_range WITH &&
  );
```

REASON: 현재 UNIQUE(location, day_of_week, start_minute, end_minute)는 동일 시작/종료만 막음. 겹치는 시간대(예: 09:00~10:00 vs 09:30~11:00)는 막지 못한다.

[REVISED] DECIDED: gongangs에 `valid_from`, `valid_until`과 generated date range를 추가하고 `valid_from <= valid_until`을 강제한다. exclusion constraint는 location, day_of_week, time_range, 유효 date range가 모두 겹치는 예약만 차단한다.

[REVISED] DECIDED: gongangs의 generated stored 컬럼 이름은 `time_range int4range`, `validity_range daterange`로 고정한다. club_apply_rounds에는 `starts_at`, `ends_at` 기반 generated stored `apply_range tstzrange`를 추가하고 exclusion constraint가 이 컬럼을 사용한다.

REASON: 학기/년 단위 반복 일정이 종료 후에도 영구적으로 충돌하는 것을 막아야 한다.

DECIDED: 추가할 CHECK (`13_constraints`에서 처리):

* `CHECK (day_of_week BETWEEN 0 AND 6)`
* `CHECK (start_minute BETWEEN 0 AND 1439)`
* `CHECK (end_minute BETWEEN 1 AND 1440)`
* `CHECK (start_minute < end_minute)`

DECIDED: `gongang_location` 값은 `floor_b1`, `floor_2`, `floor_4`, `floor_10`을 사용한다.

[REVISED] DECIDED: gongangs 직접 INSERT는 별도 `gongang` permission을 가진 accepted 사용자에게만 허용하고 `owner_id`를 현재 profile로 강제한다. UPDATE/DELETE도 본인 행에만 허용하며 location/time 변경은 exclusion constraint를 다시 통과해야 한다.

[REVISED] DECIDED: exclusion constraint는 owner와 무관하게 동일 location/day/time_range의 전체 중복을 차단한다. SCHEMA.md의 “동일 위치/소유자” 표현은 “동일 위치”로 해석한다.

### song_requests

DECIDED: 현재 설계는 단순 로그 테이블. 처리 상태 없음.

[REVISED] DECIDED: 이번 스키마에서 song_requests는 append-only 요청 로그로 유지하고 상태 컬럼을 추가하지 않는다. accepted 사용자 중 별도 permission 보유자만 자신의 requester_id로 INSERT할 수 있으며 클라이언트 UPDATE/DELETE는 허용하지 않는다.

REASON: 재생 큐 처리 요구사항이 확정되지 않은 상태에서 상태 머신을 추가하면 잘못된 운영 의미를 고정한다.

[REVISED] DECIDED: song request는 HTTPS URL만 허용하고 최대 2,048자로 제한한다. 사용자별 요청 빈도 제한은 서버/API 계층에서 적용하며 DB는 requester/time 인덱스로 감사를 지원한다.

---

## 11. Clubs 테이블

**파일:** `{타임스탬프}_11_tables_clubs.sql`

### club_apply_rounds

[REVISED] DECIDED: club_apply_rounds는 `starts_at`, `ends_at`을 NOT NULL로 하고 `starts_at < ends_at` CHECK를 추가한다. 동일 club application 도메인에서 기간이 겹치는 round는 exclusion constraint로 차단하여 동시 INSERT에도 하나만 성공하게 한다.

REASON: 여러 활성 round를 허용하면 사용자가 어느 round에 신청해야 하는지 불명확하고, 애플리케이션 검사만으로는 동시 생성 경합을 막지 못한다.

### clubs_apply

DECIDED: `(round_id, user_id, club_id)` 복합 unique.

DECIDED: `round_id`는 ON DELETE RESTRICT.

DECIDED: `user_id`는 ON DELETE RESTRICT.

DECIDED: `club_id`는 ON DELETE RESTRICT.

REASON: 동아리가 삭제되면 해당 동아리에 대한 신청 기록도 어떻게 할지 명확하지 않으므로 일단 RESTRICT로 막는다.

[REVISED] DECIDED: clubs_apply 직접 INSERT는 accepted 사용자가 자신의 `user_id`로 현재 시각이 round 범위 안에 있을 때만 허용한다. `round_id`, `user_id`, `club_id`는 생성 후 직접 변경할 수 없고, 신청 취소는 round 종료 전 본인 행 DELETE만 허용한다.

---

## 12. 인덱스

**파일:** `{타임스탬프}_12_indexes.sql`

DBML에 정의된 모든 인덱스를 생성한다. 아래는 DBML에 없는 추가 인덱스:

DECIDED: `tsvector` 인덱스는 모두 명시적으로 `USING gin`으로 생성한다.

DECIDED: `pg_trgm` 기반 한글 검색 인덱스:

```sql
CREATE INDEX idx_posts_title_trgm
  ON posts USING gin (title gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_posts_content_trgm
  ON posts USING gin (content gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_comments_content_trgm
  ON comments USING gin (content gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_messages_content_trgm
  ON messages USING gin (content gin_trgm_ops)
  WHERE deleted_at IS NULL;
```

REASON: `to_tsvector('simple')`은 한글 형태소 분석 불가. `pg_trgm` ILIKE 검색을 병용.

DECIDED: 활성 feed 조회용 partial index:

```sql
CREATE INDEX idx_posts_active_space_created_at
  ON posts (space_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_comments_active_post_created_at
  ON comments (post_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_messages_active_room_created_at
  ON messages (room_id, created_at)
  WHERE deleted_at IS NULL;
```

[REVISED] DECIDED: posts feed의 `(created_at DESC, id DESC)` keyset cursor와 일치하도록 `idx_posts_active_space_created_at`의 키는 `(space_id, created_at DESC, id DESC) WHERE deleted_at IS NULL`로 생성한다. 위 예시의 id 없는 정의는 이 결정으로 대체한다.

[REVISED] DECIDED: section 16의 활성 상태·멤버십 RLS 조건을 지원하도록 다음 조회 패턴에 맞는 인덱스를 반드시 포함한다.

* `profiles(auth_user_id)` unique 및 `profiles(status, deleted_at)`
* `spaces(join_policy, member_count) WHERE deleted_at IS NULL`
* `space_members(user_id, space_id) WHERE banned_at IS NULL`
* `space_members(space_id, user_id, role) WHERE banned_at IS NULL`
* `comments(parent_id) WHERE deleted_at IS NULL` — placeholder의 활성 답글 존재 검사
* `chat_room_members(user_id, room_id)`
* `notifications(recipient_id, created_at DESC) WHERE read_at IS NULL`
* `club_apply_rounds(starts_at, ends_at)`

REASON: partial index predicate는 RLS의 `deleted_at IS NULL`·`banned_at IS NULL` 조건과 일치해야 planner가 정책 평가 중에도 사용할 수 있다.

DECIDED: 모든 FK의 참조하는 쪽 컬럼에 단일 또는 선두 컬럼 복합 인덱스가 존재하는지 확인한다. DBML 인덱스로 충족되지 않는 최소 추가 대상:

* `profiles(status_updated_by)`
* `user_permissions(permission_key)`, `user_permissions(granted_by)`
* `spaces(created_by)`, `spaces(deleted_by)`
* `space_members(banned_by)`
* `posts(pinned_by)`, `posts(deleted_by)`
* `comments(parent_id)`, `comments(deleted_by)`
* reaction 테이블의 `reaction_type_id`
* `chat_rooms(created_by)`
* `messages(deleted_by)`
* `chat_room_read_states(last_read_message_id)`
* notifications의 `actor_id`, `post_id`, `comment_id`, `message_id`
* `club_apply_rounds(created_by)`, `clubs_apply(user_id)`, `clubs_apply(club_id)`

---

## 13. 제약조건

**파일:** `{타임스탬프}_13_constraints.sql`

### 요약

| 테이블              | 종류           | 내용                                                     |
| ------------------- | -------------- | -------------------------------------------------------- |
| profiles            | CHECK          | cohort 범위, student_number 형식, student 타입 필수 필드 |
| profiles            | UNIQUE         | normalized anonymous_username                            |
| spaces              | PARTIAL UNIQUE | normalized name WHERE type = 'group' AND deleted_at IS NULL |
| space_members       | PARTIAL UNIQUE | space_id WHERE role = 'owner'                            |
| spaces              | CHECK          | member_count >= 0                                        |
| posts               | CHECK          | comment_count/reaction_count >= 0, is_pinned 일관성      |
| post_attachments    | CHECK          | size_bytes, sort_order, width/height                     |
| comments            | CHECK          | parent_id <> id                                          |
| direct_chat_pairs   | CHECK          | user1_id < user2_id                                      |
| messages            | CHECK          | parent_id <> id                                          |
| message_attachments | CHECK          | size_bytes, sort_order, width/height                     |
| gongangs            | CHECK          | day_of_week, minute 범위, start < end                    |
| gongangs            | EXCLUSION      | location + day_of_week + time_range + validity range 중복 방지 |
| club_apply_rounds   | CHECK          | starts_at < ends_at                                      |
| club_apply_rounds   | EXCLUSION      | application round time range 중복 방지                   |

DECIDED: `profiles`, `spaces`, `posts`의 `pub_id`는 모두 `NOT NULL UNIQUE DEFAULT gen_random_uuid()`로 생성한다.

[REVISED] DECIDED: `deleted_by`, `banned_by`, `pinned_by`의 `ON DELETE SET NULL`과 충돌하지 않도록 상태 CHECK는 감사 주체의 영구 존재를 요구하지 않는다. 각 상태 변경 RPC는 변경 시점에는 actor를 반드시 기록하지만, 이후 actor profile이 삭제되어 FK가 NULL이 되는 것은 허용한다.

* `spaces/posts/comments/messages`: 활성 행이면 `deleted_by IS NULL`; 삭제 행은 `deleted_at`을 유지하고 `deleted_by`는 nullable
* `spaces`: `member_count >= 0`
* `space_members`: `banned_by IS NOT NULL`이면 `banned_at IS NOT NULL`; ban 해제 시 `banned_at`, `banned_by`를 함께 NULL로 정리
* `posts`: `is_pinned = false`이면 `pinned_at`, `pinned_by`를 함께 NULL로 정리하고, `is_pinned = true`이면 `pinned_at IS NOT NULL`; `pinned_by`는 SET NULL 이후 nullable
* `messages`: `(is_edited = false AND edited_at IS NULL) OR (is_edited = true AND edited_at IS NOT NULL)`
* 나머지 range, attachment bucket, text bound CHECK는 위 기존 목록대로 유지

[REVISED] DECIDED: Storage bucket upload 제한은 avatar 5 MiB, space image 10 MiB, post file 25 MiB, message file 25 MiB로 설정한다. 허용 MIME은 bucket별 allowlist로 제한하고 finalize RPC에서 다시 검증한다.

[REVISED] DECIDED: 사용자 또는 관리자가 입력하는 나머지 text에도 명시적 상한을 둔다. chat room/club/round 이름은 trim 후 1~100자, space/club description은 최대 5,000자, `ban_reason`과 attachment `alt`는 최대 1,000자, attachment `file_name`과 `content_type`은 최대 255자다. Storage path는 고정 prefix 규칙과 최대 길이를 검증한다.

### FK 동작 감사

[REVISED] DECIDED: 아래 감사용 FK 원칙을 `13_constraints` 구현 체크리스트로 사용한다.

* `ON DELETE SET NULL`: 감사 주체나 원본이 사라져도 행을 보존해야 하는 `profiles.status_updated_by`, 각 `created_by/granted_by/banned_by/pinned_by/deleted_by`, notifications의 actor/target FK, `profiles.auth_user_id`, `private.attachment_cleanup_queue.requested_by`
* `ON DELETE RESTRICT`: 작성자·소유자·membership·parent·reaction·attachment·read state·application처럼 삭제 전에 명시적 정리가 필요한 나머지 FK
* hard purge는 RESTRICT 자식을 먼저 제거하며, SET NULL FK는 기록 보존을 위해 유지

---

## 14. 트리거

**파일:** `{타임스탬프}_14_triggers.sql`

### 목록

| 트리거명                             | 테이블                | 시점                                       | 역할                                                                |
| ------------------------------------ | --------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `trg_sync_post_space_type`         | posts                 | BEFORE INSERT, UPDATE OF space_id          | `space_id`→`spaces.type`으로 `space_type`자동 설정           |
| `trg_sync_notification_space_type` | notifications         | BEFORE INSERT                              | `space_id`→`spaces.type`으로 `space_type`자동 설정           |
| `trg_propagate_space_type`         | spaces                | AFTER UPDATE OF type                       | 변경된 type을 해당 space의 posts/notifications에 전파             |
| `trg_validate_comment_parent`      | comments              | BEFORE INSERT, UPDATE                      | 1레벨 중첩 강제, 동일 post 강제                                     |
| `trg_validate_message_parent`      | messages              | BEFORE INSERT, UPDATE                      | 1레벨 중첩 강제, 동일 room 강제                                     |
| `trg_validate_direct_chat`         | direct_chat_pairs     | BEFORE INSERT, UPDATE                      | room이 1:1인지 검증; 멤버 일치는 생성 RPC 종료 시 검증              |
| `trg_update_post_comment_count`    | comments              | AFTER INSERT, UPDATE, DELETE               | OLD/NEW post_id 및 deleted_at을 모두 처리하고 활성 댓글만 집계      |
| `trg_update_post_reaction_count`   | post_reactions        | AFTER INSERT, UPDATE, DELETE               | OLD/NEW post_id를 모두 처리하여 캐시 갱신                           |
| `trg_update_space_member_count`    | space_members         | AFTER INSERT, DELETE                       | 해당 space의 현재 membership 수 캐시 증감                          |
| `trg_validate_chat_read_state`     | chat_room_read_states | BEFORE INSERT, UPDATE                      | `last_read_message_id`가 동일 `room_id`의 메시지인지 검증       |
| `trg_posts_updated_at`             | posts                 | BEFORE UPDATE                              | `updated_at = now()`자동 갱신                                     |
| `trg_comments_updated_at`          | comments              | BEFORE UPDATE                              | `updated_at = now()`자동 갱신                                     |
| `trg_mark_message_edited`          | messages              | BEFORE UPDATE OF content                   | 일반 content 수정 시 `is_edited = true`, `edited_at = now()` 기록 |
| `trg_spaces_updated_at`            | spaces                | BEFORE UPDATE                              | `updated_at = now()`자동 갱신                                     |
| `trg_profiles_updated_at`          | profiles              | BEFORE UPDATE                              | `updated_at = now()`자동 갱신                                     |

DECIDED: 캐시 카운트 트리거는 단순 `count(*)` 재계산 대신 증감 방식으로 구현하되, UPDATE에서 관계 FK 또는 활성 상태가 바뀌면 OLD 부모에서 감소하고 NEW 부모에서 증가하도록 처리한다. 카운트 컬럼에는 음수 방지 CHECK를 유지한다.

[REVISED] DECIDED: direct chat의 정확히 두 멤버 불변식은 transaction 종료 시 실행되는 deferred constraint trigger로 최종 검증한다. RPC 중간 단계에서 잠시 membership이 0~1개인 상태는 허용하되 commit 시 pair의 두 사용자와 정확히 일치하지 않으면 전체 transaction을 rollback한다.

[REVISED] DECIDED: direct chat membership 불변식의 deferred constraint trigger는 `direct_chat_pairs`와 `chat_room_members` 양쪽의 INSERT/UPDATE/DELETE에서 실행되어야 한다. pair 행만 감시해서 membership 단독 변경을 놓치는 구현은 허용하지 않는다.

[REVISED] DECIDED: `trg_update_post_comment_count`는 INSERT, DELETE, `post_id` 변경, `deleted_at`의 NULL↔non-NULL 변경을 처리한다. `trg_update_post_reaction_count`는 INSERT, DELETE, `post_id` 변경을 처리하며 `reaction_type_id`만 바뀌는 UPDATE는 count를 변경하지 않는다.

[REVISED] DECIDED: `trg_update_space_member_count`는 membership INSERT/DELETE에서 parent space 행을 원자적으로 증감한다. role·notification·ban 상태 UPDATE는 membership 행 수가 변하지 않으므로 count를 변경하지 않는다.

[REVISED] DECIDED: cache 증감은 parent post/space 행에 대한 원자적 UPDATE로 수행하고, hard purge·대량 관리 작업 후에는 검증 Job이 실제 child 수로 cache를 재조정할 수 있다.

[REVISED] DECIDED: comment reaction count와 message reaction count는 캐시하지 않는다. section 14에는 이를 위한 count trigger를 추가하지 않고 필요 시 reaction 테이블에서 집계한다.

[REVISED] DECIDED: `trg_mark_message_edited`는 일반 content 수정에만 편집 감사를 기록한다. `soft_delete_message()`가 placeholder를 쓰지 않고 행을 숨기는 결정이므로 soft-delete는 content를 변경하지 않으며 edit 감사와 섞이지 않는다.

[REVISED] DECIDED: `messages`에는 `updated_at` 컬럼이 없고 편집 감사에는 `edited_at`을 사용하므로 `trg_messages_updated_at`은 생성하지 않는다.

---

## 15. RPC 함수

**파일:** `{타임스탬프}_15_rpc_functions.sql`

### create_direct_chat(p_other_user_id bigint) → bigint

역할: 1:1 채팅방 원자적 생성. 이미 존재하면 기존 room_id 반환.

동작:

1. 호출자 profile ID를 `(SELECT auth.uid())`에서 조회하고 승인 상태인지 검증
2. 상대방이 승인된 profile인지, 호출자 본인과 다른지 검증
3. `user1_id = LEAST(caller_id, p_other_user_id)`, `user2_id = GREATEST(...)`로 정규화
4. `direct_chat_pairs`에서 기존 방 조회 → 있으면 반환
5. 없으면 `chat_rooms` INSERT → `direct_chat_pairs` INSERT → `chat_room_members` 2건 INSERT
6. 생성된 방이 `is_group = false`이고 멤버가 정확히 pair의 두 명인지 검증
7. 모두 하나의 트랜잭션

[REVISED] DECIDED: unique 충돌 재조회 시 pair 행이 아직 보이지 않는 짧은 경합은 제한된 재시도 또는 row lock으로 처리하고, 임의 횟수 무한 재시도는 금지한다.

### create_space / create_group_chat / add_group_member / remove_group_member

[REVISED] DECIDED: space 생성과 chat group membership 변경은 검증 RPC 전용이다.

* `create_space`: 호출자 accepted 상태, community/group 생성 권한, `join_policy = auto_join | invite_only` 입력을 검증하고 space와 owner membership을 원자적 생성
* `create_group_chat`: accepted 호출자를 `created_by`와 최초 멤버로 기록하고 group name 제약을 검증
* `add_group_member`: 호출자와 대상의 활성 상태, group room 여부, 기존 membership 중복 검증
* `remove_group_member`: group room 여부를 검증하고, 자기 탈퇴 또는 활성 creator/app admin의 강제 제거만 허용한 뒤 membership과 해당 사용자의 read_state를 같은 transaction에서 정리

### update_space / join_space / add_space_member / leave_space / set_space_member_role / set_space_member_ban

[REVISED] DECIDED: space와 space membership의 모든 변경은 아래 검증 RPC로만 수행한다.

* `update_space`: owner/admin만 name, description, join_policy를 변경하며, type 변경은 app admin 전용이고 space_type 전파 trigger를 실행
* `join_space`: accepted 사용자의 `auto_join` space 자기 가입만 허용; `invite_only`, 삭제 space, 기존 또는 차단 membership은 거부
* `add_space_member`: owner/admin이 accepted 사용자를 추가하며 삭제 space와 중복 membership을 거부
* `leave_space`: 본인 membership만 제거할 수 있고 owner는 transfer 전까지 거부
* `set_space_member_role`: owner만 non-owner의 admin/manager/member 역할을 변경하며 owner 변경은 `transfer_space_owner()`만 사용
* `set_space_member_ban`: owner/admin만 하위 역할 멤버를 차단·해제할 수 있고 자기 자신, owner, 동급·상위 역할은 변경할 수 없음

### set_post_pin

[REVISED] DECIDED: `set_post_pin()`은 활성 space의 owner/admin/manager만 활성 post의 pin 상태를 변경하고 `pinned_at`, `pinned_by`를 원자적으로 기록·해제한다. pin 관련 컬럼은 직접 UPDATE할 수 없다.

### submit_onboarding / review_profile

[REVISED] DECIDED: `submit_onboarding()`은 status `none` 또는 `rejected`인 본인 profile만 잠그고 `name`, `type`, `student_number`, `class_no`, `cohort`, `gender`, `phone_number`, `birthday`, `description`, `dorm_room`을 허용된 payload로 검증한다. 학생 필수값을 확인하고 `onboarding_completed_at`을 서버 시각으로 기록한 뒤 `pending`으로 전환한다. `review_profile()`은 app admin만 pending profile을 accepted/rejected로 변경하고 status 감사 필드를 기록하며, 승인 후 신원·기숙사 필드 변경은 별도 관리자 검증 RPC만 허용한다.

### set_anonymous_username

[REVISED] DECIDED: `set_anonymous_username()`은 withdrawn이 아닌 본인 profile을 잠그고, non-NULL 값에는 trim·길이·정규화 UNIQUE를 검증한다. NULL 해제를 허용하며 기존 익명 콘텐츠는 즉시 `익명 {author_id}` fallback으로 표시된다. non-NULL 변경은 기존 익명 콘텐츠 표시명에도 소급 적용된다.

### change_profile_status / change_app_role

[REVISED] DECIDED: accepted profile을 비활성 상태로 전환하는 `change_profile_status()`는 대상이 owner 또는 app admin이면 이관 전까지 거부한다. `change_app_role()`은 대상과 현재 accepted admin 집합을 잠그고, 변경 후 accepted app admin이 최소 한 명 남도록 검증한다. 최초 app admin bootstrap만 배포 시 service role 전용 절차로 수행한다.

### transfer_space_owner(p_space_id bigint, p_new_owner_id bigint) → void

역할: space owner 양도.

동작:

1. 현재 owner 조회 (호출자가 owner인지 검증)
2. 기존 owner → admin으로 UPDATE
3. 새 owner → owner로 UPDATE
4. 하나의 트랜잭션

[REVISED] DECIDED: 양도 대상은 accepted·비차단 기존 space 멤버여야 하며, 호출자/current owner/new owner membership 행을 잠근 뒤 commit 시 owner가 정확히 한 명인지 검증한다.

### soft_delete_space / soft_delete_post / soft_delete_comment / soft_delete_message

역할: 직접 DELETE 없이 공간과 콘텐츠를 소프트 삭제한다.

공통 동작:

1. 호출자 profile ID와 승인 상태를 검증
2. 이미 삭제된 행이면 idempotent하게 종료
3. 댓글은 cache trigger가 활성 댓글 수를 감소

[REVISED] DECIDED: soft-delete RPC는 대상 행과 권한 판정에 필요한 membership 행을 잠그고, 활성 parent 여부를 다시 검사한다. space 삭제는 새 post/comment/attachment 쓰기를 즉시 차단하며, post 삭제는 새 comment/reaction/attachment 쓰기를 즉시 차단한다.

[REVISED] DECIDED: soft-delete 권한은 domain별로 고정한다. space는 owner/admin, post/comment는 작성자 또는 해당 space owner/admin, message는 sender 본인만 수행할 수 있다. app admin의 콘텐츠 강제 삭제가 필요해지면 별도 감사 로그가 있는 moderation RPC를 추가한다.

[REVISED] DECIDED: space/post/message soft-delete는 content를 변경하지 않고 삭제 감사 필드만 기록한다. comment soft-delete만 원문 노출을 막기 위해 content를 고정 placeholder로 교체하면서 삭제 감사 필드를 함께 기록한다.

### withdraw_profile() → void

역할: 현재 사용자의 profile과 콘텐츠 참조는 보존하면서 탈퇴 처리한다.

동작:

1. 현재 profile을 잠그고 호출자 본인인지 검증
2. owner인 space가 있으면 양도 전까지 거부
3. 개인정보 및 식별 가능한 profile 필드를 익명화
4. `status = 'withdrawn'`, `deleted_at = now()` 기록
5. Auth 사용자 삭제는 신뢰된 서버 경로에서 별도 수행

[REVISED] DECIDED: withdrawal 시작 시 profile 행을 잠그고 owner/app admin 역할을 다시 검사한다. 탈퇴 완료 후 기존 JWT가 남아 있어도 모든 RLS helper가 profile status/deleted_at을 매 요청 조회하므로 도메인 접근을 거부한다.

### finalize_post_attachment / finalize_message_attachment

[REVISED] DECIDED: attachment finalize RPC는 호출자, 활성 parent, parent 접근 권한, 허용 bucket/path prefix, Storage object 존재, MIME/크기 제한을 검증한 후 attachment 행을 생성한다. 같은 object 경로 재사용은 unique 제약으로 거부한다.

[REVISED] DECIDED: post attachment는 post 작성자만, message attachment는 message 작성자만 finalize할 수 있다. room membership이나 space 관리 권한만으로 다른 사용자의 parent에 attachment를 연결할 수 없다.

### finalize_avatar / finalize_space_image

[REVISED] DECIDED: `finalize_avatar()`는 본인 avatar prefix의 실제 object, MIME, 크기를 검증한 뒤에만 `profiles.avatar_url`을 갱신한다. `finalize_space_image()`는 활성 space의 owner/admin만 호출할 수 있고 해당 space prefix의 실제 object를 검증한 뒤 이미지를 연결한다. 두 이미지 URL은 직접 profile/space UPDATE로 변경할 수 없다.

### request_attachment_removal

[REVISED] DECIDED: `request_attachment_removal()`은 post/message 작성자와 활성 parent를 다시 검증하고 attachment cleanup queue에 멱등 요청을 기록한다. 호출자는 attachment 행이나 Storage object를 직접 삭제할 수 없고, service-role worker가 object 삭제 성공 후 attachment 행을 삭제한다.

### purge_deleted_content / cleanup_orphan_storage / cleanup_notifications

[REVISED] DECIDED: service-role 전용 관리 작업은 아래 순서와 멱등성을 보장한다.

* `purge_deleted_content`: retention이 지난 parent를 잠그고 reactions/reads/attachments 등 RESTRICT 자식을 먼저 정리한 후 parent를 hard delete
* `cleanup_orphan_storage`: 참조 DB 행이 없고 생성 후 24시간이 지난 허용 bucket object 삭제
* `cleanup_notifications`: 읽었고 생성 후 30일이 지난 notification 삭제
* Storage 삭제 성공 여부를 기록하고 실패 항목은 다음 실행에서 재시도

### RPC 보안 속성

확정 전에도 모든 함수 생성 직후 `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated, service_role`를 먼저 적용하고, 검토가 끝난 함수만 필요한 역할에 명시적으로 `GRANT EXECUTE`한다.

[REVISED] DECIDED: 검색 RPC는 `SECURITY INVOKER`로 실행한다. 직접 변경이 금지된 컬럼을 갱신하거나 여러 RLS 테이블을 원자적으로 변경해야 하는 mutation RPC만 `SECURITY DEFINER SET search_path = ''`를 사용한다.

[REVISED] DECIDED: 모든 외부 RPC는 생성 직후 PUBLIC/anon의 EXECUTE를 revoke한다. 사용자 호출 mutation/search RPC만 `authenticated`에 명시적으로 grant하고 내부 helper·purge·cleanup RPC는 authenticated에 grant하지 않는다. 모든 SECURITY DEFINER 함수는 함수 본문에서 `(SELECT auth.uid())`, accepted/withdrawn 상태와 대상 권한을 다시 검증한다.

REASON: SECURITY DEFINER는 RLS를 우회하므로 단순 권한 오류 해결용으로 사용하면 안 되며, 명시적 호출자 검증과 EXECUTE allowlist가 필요하다.

[REVISED] DECIDED: `submit_onboarding()`, `set_anonymous_username()`, `withdraw_profile()` 같은 profile lifecycle RPC는 accepted 전용 helper를 사용하지 않고 각 함수가 허용하는 정확한 상태 전이를 검사한다. 그 외 도메인 mutation/search RPC는 accepted·비탈퇴 상태를 요구한다.

[REVISED] DECIDED: 익명 작성자 표시를 반환하는 검색 RPC·서버 조회는 `private.display_author_name(p_author_id, p_is_anonymous)`를 사용한다. `p_is_anonymous = false`이면 profile name, true이면 `anonymous_username`, 값이 NULL이면 `익명 {author_id}`를 반환한다.

### search_posts(p_query text, p_space_type space_type, p_space_id bigint) → table

역할: 게시물 + 댓글 통합 검색.

동작:

1. `posts.title ILIKE '%query%' OR posts.content ILIKE '%query%'` (pg_trgm 활용)
2. 매칭 posts에 딸린 `comments.content ILIKE '%query%'` 도 포함
3. `deleted_at IS NULL` 필터
4. `space_type`, `space_id` 파라미터로 범위 제한 (NULL이면 전체)

[REVISED] DECIDED: search_posts는 `private.can_access_post(post_id)`와 활성 space/post 조건을 적용하고, 댓글 match도 접근 가능한 활성 댓글만 포함한다. 빈 문자열·과도하게 긴 query는 거부하거나 제한한다.

반환 컬럼: `post_id`, `title`, `content_snippet`, `author_name`, `space_name`, `created_at`, `match_type` (post/comment)

### search_messages(p_query text, p_room_id bigint) → table

역할: 채팅방 내 메시지 검색.

동작: `content ILIKE '%query%'` AND `deleted_at IS NULL` AND `room_id = p_room_id`

[REVISED] DECIDED: search_messages는 호출 시점의 `private.is_room_member(p_room_id)`를 검사하고, membership 제거 또는 탈퇴 직후에는 결과를 반환하지 않는다.

---

## 16. RLS 정책 및 GRANT

**파일:** `{타임스탬프}_16_rls_and_grants.sql`

모든 public 테이블에 RLS를 활성화한다. 정책은 "기본 거부, 최소 GRANT, 명시적 허용" 원칙.

### 공통 원칙

* `anon`에는 앱 도메인 테이블 권한을 부여하지 않는다.
* `authenticated`에는 실제 클라이언트가 직접 수행해야 하는 작업만 테이블별로 `GRANT SELECT/INSERT/UPDATE/DELETE`한다.
* posts/comments/messages 같은 보존 콘텐츠에는 직접 DELETE를 부여하지 않는다. 소프트 삭제 및 영구 정리는 RPC/관리 작업으로만 수행한다.
* reaction 취소처럼 행 자체가 상태인 단순 관계 테이블만 본인 행 DELETE를 명시적으로 허용할 수 있다.
* 민감 상태 변경, 역할 변경, owner 양도, 탈퇴, 소프트 삭제는 RPC 전용이다.
* 일반 작성 내용처럼 직접 UPDATE를 허용하는 컬럼은 column-level GRANT를 사용한다. 예: `GRANT UPDATE (title, content) ON posts TO authenticated`.
* bigserial 테이블에 직접 INSERT를 허용할 때만 해당 sequence에 `GRANT USAGE, SELECT`를 명시한다.
* 모든 정책은 `TO authenticated`를 명시하고 승인 사용자 조건과 소유권/멤버십 조건을 함께 검사한다.
* UPDATE 정책은 필요한 SELECT 정책과 `USING`, `WITH CHECK`를 모두 정의한다.
* INSERT/UPDATE의 `author_id`, `user_id`, `sender_id` 등 소유자 컬럼은 현재 profile ID와 일치하도록 `WITH CHECK`한다.
* `(SELECT auth.uid())` 패턴을 사용하고 RLS에서 조회하는 FK/상태 컬럼에 인덱스를 둔다.
* `service_role`은 서버 전용이며 브라우저에 노출하지 않는다. 기본 권한 회수 후 서버 작업에 필요한 객체 권한도 명시적으로 다시 부여한다.

### service_role 명시적 GRANT

* `GRANT USAGE ON SCHEMA public, private TO service_role`
* section 16 실행 시점에 존재하는 모든 public 도메인 테이블에 `SELECT, INSERT, UPDATE, DELETE`
* section 16 실행 시점에 존재하는 public 도메인 bigserial sequence에 `USAGE, SELECT`
* section 16 실행 시점에 존재하는 service-role 전용 purge/cleanup/notification 함수에만 `EXECUTE`
* Storage object 작업은 브라우저가 아닌 service key 기반 Storage API worker에서 수행
* `anon`, `authenticated`에는 private queue와 service-role 전용 함수 권한을 부여하지 않음

[REVISED] DECIDED: 기본 권한 회수 이후 새 객체를 만드는 각 migration은 객체 생성 직후 필요한 역할의 GRANT를 같은 migration에서 명시한다. 따라서 `16_rls_and_grants`는 section 16까지 존재하는 객체를 재부여하고, section 17은 새 private queue와 sequence의 service_role 권한을 별도로 재부여한다. 미래 migration도 이 절차를 따른다.

[REVISED] DECIDED: service_role GRANT 검증은 cleanup enqueue/dequeue, hard purge, notification INSERT, sequence 기반 INSERT를 각각 실행해 권한 누락 없이 동작하는지 확인한다. service_role의 RLS bypass는 객체 GRANT 누락을 대체하지 않는다.

[REVISED] DECIDED: spaces의 공개 메타데이터는 table-level SELECT를 부여하지 않고 column-level SELECT만 grant한다. 내부 `id`, `created_by`, 감사·삭제 필드는 비가입 사용자에게 직접 노출하지 않으며, 클라이언트 식별과 상세 이동에는 `pub_id`를 사용한다. RLS는 accepted 사용자가 `deleted_at IS NULL`인 행만 조회하게 한다.

### Direct Data API GRANT matrix

[REVISED] DECIDED: 아래 matrix가 `authenticated` 역할의 직접 REST/SDK 접근 상한이다. 각 허용 작업에는 대응 RLS가 반드시 존재하며, 표시되지 않은 작업은 GRANT하지 않는다.

| 테이블 | 직접 허용 작업 | 제한 |
| --- | --- | --- |
| profiles | SELECT, column UPDATE | 본인 UPDATE allowlist; INSERT/DELETE 없음 |
| permissions, user_permissions | SELECT | 변경은 admin RPC |
| spaces | column SELECT | accepted 사용자는 가입 여부와 무관하게 활성 space의 `pub_id`, `type`, `name`, `description`, `image_url`, `join_policy`, `member_count` 조회; 생성·수정·삭제는 RPC |
| space_members | SELECT, column UPDATE | 자기 `notification_setting`만 직접 UPDATE; 멤버·역할·차단 변경은 RPC |
| posts | SELECT, INSERT, column UPDATE | 삭제/pin은 RPC |
| post_attachments | SELECT | 생성은 finalize RPC, 삭제는 cleanup/RPC |
| comments | SELECT, INSERT, column UPDATE | 삭제는 RPC |
| reaction_types | SELECT | 변경은 admin RPC |
| post_reactions, comment_reactions | SELECT, INSERT, column UPDATE, DELETE | 현재 사용자·활성 parent만 |
| chat_rooms, direct_chat_pairs, chat_room_members | SELECT | 생성·membership 변경은 RPC |
| messages | SELECT, INSERT, column UPDATE | 삭제는 RPC |
| message_attachments | SELECT | 생성은 finalize RPC, 삭제는 cleanup/RPC |
| message_reactions | SELECT, INSERT, column UPDATE, DELETE | 현재 사용자·활성 message만 |
| message_reads | SELECT, INSERT | 자신의 read 행만 |
| chat_room_read_states | SELECT, INSERT, column UPDATE | 자신의 현재 room 상태만 |
| notifications | SELECT, column UPDATE | `read_at`만 UPDATE |
| gongangs | SELECT, INSERT, column UPDATE, DELETE | permission 보유 본인 행만 |
| song_requests | SELECT, INSERT | permission 보유 본인 requester_id; append-only |
| clubs, club_apply_rounds | SELECT | 변경은 admin RPC |
| clubs_apply | SELECT, INSERT, DELETE | 열린 round의 본인 신청만 |

[REVISED] DECIDED: bigserial sequence 권한은 위 matrix에서 직접 INSERT를 허용한 테이블에만 부여한다. RPC 전용 INSERT 테이블의 sequence는 authenticated에 직접 grant하지 않는다.

[REVISED] DECIDED: 위 column-level GRANT allowlist에 `space_members.notification_setting`의 자기 행 UPDATE를 추가한다. `space_id`, `user_id`, role, ban 감사 필드는 직접 변경할 수 없으며, 나머지 allowlist와 RPC 전용 경계는 그대로 유지한다.

DECIDED: 승인 사용자와 멤버십 검사는 RLS 재귀를 피하기 위해 비노출 `private` schema의 helper 함수로 처리한다.

* `private.current_profile_id()`
* `private.is_accepted_user()`
* `private.is_app_admin()`
* `private.is_space_member(p_space_id, p_allowed_roles default null)`
* `private.is_room_member(p_room_id)`

[REVISED] DECIDED: helper 목록을 아래와 같이 확장하고, 정책에서는 재귀 가능성이 있는 membership/parent 테이블을 직접 조회하지 않는다.

* `private.can_manage_space(p_space_id, p_roles)`
* `private.can_access_post(p_post_id)`
* `private.can_access_comment(p_comment_id)`
* `private.can_access_message(p_message_id)`
* `private.has_permission(p_permission_key)`
* `private.is_club_round_open(p_round_id)`
* `private.display_author_name(p_author_id, p_is_anonymous)`

[REVISED] DECIDED: 모든 helper는 현재 profile의 `status = 'accepted' AND deleted_at IS NULL`을 공통 전제로 사용한다. space helper는 활성 space와 `banned_at IS NULL`, room helper는 현재 membership 존재를 매 호출 시 검사한다.

Helper는 필요한 경우에만 `SECURITY DEFINER SET search_path = ''`를 사용하고, 함수 내부에서 `(SELECT auth.uid())`를 반드시 검증한다. `private` schema는 Data API exposed schema에 포함하지 않는다.

[REVISED] DECIDED: helper는 private schema에 두고 Data API에서 직접 호출할 수 없게 한다. 정책 평가에 필요한 최소 schema USAGE/함수 EXECUTE만 부여하며, 외부 RPC처럼 authenticated가 임의 파라미터로 직접 호출할 수 없음을 검증한다.

### profiles

| 정책 | 대상 | 조건 |
| --- | --- | --- |
| SELECT 자신 | 본인 | `auth_user_id = (SELECT auth.uid())` |
| SELECT 타인 | 승인된 사용자 | `status = 'accepted'`인 행 조회 허용 |
| UPDATE 자신 | 본인 | column-level GRANT로 허용된 일반 프로필 필드만 |
| 상태/역할 변경 | admin role | 직접 UPDATE 금지. 관리자 RPC만 허용 |

DECIDED: 프로필 컬럼 마스킹은 하지 않는다. 승인 사용자가 조회 가능한 profile 컬럼은 그대로 노출하며, 실제 비공개가 필요한 정보가 생기면 별도 private 테이블로 분리한다.

[REVISED] DECIDED: 승인 후 일반 profile 본인 직접 UPDATE allowlist는 `name`, `gender`, `phone_number`, `birthday`, `description`만 허용한다. `anonymous_username`은 `set_anonymous_username()`, 신원·기숙사·onboarding 필드는 `submit_onboarding()` 또는 관리자 검증 RPC, `avatar_url`은 `finalize_avatar()`만 변경한다. 나머지 식별자·역할·상태·감사 필드는 관리자·탈퇴 lifecycle RPC 전용이다.

REASON: 승인 사용자가 직접 신원 속성을 바꾸거나 존재하지 않는 임의 avatar URL을 기록하면 권한·표시 신뢰성이 무너진다.

### spaces / space_members

| 정책 | 대상 | 조건 |
| --- | --- | --- |
| SELECT space directory | 승인된 사용자 전체 | `deleted_at IS NULL`; column-level SELECT로 공개 메타데이터만 반환 |
| INSERT space | 승인된 사용자 | 직접 INSERT 대신 `create_space` RPC |
| SELECT space_members | 해당 space 멤버 | `private.is_space_member(space_id)` |
| 멤버/차단/역할 변경 | owner/admin | 직접 변경 대신 검증 RPC |
| 소프트 삭제 | owner/admin | `soft_delete_space` RPC만 허용 |

`space_members` 정책은 해당 테이블을 다시 직접 조회하지 않고 `private.is_space_member()`를 사용하여 RLS 재귀를 방지한다.

[REVISED] DECIDED: 삭제된 space의 membership은 일반 사용자에게 노출하지 않으며, space soft-delete 직후 하위 posts/comments/reactions/attachments의 모든 읽기·쓰기는 helper를 통해 차단한다.

[REVISED] DECIDED: space_members의 직접 UPDATE는 현재 accepted·비차단 멤버가 자기 행의 `notification_setting`만 변경할 때 허용한다. UPDATE 후에도 동일한 `space_id`, `user_id`, role, ban 상태를 유지하도록 column-level GRANT와 `WITH CHECK`를 적용한다.

[REVISED] DECIDED: 비가입 accepted 사용자도 활성 space의 이름, 설명, 이미지, 유형, `member_count`, `join_policy`를 조회할 수 있다. space membership 목록과 posts/comments/attachments 등 하위 데이터는 현재 멤버에게만 노출한다.

### posts

| 정책 | 대상 | 조건 |
| --- | --- | --- |
| SELECT | 승인된 해당 space 멤버 | `deleted_at IS NULL` |
| INSERT | 승인된 해당 space 멤버 | `banned_at IS NULL` |
| UPDATE 내용 | 작성자 | column-level GRANT로 `title`,`content`만 허용 |
| UPDATE 핀 | owner/admin/manager | 직접 UPDATE 금지. 핀 RPC만 허용 |
| 소프트 삭제 | 작성자 또는 owner/admin | `soft_delete_post` RPC만 허용 |

[REVISED] DECIDED: posts INSERT/UPDATE 정책은 `WITH CHECK`에서 `author_id = private.current_profile_id()`, 활성 space, accepted·비차단 membership을 검사한다. column-level GRANT는 section 06의 allowlist 외 컬럼을 차단한다.

[REVISED] DECIDED: posts의 `is_anonymous` false→true와 true→false UPDATE를 모두 작성자에게 허용한다. 두 방향 모두 활성 post·space, accepted·비차단 membership, 변경 불가 식별자 유지 조건을 검사하며, false→true에서 `anonymous_username`이 NULL이면 `익명 {author_id}` fallback을 사용한다.

### comments

| 정책 | 대상 | 조건 |
| --- | --- | --- |
| SELECT | 승인된 해당 space 멤버 | 활성 댓글 또는 답글이 있는 소프트 삭제 placeholder |
| INSERT | 승인된 해당 space 멤버 | `banned_at IS NULL` |
| UPDATE | 작성자 | column-level GRANT로 `content`만 허용 |
| 소프트 삭제 | 작성자 또는 owner/admin | `soft_delete_comment` RPC만 허용 |

[REVISED] DECIDED: 삭제 댓글 placeholder SELECT는 `private.can_access_post(post_id)`를 사용하고, `deleted_at IS NULL OR EXISTS(active direct reply)` 조건을 적용한다. reply 존재 검사는 SECURITY DEFINER helper로 수행해 comments RLS 재귀를 피한다.

[REVISED] DECIDED: comments UPDATE는 작성자 본인의 활성 댓글에만 허용하고, 활성 post·space 및 accepted·비차단 membership을 `USING`과 `WITH CHECK`에서 다시 검증한다. placeholder와 삭제·관계·감사 필드는 직접 UPDATE할 수 없다.

### messages

| 정책 | 대상 | 조건 |
| --- | --- | --- |
| SELECT | 승인된 해당 room 멤버 | `deleted_at IS NULL` |
| INSERT | 승인된 해당 room 멤버 | sender_id는 현재 profile로 강제 |
| UPDATE | 작성자 | column-level GRANT로 `content`만 허용, 15분 제한 |
| 소프트 삭제 | 작성자 | `soft_delete_message` RPC만 허용 |

[REVISED] DECIDED: messages INSERT/UPDATE 정책은 호출 시점의 room membership과 accepted 상태를 다시 검사하고, `sender_id = private.current_profile_id()`를 WITH CHECK한다.

[REVISED] DECIDED: messages UPDATE는 작성자 본인의 활성 message에만, 생성 후 15분 이내에만 허용한다. `room_id`, `parent_id`, `sender_id`, edit/deletion 감사 필드는 직접 변경할 수 없으며 content 변경 trigger가 `is_edited`, `edited_at`을 기록한다.

### 나머지 public 테이블 정책 범위

| 테이블군 | 최소 정책 |
| --- | --- |
| permissions | 승인 사용자는 SELECT, 변경은 app admin RPC |
| user_permissions | 본인은 SELECT, 변경은 app admin RPC |
| attachments | 부모 post/message 접근 권한을 상속, 생성·제거는 parent 작성자의 finalize/removal RPC만 허용 |
| reactions | 부모 콘텐츠 접근 가능 사용자만 SELECT/INSERT/UPDATE, 본인 행만 DELETE |
| chat_rooms/direct_chat_pairs/chat_room_members | room 멤버만 SELECT, 생성/멤버 변경은 검증 RPC |
| message_reads/chat_room_read_states | room 멤버가 자신의 상태만 INSERT/UPDATE, room 멤버만 SELECT |
| notifications | recipient 본인만 SELECT/UPDATE, INSERT는 신뢰된 RPC/서버만 |
| gongangs/song_requests | 승인 상태 및 별도 user_permissions 권한 검사 |
| clubs/club_apply_rounds/clubs_apply | 승인 사용자는 공개 데이터 SELECT, 신청은 본인만, 관리 변경은 app admin |

[REVISED] DECIDED: attachments와 reactions 정책은 각각 `private.can_access_post/comment/message()`를 사용해 parent의 활성 상태와 호출자의 현재 접근 권한을 검사한다. notifications는 recipient 본인 조건만 직접 검사하고, gongangs/song_requests는 `private.has_permission()`, clubs_apply는 `private.is_club_round_open()`을 사용한다.

[REVISED] DECIDED: user_permissions, permissions, reaction_types, club/round 관리 변경은 app admin RPC 전용이며 직접 client UPDATE/DELETE 권한을 부여하지 않는다.

DECIDED: 익명 게시물/댓글의 `author_id`는 DB에서 마스킹하지 않는다. `is_anonymous`는 UI 표시 규칙이며, 조회 권한이 있는 사용자는 원본 행을 조회할 수 있다.

[REVISED] DECIDED: 익명 작성자 표시값은 `anonymous_username`을 우선 반환하고 NULL이면 `익명 {author_id}`를 반환한다. 이 fallback은 post/comment INSERT와 posts의 `is_anonymous` 양방향 UPDATE에서 동일하게 적용한다.

---

## 17. Storage 버킷

**파일:** `{타임스탬프}_17_storage_buckets.sql`

Supabase Storage 버킷은 SQL로 직접 생성하거나 대시보드에서 생성.

| 버킷명            | public | 용도             |
| ----------------- | ------ | ---------------- |
| `avatars`       | false  | 프로필 이미지    |
| `space-images`  | false  | 공간 대표 이미지 |
| `post-files`    | false  | 게시물 첨부파일  |
| `message-files` | false  | 메시지 첨부파일  |

DECIDED: 모든 버킷을 private으로 설정. 접근은 RLS로만 제어.

REASON: 오브젝트 경로 추측으로 인한 무단 접근 방지.

[REVISED] DECIDED: Storage 경로 규칙은 고정 prefix와 식별자를 사용한다.

* avatars: `{auth.uid()}/{random_object_id}`
* space-images: `{space_pub_id}/{random_object_id}`
* post-files: `{post_pub_id}/{auth.uid()}/{random_object_id}`
* message-files: `{room_id}/{message_id}/{auth.uid()}/{random_object_id}`

[REVISED] DECIDED: 사용자가 임의 bucket/path를 attachment 테이블에 기록할 수 없도록 attachment 행 생성은 finalize RPC 전용이다. DB의 `storage_bucket/storage_path` unique 제약과 Storage object 경로 검증을 함께 적용한다.

[REVISED] DECIDED: `authenticated`에는 `storage.objects`의 직접 INSERT/UPDATE/DELETE 정책을 부여하지 않는다. trusted Edge Function/server upload authorization endpoint가 현재 사용자 상태, parent 소유권, 경로, 파일당 제한, 사용자별 quota/rate limit을 검증한 뒤 짧은 수명의 signed upload URL을 발급한다. 직접 REST/SDK Storage 쓰기는 거부하고, SELECT만 아래 bucket별 RLS로 허용한다.

[REVISED] DECIDED: finalize 단계는 클라이언트가 제출한 MIME 문자열만 신뢰하지 않고 server-detected MIME과 허용 확장자/형식을 검증한다. avatar/space image는 안전한 raster image 형식만 허용하고 SVG/HTML은 거부한다. post/message 파일의 실행·스크립트 가능 형식은 거부하거나 강제 attachment 다운로드로 제공하며, 운영 환경에서는 악성 파일 검사 통과 후에만 finalize한다.

### Storage RLS 정책 (버킷별)

**avatars:**

* SELECT: 승인된 사용자 전체
[REVISED] DECIDED: avatar SELECT는 accepted 사용자에게 허용한다. avatar write authorization endpoint는 본인 prefix의 새 random object만 허용하고, `finalize_avatar()`가 검증 후 참조를 교체한다.

**space-images:**

* SELECT: accepted 사용자가 조회 가능한 활성 space 이미지
[REVISED] DECIDED: space image SELECT는 accepted 사용자의 활성 space directory 조회 정책을 상속한다. write authorization endpoint와 `finalize_space_image()`는 활성 space의 owner/admin 및 해당 `space_pub_id` prefix만 허용한다.

**post-files:**

* SELECT: 해당 post가 속한 space 멤버
[REVISED] DECIDED: post file SELECT는 현재 post 접근 권한을 상속한다. write authorization endpoint와 finalize RPC는 활성 post 작성자 및 작성자 auth uid가 포함된 prefix만 허용하고, 제거는 cleanup queue와 service-role worker만 수행한다.

**message-files:**

* SELECT: 해당 채팅방 멤버
[REVISED] DECIDED: message file SELECT는 현재 room membership과 활성 message 접근 권한을 상속한다. write authorization endpoint와 finalize RPC는 현재 room 멤버인 활성 message 작성자 및 작성자 auth uid가 포함된 prefix만 허용하고, 제거는 cleanup queue와 service-role worker만 수행한다.

### Background cleanup jobs

[REVISED] DECIDED: deferred cleanup 작업을 이 목록에서 통합 관리한다.

[REVISED] DECIDED: explicit attachment removal 요청은 Data API에 노출하지 않는 `private.attachment_cleanup_queue`에 기록한다. authenticated는 queue 테이블 권한을 받지 않고 검증 RPC만 호출하며, service-role worker만 dequeue·상태 갱신할 수 있다.

[REVISED] DECIDED: `17_storage_buckets`는 `private.attachment_cleanup_queue`를 생성한다. 컬럼은 `id`, `storage_bucket`, `storage_path`, `requested_by`, `requested_at`, `available_at`, `attempts`, `last_error`, `processed_at`이며 `(storage_bucket, storage_path)`를 unique로 두고 pending dequeue용 `(processed_at, available_at)` 인덱스를 생성한다.

[REVISED] DECIDED: `17_storage_buckets`는 queue 생성 직후 `private.attachment_cleanup_queue`에 `SELECT, INSERT, UPDATE, DELETE`, queue bigserial sequence에 `USAGE, SELECT`를 service_role에 명시적으로 GRANT한다. 같은 객체의 권한은 `PUBLIC`, `anon`, `authenticated`에서 명시적으로 REVOKE한다.

| Job | 실행 주기/보존 기간 | 처리 순서 |
| --- | --- | --- |
| orphan Storage cleanup | 매일, 생성 후 24시간 | 허용 bucket에서 DB 참조가 없는 object 삭제 |
| soft-deleted post attachment cleanup | 매일, post 삭제 후 7일 | Storage object 삭제 성공 후 attachment 행 삭제 |
| soft-deleted message attachment cleanup | 매일, message 삭제 후 7일 | Storage object 삭제 성공 후 attachment 행 삭제 |
| soft-deleted space image cleanup | 매일, space 삭제 후 7일 | Storage object 삭제 후 image_url 정리 |
| explicit attachment removal queue | 수시 | 검증된 제거 요청의 Storage object 삭제 성공 후 attachment 행 삭제 |
| read notification cleanup | 매일, 생성 후 30일 | 읽은 notification 행 삭제 |
| hard purge | 운영자 실행 또는 별도 일정 | parent 잠금 → RESTRICT 자식 정리 → parent 삭제 |
| cache reconciliation | 매일 | space member count와 post comment/reaction cache를 실제 child 수와 대조·수정 |

[REVISED] DECIDED: Storage object 삭제가 필요한 cleanup은 scheduled Edge Function/service-role worker로 수행한다. pg_cron은 DB 대상 후보를 enqueue하거나 DB-only 정리에만 사용하며 Storage object를 SQL로 직접 삭제하지 않는다.

REASON: Storage 메타데이터 테이블을 직접 삭제하면 실제 object와 메타데이터가 불일치할 수 있다.

---

## Adversarial edge-case matrix

[REVISED] DECIDED: 아래 시나리오는 migration 구현과 검증의 필수 acceptance criteria다.

| 시나리오 | 현재 처리 결정 |
| --- | --- |
| RPC를 우회한 직접 REST/SDK 호출 | 최소 GRANT matrix, column allowlist, RLS WITH CHECK로 DB 경로 차단; Storage 직접 쓰기는 미부여 |
| 다른 사용자의 author_id/sender_id/user_id 제출 | 현재 profile ID와의 일치 검사 및 소유자 컬럼 직접 변경 금지 |
| 동일 direct chat 동시 생성 | 정규화 pair unique, transaction rollback, 충돌 후 기존 room 반환 |
| withdrawn/pending/rejected profile 요청 | 모든 helper가 accepted·비탈퇴 상태를 매 요청 검사 |
| reaction INSERT 직후 parent 삭제/purge | soft delete가 새 쓰기를 즉시 차단; hard purge는 parent lock 후 reaction 선삭제 |
| 파일 업로드 후 DB finalize 실패 또는 parent 선삭제 | signed upload 발급 시 권한·quota 검증, finalize 재검증 실패 시 attachment 미생성, 24시간 orphan cleanup |
| post/message/space 삭제 후 Storage 잔존 | 7일 cleanup job, Storage 우선 삭제, 실패 재시도 |
| owner가 이관 없이 비활성화/탈퇴/Auth 삭제 | withdrawal·status 변경·Auth 삭제 경로 모두 owner/app admin 이관 검사 |
| 겹치는 club round 동시 생성 | NOT NULL 기간, start < end, exclusion constraint |
| feed pagination 중 soft delete | keyset cursor 사용; 삭제 행 제외, snapshot 비보장은 accepted trade-off |
| room에서 제거된 직후 messages/read_states 조회 | current membership helper로 다음 요청부터 차단; 제거 RPC가 read state 정리 |
| read_state를 과거로 되돌리는 UPDATE | 동일 room 검증과 단조 증가 규칙으로 거부 |

## Accepted trade-offs

* `is_anonymous`는 전역 pseudonym 표시 기능이며 활동 연결과 권한 있는 사용자의 author_id 조회를 막지 않는다.
* `anonymous_username` 변경은 기존 익명 post/comment 표시명에도 소급 적용된다. 익명 콘텐츠 행에는 pseudonym snapshot을 저장하지 않는다.
* feed pagination은 중간 soft delete에서 snapshot 일관성을 제공하지 않지만 keyset cursor로 중복·큰 누락을 최소화한다.
* 메시지는 15분 이후 수정할 수 없지만 언제든 소프트 삭제할 수 있다. 변조 방지보다 삭제 권리를 우선한다.
* 삭제된 메시지의 답글은 남지만 parent 본문은 숨기고 “삭제된 메시지”로 표시한다.
* space admin/manager는 역할 이관 없이 탈퇴할 수 있다. 탈퇴 즉시 권한을 잃고 owner가 membership을 정리한다.
* group chat에는 별도 역할 모델이 없다. creator가 비활성화되면 다른 멤버는 계속 초대·자기 탈퇴할 수 있지만 타인 강제 제거는 app admin이 담당한다.
* song_requests는 이번 버전에서 처리 상태 없는 append-only 로그다.
* 승인 사용자는 profile의 비마스킹 컬럼을 조회할 수 있다. 민감정보 공개 범위는 제품 정책으로 수용하며 향후 필요 시 private 테이블로 분리한다.

---

## 마이그레이션 검증 절차

각 마이그레이션 묶음은 아래 순서로 검증한다.

1. `supabase db reset`으로 빈 로컬 DB에 전체 migration을 처음부터 적용
2. `supabase migration list --local`로 적용 순서 확인
3. `supabase db diff --local`로 선언되지 않은 schema drift가 없는지 확인
4. `supabase db advisors` 또는 MCP advisors로 security/performance 경고 확인
5. `anon`, `authenticated`, 관리자, service role별 GRANT/RLS 접근 테스트
6. 승인 전 사용자, 승인 사용자, 탈퇴 사용자의 접근 차단 테스트
7. column-level GRANT가 role/status/pin/deleted 필드 직접 수정을 차단하는지 테스트
8. RPC 호출자가 다른 사용자의 ID를 가장할 수 없는지 테스트
9. space_members RLS 조회가 재귀 오류 없이 동작하는지 테스트
10. direct chat 생성 경쟁 상황에서 중복 방이 생기지 않고 멤버가 정확히 두 명인지 테스트
11. soft delete 후 활성 댓글 수와 reaction count가 정확한지 테스트
12. FK 삭제가 예상치 못한 연쇄 삭제 없이 RESTRICT/SET NULL로 동작하는지 테스트
13. 모든 FK 참조 컬럼에 사용 가능한 인덱스가 있는지 진단 쿼리로 확인
14. `supabase gen types typescript --local`로 생성 타입 갱신
15. Adversarial edge-case matrix의 모든 시나리오를 역할별 통합 테스트로 검증
16. Storage orphan/retention cleanup을 실패 후 재시도까지 검증
17. club round와 direct chat 동시 INSERT 경합 테스트
18. 현재 room/space membership 제거 및 profile withdrawal 직후 기존 JWT 요청 차단 테스트
19. 직접 Storage REST/SDK 쓰기 거부, signed upload 만료·quota·경로·parent 선삭제 검증
20. MIME 위조, SVG/HTML, 허용되지 않은 실행 형식과 악성 파일 검사 실패 시 finalize 거부 검증
21. 비가입 accepted 사용자의 space directory metadata 조회와 하위 콘텐츠 접근 차단 검증
22. `auto_join` 즉시 가입, `invite_only` 자기 가입 거부, member_count 동시 증감·reconciliation 검증
23. posts `is_anonymous` 양방향 UPDATE와 NULL pseudonym의 `익명 {author_id}` fallback 검증
24. service_role의 table/sequence/function/private queue 명시적 GRANT와 anon/authenticated 접근 거부 검증

---

## 미결 항목 요약 (TODO 전체)

[REVISED] DECIDED: 현재 production-readiness 범위의 open TODO는 없다. 기존 TODO는 모두 확정 결정으로 해결되었다.

| 기존 TODO | 해결 결정 |
| --- | --- |
| message_reads 제한 방식 | RLS로 현재 room 멤버의 자기 read 행만 허용 |
| song_requests 큐 역할 | 상태 없는 append-only 로그로 확정 |
| club_apply_rounds 중복 | 기간 NOT NULL/CHECK 및 exclusion constraint |
| RPC SECURITY 속성 | 검색은 INVOKER, 제한 컬럼/원자 변경 mutation만 검증된 DEFINER |

---
