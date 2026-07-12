# 09. Storage

Source: [`supabase/schemas/09-storage.sql`](../../../supabase/schemas/09-storage.sql)

파일 업로드 모델과 blob 정리 파이프라인. private bucket 5개(`avatars`, `profile-covers`, `space-images`, `post-files`, `message-files`) + storage RLS + finalize RPC + cleanup queue 조합.

업로드는 2단계다: (1) Storage SDK로 provisional 경로에 직접 업로드 — bucket별 insert policy가 경로/소유권을 검증, (2) finalize류 RPC가 object 존재/MIME/크기/경로를 재검증하고 DB row를 만든다. bucket 정의 자체는 데이터라서 스키마가 아니라 baseline migration에 있다.

## 테이블

- `private.attachment_cleanup_queue` — 삭제할 blob의 bucket/path 큐. `(bucket, path)` unique, 시도 횟수/에러/처리 시각. service_role만 접근

## Storage RLS (storage.objects)

- bucket별 select policy: DB row와 연결된 object(또는 본인의 provisional 업로드)만 읽기 허용
- bucket별 insert policy: 경로 패턴 + 소유권/멤버십 검증. UPDATE/DELETE는 열지 않는다

## RPC

| 함수 | 인증 | 쓰기 | 목적 |
| --- | --- | --- | --- |
| `request_attachment_removal(kind, attachment_id)` | 첨부 소유자 (post 작성자 / message 발신자+방 멤버) | O | 첨부 metadata 제거 + blob 삭제 큐 등록. 첨부만 남은 메시지는 soft delete까지 처리 |
| `enqueue_due_storage_cleanup()` | service_role | O | 삭제 7일 경과한 첨부/space 이미지, 48시간 경과 고아 object를 큐에 적재 |
| `claim_storage_cleanup(limit)` | service_role | O | 큐 항목 클레임 (skip locked, 10분 리스, 시도 횟수 증가) |
| `complete_storage_cleanup(id)` | service_role | O | blob 삭제 완료 후 관련 DB 참조(row/URL) 정리 + 큐 완료 처리 |
| `fail_storage_cleanup(id, error)` | service_role | O | 실패 기록 + 지수 백오프로 재시도 예약 (최대 24시간) |

## Private helper

- `private.has_uuid_object_suffix(name, prefix)` — object 이름이 `prefix + v4 uuid` 형태와 정확히 일치하는지 검사하는 공통 헬퍼(정의는 foundation). 모든 insert policy와 finalize/ send RPC의 경로 검증에서 재사용한다.

## Trigger

없음.

## 주의

- 실제 blob 삭제는 SQL이 아니라 `supabase/functions/storage-maintenance` edge function이 수행한다: enqueue → claim → Storage remove → complete/fail 루프.
- profile 이미지는 `{auth_uid}/{uuid}`, space 이미지는 `{space.pub_id}/{uuid}`(pub_id는 슬래시 없는 text 슬러그), 메시지 첨부는 `{conversation_id}/{auth_uid}/{uuid}`(direct/room 구분 없음), **post 첨부는 `{space.pub_id}/{auth_uid}/{uuid}`** 경로를 사용한다.
- post 첨부 경로가 post가 아니라 **space**에 매달린 이유: 위의 2단계 모델(업로드 → finalize)이 성립하려면 **글보다 먼저 업로드할 수 있어야** 한다. 경로에 `post.pub_id`를 박으면 글이 먼저 존재해야 해서 작성 → 업로드 → 확정 3단계가 되고, 중간에 실패하면 첨부 없는 글이 남아 보상 트랜잭션(soft delete)이 필요해진다 — 그 보상도 실패할 수 있어 유령 글이 생긴다. space에 매면 `create_post_with_attachments`가 글+첨부를 한 트랜잭션으로 끝내고, 실패 시 아무것도 남지 않는다(올려둔 blob은 고아 청소행). 보안 성질은 message 첨부와 동일하다: 내가 참여하는 공간의, 내 uid 경로에만 올릴 수 있다.
- `finalize_avatar()`/`finalize_cover_image()`는 identity, `send_message_with_attachments()`는 chat, `create_post_with_attachments()`/`set_post_attachments()`는 content 문서에 있다.
- `message-files` bucket의 `allowed_mime_types`/`file_size_limit`는 손으로 유지하지 않는다 — `public.message_attachment_mime_types` 행에서 생성한다. registry를 바꾸면 같은 migration에서 bucket도 다시 만들 것. `schema_runtime_check.sql`이 둘의 drift를 잡는다.
- space 이미지는 finalize RPC가 없어 `space-images` bucket에 신규 사용 경로가 없다 (큐/policy는 잔여 object 정리를 위해 유지).
