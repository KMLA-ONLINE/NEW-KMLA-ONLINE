# 삭제·보존 정책

현재 선언형 스키마가 실제로 강제하는 삭제·보존 정책을 모은 문서다. 정책을 새로 정하는 문서가 아니며, 구현의 기준은 [`supabase/schemas/`](../../supabase/schemas/)다.

## 요약


| 대상         | 즉시 처리                                      | 이후 처리                          | 남는 것                                     |
| -------------- | ------------------------------------------------ | ------------------------------------ | --------------------------------------------- |
| 프로필       | PII·`user_keys` 제거, `withdrawn` 전환        | 없음                               | 익명화된 profile과 작성 콘텐츠·메시지 관계 |
| Space        | `deleted_at` 설정                              | 7일 뒤 Storage 정리 후 hard delete | 파일 정리 전의 종속 행                      |
| 게시글       | 첨부 metadata·반응 삭제, soft delete          | 7일 뒤 hard delete                 | 유예 중 글·댓글·멘션·알림                |
| 게시물 신고  | 기각 시 처리 상태 보존, 삭제 결정 시 글 soft delete | 대상 글 hard delete 시 cascade | 글이 남아 있는 동안의 신고·처리 기록       |
| 최상위 댓글  | 하위 답글·반응까지 함께 soft delete           | 7일 뒤 하위 트리와 hard delete     | 없음                                        |
| 답글         | 본문·반응 삭제, tombstone 전환                | 7일 뒤 가능한 행만 hard delete     | 활성 하위 답글의 조상 tombstone             |
| 메시지       | 본문/암호문·첨부 metadata·반응·키 봉투 삭제 | 시간 기반 hard delete 없음         | 메시지 관계·시각·삭제 metadata            |
| Storage blob | cleanup queue 등록 또는 참조 제거              | Edge Function이 object 삭제        | 실패한 queue 항목                           |
| 알림         | 관련 대상 hard delete 시 FK cascade            | 생성 30일 뒤 hard delete           | 생성 30일 이내 알림                          |

## 프로필과 Auth

`withdraw_profile()`과 `auth.users`의 BEFORE DELETE 트리거는 `private.anonymize_profile()`을 공유한다.

- `user_keys`를 삭제한다. 탈퇴한 계정은 과거 1:1 대화를 다시 열 수 없
- 이름을 `탈퇴한 사용자`로 바꾸고 학번·기수·연락처·생일·소개·프로필/커버 이미지 참조 등 PII를 비운다.
- `profiles.status`는 `withdrawn`, `deleted_at`은 현재 시각이 된다. profile 행의 hard purge는 없다.
- 자발 탈퇴는 `auth_user_id`를 유지한다. Auth 사용자를 실제로 삭제한 경우에만 FK의 `ON DELETE SET NULL`로 끊긴다.
- admin 또는 살아 있는 Space의 owner는 책임을 넘기기 전 탈퇴·Auth 삭제할 수 없다.
- 작성한 posts/comments/messages는 삭제하지 않으며, 이후 익명화된 profile로 보인다.

참조가 비워진 avatar/cover blob은 고아 object 정리 대상이 된다.

## Space

Space 삭제는 service-role 작업이다.

1. `soft_delete_space()`가 `spaces.deleted_at`만 설정한다.
2. 7일 뒤 Storage maintenance가 Space 이미지와 그 Space 글의 첨부를 cleanup queue에 넣는다.
3. Edge Function이 object를 실제로 제거하고, `complete_storage_cleanup()`이 `post_attachments`, `spaces.image_url`, `spaces.cover_image_url` 참조를 정리한다.
4. `purge_due_spaces()`가 첨부 행과 `image_url`·`cover_image_url`이 없는 Space만 hard delete한다. 파일이 남았으면 skip하고 다음 실행에서 재시도한다.

hard purge는 댓글·반응·알림·글·가입 요청·초대·익명 정지 기록·카테고리·멤버십을 지운 뒤 Space 행을 지운다. 부모 FK가 `RESTRICT`인 댓글은 잎부터 반복해서 지운다.

## 게시글과 댓글

`soft_delete_post()`은 작성자 또는 해당 Space의 owner/admin만 호출한다.

- post 첨부를 queue에 넣은 뒤 `post_attachments`와 `post_reactions`를 삭제한다.
- `posts.deleted_at`/`deleted_by`만 설정한다. 댓글·멘션·알림은 남지만 일반 조회에서는 접근할 수 없다.
- `purge_deleted_content()`는 기본 7일이 지난 글 중 첨부 metadata가 없는 글만 hard delete한다. 그 글의 댓글·반응도 지우며 notifications/mentions/post reports는 FK cascade로 제거된다.

