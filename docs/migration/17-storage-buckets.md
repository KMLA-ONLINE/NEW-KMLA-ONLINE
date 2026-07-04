# 17. Storage Buckets

- SQL 파일: `supabase/migrations/20260612121249_storage_buckets.sql`

## 역할

이 파일은 파일 업로드와 DB row 연결 방식을 정의한다. 현재 프로젝트는 Storage object를 직접 열지 않고, private bucket + storage RLS + finalize RPC + cleanup queue 조합으로 다룬다.

## 현재 작동 방식

### bucket 구조

- private bucket 네 개를 사용한다.
  - `avatars`
  - `space-images`
  - `post-files`
  - `message-files`
- 각 bucket은 MIME allowlist와 size limit을 가진다.

### 업로드 방식

- 사용자는 먼저 Storage SDK로 object를 직접 업로드한다.
- 하지만 아무 경로나 허용되는 게 아니라, bucket별 path pattern과 ownership/membership 조건을 storage RLS가 같이 본다.
- 이후 finalize RPC가 실제 DB row를 만든다.

즉 흐름은:

1. object 업로드
2. storage RLS로 path/권한 1차 제한
3. finalize RPC가 object 존재/MIME/크기/path를 다시 검증
4. attachment row 또는 image path를 DB에 기록

### finalize와 attachment 연결

- post attachment는 `finalize_post_attachment()`가 post row와 object를 연결한다.
- message attachment는 authenticated 사용자 기준으로 `send_message_with_attachment()` 경로만 사용한다.
  - 먼저 provisional object를 업로드하고
  - 그 다음 message row와 attachment row를 한 transaction에서 같이 만든다.
- avatar와 space image도 finalize RPC를 통해서만 profile/space row에 연결한다.

이 finalize RPC의 도메인별 사용 맥락은 아래 문서에 함께 적는다.

- `finalize_space_image()`: `05-spaces.md`
- `finalize_post_attachment()`: `06-content.md`
- `send_message_with_attachment()`: `08-chat.md`
- `finalize_avatar()`: `04-identity.md`

### cleanup queue

- 실제 blob 삭제 대신 먼저 `private.attachment_cleanup_queue`에 넣는다.
- `request_attachment_removal()`은 사용자가 자기 attachment 제거를 요청하는 함수다. message attachment는 metadata row와 related reaction을 즉시 지우고, attachment-only message가 비면 `content=null` soft delete까지 처리한 뒤 실제 blob 삭제만 queue로 넘긴다.
- service-role worker는 아래 lifecycle 함수를 사용한다.
  - `enqueue_due_storage_cleanup()`
  - `claim_storage_cleanup()`
  - `complete_storage_cleanup()`
  - `fail_storage_cleanup()`
- 별도로 `cleanup_deleted_content()`와 `reconcile_cached_counts()`도 service-role maintenance 작업으로 제공한다.

## 권한과 쓰기 경로

- `authenticated`는 finalize/send/remove RPC execute만 가진다.
- 다만 message 쪽에서는 기존 message에 나중에 첨부를 추가하는 `finalize_message_attachment()`는 authenticated에 부여되지 않는다.
- cleanup queue table과 sequence는 `service_role`만 접근한다.
- 실제 blob 삭제는 SQL이 아니라 service-side worker/edge function이 맡는 전제다.

## 현재 주의점

- 이 프로젝트의 파일 모델은 “Storage object를 먼저 만들고, DB row는 나중에 확정”하는 2단계 구조다.
- DB attachment row가 없으면 object가 orphan가 될 수 있어서 cleanup queue/maintenance가 중요하다.
- `complete_storage_cleanup()`는 DB 참조와 queue 상태를 정리하지만 실제 object 삭제는 SQL 밖에서 처리하는 구조다.
- `soft_delete_message()`는 연결된 message attachment metadata와 message reaction을 즉시 제거하고 실제 blob 삭제는 같은 cleanup queue로 넘긴다.

## 미구현 / 계약과 차이

- authenticated 사용자의 `message-files` 업로드 경로는 현재 `{room_id}/{auth_uid}/{uuid}` provisional 경로만 사용한다.
- SQL에는 `finalize_message_attachment()`가 남아 있지만, 현재 앱의 사용자 경로에서는 쓰지 않는다.
- `cleanup_deleted_content()`는 현재 post/comment만 자동 purge하고 message/space는 자동 purge하지 않는다.
- `reconcile_cached_counts()`는 banned member 포함 전체 `space_members`를 센다.
- service-role `purge_deleted_content('space', ...)` hard purge 경로는 별도로 존재한다.

## 기존 합의 세부 규칙

- 모든 bucket은 private으로 유지한다.
- 오브젝트 경로 은닉에 의존하지 않고 storage RLS로 접근을 제어하는 방향을 유지한다.
- 업로드/다운로드는 Supabase Storage SDK를 직접 사용한다.
- authenticated의 `storage.objects` 직접 INSERT는 bucket별 RLS policy로만 제한하고, UPDATE/upsert/DELETE는 열지 않는 방향을 유지한다.
- finalize RPC는 object 존재, parent 권한, 경로, 크기, MIME, 허용 형식을 다시 검증한다.
- SVG/HTML 및 실행 가능한 위험 형식은 거부한다.
- avatars/space-images는 raster image만 허용한다.
- post/message file은 이미지 + 문서 계열 allowlist만 허용한다.
- 이미지 외 파일은 attachment disposition으로 다운로드하는 방향을 유지한다.
- Storage object path 최대 길이는 1024자를 기준으로 한다.
- attachment 제거는 cleanup queue와 service-role worker만 수행한다.
- finalize는 생성 후 24시간 이내 object만 허용하고, orphan cleanup은 48시간 이후를 기준으로 하는 방향을 유지한다.
