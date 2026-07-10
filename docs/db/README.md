# DB 문서

Supabase DB의 source of truth는 **`supabase/schemas/`** (declarative schema)다. `supabase/migrations/`는 production에 변경을 안전하게 적용하기 위한 delta artifact이며, 현재 구조를 읽거나 고치는 곳이 아니다.

이 디렉토리는 그 스키마의 사람용 설명서다. `domains/*.md`가 `supabase/schemas/*.sql`과 1:1로 대응한다.

## 문서 규칙

`domains/*.md` 전체에 적용된다.

- 모든 RPC와 trigger를 목록화한다.
  - RPC는 **인증 조건 · 쓰기 여부 · 목적**을 기록한다.
  - trigger는 **대상 테이블 · 이벤트 · side effect**를 기록한다.
- 구현 SQL은 복사하지 않는다. 각 문서 상단의 Source 링크(해당 schema 파일)가 구현의 기준이다.
- 스키마를 바꾸면 같은 작업에서 대응하는 domain 문서를 갱신한다.

## DB 변경 워크플로

1. `supabase/schemas/`의 도메인 파일을 먼저 수정한다.
2. `supabase db diff -f {name}`으로 migration을 생성한다.
3. 생성된 migration을 손으로 검토한다 — diff 도구는 DML을 잡지 못하고 grant/revoke 추적이 불안정하다.
   - **함수의 파라미터 이름이나 반환 컬럼만 바꿔도** Postgres는 `create or replace`를 거부하므로 diff가 `drop function` + `create`를 낸다. 이때 `grant execute`는 따라오지 않고, default privilege가 모든 롤에서 execute를 회수해 둔 상태라 그 RPC는 **아무도 호출할 수 없게 조용히 죽는다.** 함수를 drop/recreate하는 migration에는 grant/revoke를 손으로 다시 넣을 것.
   - **diff는 테이블 단위 grant만 낸다.** 스키마에 적은 `grant insert (col, ...)` / `grant update (col, ...)` 같은 **컬럼 단위 grant는 통째로 사라진다.** 새 테이블에 client 쓰기가 있으면 migration에 손으로 넣을 것 — 안 그러면 RLS 정책은 멀쩡한데 권한이 없어 정책이 도달 불가가 된다.
   - `storage.buckets` 같은 seed/DML은 diff에 아예 나타나지 않는다.

   `schema_runtime_check.sql`이 위 세 가지를 잡는다: public 함수는 `authenticated`나 `service_role` 중 하나는 실행할 수 있어야 하고, `authenticated`에게 열린 insert/update 정책에는 대응하는 컬럼 grant가 있어야 하며, 반대로 테이블 단위 쓰기 grant는 없어야 한다.
4. rename, backfill, type 변환, NOT NULL 전환, seed 등 데이터 보존이 필요한 변경은 migration에 직접 작성한다.
5. `supabase db reset` 후 `supabase/tests/schema_runtime_check.sql`을 실행하고, `supabase db diff`가 "No schema changes found"를 반환하는지 확인한다.
6. 이미 production에 적용된 migration은 수정하거나 삭제하지 않는다.

## 설계 규칙