게시물 신고는 별도의 영구 감사 로그가 아니라 대상 글에 종속된 모더레이션 기록이다. `dismissed` 신고는 글이 남아 있는 동안 보존되어 같은 사용자의 반복 신고를 막는다. `post_removed` 처리는 신고 상태와 처리 시각·처리자를 기록한 뒤 기존 게시물 soft delete를 실행하며, 7일 뒤 글이 hard purge될 때 신고도 함께 삭제된다. 이미 삭제된 글은 대기 신고함과 배지에서 제외된다.

`soft_delete_comment()`은 댓글 위치에 따라 다르게 동작한다.

- 최상위 댓글(`parent_id is null`)은 하위 답글과 반응을 함께 soft delete한다. 하위 답글에는 별도 모더레이션 삭제 알림을 만들지 않으며, 7일 뒤 트리 전체가 hard delete된다.
- 답글(`parent_id is not null`)은 본문과 자신의 반응만 지운다. 하위 답글은 그대로 남고, 삭제된 답글 행은 “삭제된 댓글” placeholder를 위한 tombstone으로 유지된다.
- `purge_deleted_content()`는 기본 7일 뒤 삭제 댓글을 잎부터 지운다. 활성 하위 답글이 있으면 그 조상 tombstone은 계속 보존한다.

## 채팅

`soft_delete_message()`은 발신자만 호출할 수 있다.

- 첨부 blob을 queue에 넣고 `message_attachments`, `message_reactions`, `message_keys`를 삭제한다.
- `content`와 `content_ciphertext`를 비우고 `deleted_at`/`deleted_by`를 설정한다.
- reply placeholder를 위해 `messages` tombstone 행은 영구 보존한다. 시간 기준 메시지 hard purge는 없다.

그룹 대화에서 멤버를 제거하면 그 사람의 읽음 상태·알림 설정·반응·멤버십 행을 삭제하지만 메시지는 남긴다. service-role `cleanup_conversation()`은 첨부 metadata가 모두 정리된 대화만 hard delete하며, 반응·키 봉투·읽음 상태·알림 설정·메시지·멤버십·대화 행을 순서대로 지운다.

## Storage cleanup queue

`private.attachment_cleanup_queue`는 Storage 삭제와 DB 참조 제거 사이의 내구성 있는 작업 큐다.

- 사용자가 post/message 첨부 또는 그 콘텐츠를 삭제하면 blob은 즉시 queue에 등록된다.
- 삭제된 Space의 첨부·이미지는 7일 뒤 queue에 등록된다.
- DB에서 참조하지 않는 provisional upload와 탈퇴 뒤 참조가 끊긴 profile 이미지는 생성 48시간 뒤 고아 object로 queue에 등록된다.
- `storage-maintenance` Edge Function은 claim → Storage remove → complete/fail 순으로 처리한다. 실패는 최대 24시간 지수 백오프로 재시도한다.
- 처리 완료 queue 행은 30일 뒤 삭제된다.

실제 blob이 먼저 삭제된 뒤에만 DB 참조를 끊는다. 따라서 Storage maintenance는 운영에서 적어도 하루 한 번 실행되어야 한다. 배포·호출 방법은 [`supabase/functions/README.md`](../../supabase/functions/README.md)를 따른다.

## 기타 관계 데이터

- 사용자는 자신의 post/comment/message 반응을 direct DELETE할 수 있다.
- `leave_space()`는 본인의 `space_members` 행을 즉시 삭제한다. owner는 소유권을 넘겨야 나갈 수 있다.
- 가입 요청은 승인·거절·본인 취소 시 삭제된다.
- Space 초대는 revoke 시 `revoked_at`만 설정하며, 만료·revoke 행의 hard purge는 없다.
- 동아리 지원은 모집 기간 안에서만 본인 행을 삭제할 수 있다. 모집 종료 뒤에는 행이 남는다.
- 공강 예약은 소유자가 직접 삭제할 수 있다. 노래 신청에는 사용자 delete 권한이나 시간 기반 정리 경로가 없다.

## 알림

`notifications`는 읽음 여부와 무관하게 `created_at` 기준 30일 뒤 `purge_notifications()`가 오래된 순서로 hard delete한다. 그 밖에는 수신자 profile, 참조한 Space, post, comment가 hard delete될 때 FK cascade로 사라진다. 일반 탈퇴는 profile을 hard delete하지 않으므로 수신자 cascade는 보통 발생하지 않는다.

채팅은 별도 notification 행을 만들지 않는다. 읽음 상태는 `chat_read_states`, 알림 설정은 `chat_notification_settings`에 보관한다.

## 관련 구현

- [Identity](../../supabase/schemas/01-identity.sql)
- [Spaces](../../supabase/schemas/02-spaces.sql)
- [Content](../../supabase/schemas/03-content.sql)
- [Chat](../../supabase/schemas/05-chat.sql)
- [Notifications](../../supabase/schemas/06-notifications.sql)
- [Storage](../../supabase/schemas/09-storage.sql)