- 스키마 파일은 도메인 단위로 나누고, 파일 내부는 type → table → index → function → trigger → RLS/policy → RPC 순서를 따른다. `rls.sql`, `rpc.sql`처럼 객체 종류별 전역 파일은 만들지 않는다.
- 기본적으로 `ON DELETE CASCADE`를 사용하지 않는다. 감사·원본 참조 보존 FK는 `ON DELETE SET NULL`, 나머지는 기본 `ON DELETE RESTRICT`.
- public schema의 모든 테이블에 RLS를 활성화한다.
- `anon`, `authenticated`, `service_role`, `PUBLIC` 권한은 필요한 객체에만 명시적으로 부여한다. `on all functions/tables` 형태의 전역 sweep은 파일 분할 구조에서 적용 순서에 따라 깨지므로 금지 — 객체 생성 직후 명시적 grant/revoke를 함께 둔다.
- **client 쓰기 권한은 항상 컬럼 단위다** (`grant insert (a,b)`, `grant update (c)`). RLS는 행 수준이지 컬럼 수준이 아니라서, 테이블 단위 grant를 주면 정책이 허용한 행에서 `sender_id`·`created_at`·`deleted_at` 같은 컬럼까지 함께 열린다. `messages`가 이 구분에 직접 의존한다.
- `public` schema의 어떤 객체도 `anon`에게 열지 않는다. 주의: 00-foundation의 `alter default privileges`는 **`postgres`가 만든 객체에만** 걸린다. Supabase의 `supabase_admin` 기본값은 여전히 anon에게 `arwdDxtm`를 주므로, 다른 롤로 DDL이 돌면 새 테이블이 anon에게 열린 채 태어나고 스키마 파일 어디에도 그 사실이 남지 않는다. `schema_runtime_check.sql`이 anon의 테이블·컬럼·시퀀스·함수 권한을 전부 0으로 강제한다.
- `SECURITY DEFINER` 함수는 `SET search_path = ''`와 내부 권한 검사를 포함한다. search_path 의존 참조(예: `gin_trgm_ops`)는 `extensions.` 접두어로 스키마를 명시한다.
- 명시되지 않은 client 권한은 허용하지 않는다. 판단이 필요하면 권한을 추가하지 말고 작업을 중단한다.

## 파일 구조

`supabase/schemas/`는 lexicographic 순서로 적용된다(`config.toml`의 `[db.migrations] schema_paths`). 숫자 접두어가 도메인 간 의존 순서를 인코딩한다.

| schema 파일            | 문서                                             | 주요 내용                                                                |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `00-foundation.sql`    | [00-foundation](domains/00-foundation.md)        | 확장, 기본 권한 회수, private schema, `require_service_role()`           |
| `01-identity.sql`      | [01-identity](domains/01-identity.md)            | profiles/permissions, Auth trigger, profile lifecycle RPC                |
| `02-spaces.sql`        | [02-spaces](domains/02-spaces.md)                | spaces/space_members, owner 검증 trigger                                 |
| `03-content.sql`       | [03-content](domains/03-content.md)              | posts/post_attachments/comments, 검색 인덱스                             |
| `04-reactions.sql`     | [04-reactions](domains/04-reactions.md)          | reaction registry, post/comment reactions                                |
| `05-chat.sql`          | [05-chat](domains/05-chat.md)                    | chat 전체 테이블, 검증 trigger, 메시지/채팅 RPC                          |
| `06-notifications.sql` | [06-notifications](domains/06-notifications.md)  | notifications                                                            |
| `07-utilities.sql`     | [07-utilities](domains/07-utilities.md)          | gongangs, song_requests                                                  |
| `08-clubs.sql`         | [08-clubs](domains/08-clubs.md)                  | clubs, apply rounds, 신청                                                |
| `09-storage.sql`       | [09-storage](domains/09-storage.md)              | storage policy, attachment cleanup queue와 정리 RPC                      |

seed 데이터(`permissions`, `reaction_types`, `storage.buckets`)는 스키마가 아니라 migration에 있다 — `supabase/migrations/20260707000000_baseline_schema.sql` 끝부분.

## 검증

- `supabase/tests/schema_runtime_check.sql` — begin/rollback 스모크 테스트. psql로 로컬 DB에 실행한다.
- `supabase/tests/schema_rls_check.sql` — **stale**. 구현된 적 없는 계약(author/sender 자동 스탬핑, `message_reads` 테이블)을 전제해서 현재 실패한다. 게이트로 쓰지 말 것.

## Production 배포

원격 DB는 2026-07-07 전환 이전 migration 이력을 갖고 있다. 최초 배포 시 `supabase db reset --linked`(pre-launch, 보존할 데이터 없음 전제) 또는 `supabase migration repair`로 baseline과 이력을 맞춘 뒤, 이후부터 일반 `supabase db push`를 사용한다.
