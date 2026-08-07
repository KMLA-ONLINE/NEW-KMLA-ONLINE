
# DB 문서

Supabase DB의 source of truth는 declarative schema가 있는 **`supabase/schemas/`**다. `supabase/migrations/`는 production에 변경을 안전하게 적용하기 위한 delta artifact이며, 현재 스키마를 읽거나 수정하는 기준으로 사용하지 않는다.

이 디렉토리는 스키마의 사람용 설명서다. `domains/*.md`는 `supabase/schemas/*.sql`과 1:1로 대응한다.

데이터 노출, soft delete, 보존 기간, 실제 삭제 규칙은 [삭제·보존 정책](deletion-policy.md)에 기록한다.

## 문서 규칙 (`domains/*.md`)

- 모든 RPC와 trigger를 목록화한다.
  - RPC: 인증 조건, 쓰기 여부, 목적
  - Trigger: 대상 테이블, 이벤트, side effect
- `## RPC`와 `## Trigger` 표는 SQL 선언 순서나 이름순이 아니라 호출 흐름으로 정리한다.
  - RPC: 읽기 → 일반 사용자 작업(생성 → 변경/삭제) → 관리자 작업 → service-role 정리
  - Trigger: 입력·형태 검증 → 서버 소유 상태 갱신 → 파생 효과
  - `create`/`accept`, `suspend`/`undo`처럼 한 흐름의 짝은 붙여 둔다.
- 구현 SQL을 문서에 복사하지 않는다. 각 문서 상단의 Source 링크를 구현 기준으로 삼는다.
- 스키마를 변경하면 같은 작업에서 대응하는 domain 문서도 갱신한다.

## DB 변경 워크플로

1. `supabase/schemas/`의 관련 도메인 파일을 먼저 수정한다.
2. migration을 생성한다.

   ```sh
   supabase db diff -f {name}
   ```
3. 생성된 migration을 직접 검토한다. Diff 도구는 DML을 잡지 못하며 grant/revoke를 누락하거나 잘못 표현할 수 있다.

   - 함수 파라미터 이름이나 반환 컬럼을 바꾸면 PostgreSQL이 `drop function` 후 `create function`을 생성할 수 있다. 함수가 재생성되면 필요한 `grant execute`와 `revoke`를 migration에 다시 작성한다.
   - Diff 도구는 `grant insert (a, b)`나 `grant update (c)` 같은 컬럼 단위 grant를 누락하고 테이블 단위 grant를 생성할 수 있다. 필요한 client 쓰기 권한은 직접 추가한다.
   - `storage.buckets`를 포함한 seed 데이터와 기타 DML은 diff에 나타나지 않는다.

   `supabase/tests/00-privileges.sql`은 다음 불변식을 검사한다.

   - 모든 public 함수는 `authenticated` 또는 `service_role` 등 의도한 역할 중 하나 이상이 실행할 수 있어야 한다.
   - `authenticated`에게 열린 insert/update 정책에는 대응하는 컬럼 단위 grant가 있어야 한다.
   - Client 역할에는 테이블 단위 쓰기 grant가 없어야 한다.
4. rename, backfill, type 변환, `NOT NULL` 전환, seed 변경처럼 데이터 보존이 필요한 작업은 migration에 직접 작성한다.
5. 다음 명령을 실행한다.

   ```sh
   supabase db reset
   npm run test:db
   supabase db diff
   ```

   마지막 diff는 `No schema changes found`를 반환해야 한다.
6. production에 이미 적용된 migration은 수정하거나 삭제하지 않는다.

## 설계 규칙

- 스키마 파일은 도메인 단위로 나눈다. 파일 내부 순서는 다음과 같다.

  `type → table → index → function → trigger → RLS/policy → RPC`
- `rls.sql`, `rpc.sql`처럼 객체 종류별 전역 파일을 만들지 않는다.
- 기본적으로 `ON DELETE CASCADE`를 사용하지 않는다.

  - 감사 기록이나 원본 참조를 보존해야 하는 FK는 `ON DELETE SET NULL`
  - 그 외에는 기본 `ON DELETE RESTRICT`
- `public` schema의 모든 테이블에 RLS를 활성화한다.
- 권한은 객체 생성 직후 필요한 범위에만 명시적으로 부여한다. `on all functions`, `on all tables` 같은 전역 grant를 사용하지 않는다.
- Client 쓰기 권한은 항상 컬럼 단위로 부여한다.

  ```sql
  grant insert (a, b) on public.example to authenticated;
  grant update (c) on public.example to authenticated;
  ```

  RLS는 행만 제어한다. 테이블 단위 쓰기 grant를 부여하면 정책이 허용한 행에서 `sender_id`, `created_at`, `deleted_at` 같은 서버 소유 컬럼도 수정할 수 있다.
- `public` schema의 어떤 객체도 `anon`에게 열지 않는다.
- `alter default privileges`만으로 권한을 보호하지 않는다. Default privilege는 설정 대상 역할이 생성한 객체에만 적용된다.
- 모든 `SECURITY DEFINER` 함수는 다음 조건을 충족해야 한다.

  - `SET search_path = ''` 사용
  - 함수 내부에서 권한 검사 수행
  - `extensions.gin_trgm_ops`처럼 extension 소유 객체를 schema-qualified reference로 사용
- 의도한 client 권한이 명확하지 않으면 권한을 추가하지 말고 보안 결정을 요청한다.

## 파일 구조

`supabase/schemas/`는 `supabase/config.toml`의 `[db.migrations] schema_paths`에 따라 lexicographic 순서로 적용된다. 숫자 접두어는 도메인 간 의존 순서를 나타낸다.


| Schema 파일            | 문서                                            | 주요 내용                                                       |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------------------------- |
| `00-foundation.sql`    | [00-foundation](domains/00-foundation.md)       | 확장, 기본 권한 회수,`private` schema, `require_service_role()` |
| `01-identity.sql`      | [01-identity](domains/01-identity.md)           | Profiles, permissions, Auth trigger, profile lifecycle RPC      |
| `02-spaces.sql`        | [02-spaces](domains/02-spaces.md)               | Spaces, space membership, owner validation trigger              |
| `03-content.sql`       | [03-content](domains/03-content.md)             | Posts, attachments, comments, search index                      |
| `04-reactions.sql`     | [04-reactions](domains/04-reactions.md)         | Reaction registry, post/comment reactions                       |
| `05-chat.sql`          | [05-chat](domains/05-chat.md)                   | Chat 테이블, validation trigger, message/chat RPC               |
| `06-notifications.sql` | [06-notifications](domains/06-notifications.md) | Notifications                                                   |
| `07-utilities.sql`     | [07-utilities](domains/07-utilities.md)         | Gongangs, song requests                                         |
| `08-clubs.sql`         | [08-clubs](domains/08-clubs.md)                 | Clubs, application rounds, applications                         |
| `09-storage.sql`       | [09-storage](domains/09-storage.md)             | Storage policy, attachment cleanup queue, cleanup RPC           |

`permissions`, `reaction_types`, `storage.buckets`의 seed 데이터는 declarative schema가 아니라 baseline migration에 있다.

`supabase/migrations/20260707000000_baseline_schema.sql`

| schema 파일            | 문서                                            | 주요 내용                                                      |
| ---------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| `00-foundation.sql`    | [00-foundation](domains/00-foundation.md)       | 확장, 기본 권한 회수, private schema, `require_service_role()` |
| `01-identity.sql`      | [01-identity](domains/01-identity.md)           | profiles/permissions, Auth trigger, profile lifecycle RPC      |
| `02-spaces.sql`        | [02-spaces](domains/02-spaces.md)               | spaces/space_members, owner 검증 trigger                       |
| `03-content.sql`       | [03-content](domains/03-content.md)             | posts/post_attachments/comments, 검색 인덱스                   |
| `04-reactions.sql`     | [04-reactions](domains/04-reactions.md)         | reaction registry, post/comment reactions                      |
| `05-chat.sql`          | [05-chat](domains/05-chat.md)                   | chat 전체 테이블, 검증 trigger, 메시지/채팅 RPC                |
| `06-notifications.sql` | [06-notifications](domains/06-notifications.md) | notifications                                                  |
| `07-utilities.sql`     | [07-utilities](domains/07-utilities.md)         | gongangs, song_requests                                        |
| `08-clubs.sql`         | [08-clubs](domains/08-clubs.md)                 | clubs, 앱/동아리 관리자 분리, 모집 라운드·신청                 |
| `09-storage.sql`       | [09-storage](domains/09-storage.md)             | storage policy, attachment cleanup queue와 정리 RPC            |

- `01-identity.sql`: `user_keys`
- `05-chat.sql`: `message_keys`
- `09-storage.sql`: 전용 storage bucket

Client protocol과 threat model은 [docs/e2ee.md](../e2ee.md)에만 기록한다. Domain 문서는 해당 모델을 스키마가 어떻게 강제하는지만 설명한다.

## 검증

다음 명령을 실행한다.

```sh
npm run test:db
```

이 명령은 `supabase/tests/*.sql`을 순서대로 로컬 DB에 실행한다. 각 파일은 자체 `begin`/`rollback`을 가지므로 독립적으로 실행할 수 있다.

```sh
node supabase/tests/run.mjs 05-chat
```

`.husky/pre-commit`은 `supabase/` 아래 변경에 대해 다음을 강제한다.

1. `supabase db diff`가 `No schema changes found`를 반환해야 한다.
2. `npm run test:db`가 통과해야 한다.
3. 로컬 Supabase가 실행 중이 아니면 검사를 건너뛰지 않고 commit을 차단한다.

DB 테스트는 권한 누출, 암호화 키 노출, 잘못된 profile visibility, ownership invariant 위반처럼 조용히 발생할 수 있는 실패를 우선 검증한다.


`04-reactions`·`07-utilities`에는 도메인 테스트가 없다. `08-clubs`는 앱 관리자와 동아리별 관리자 권한 분리를 별도 테스트한다. `00-privileges`의 전수 검사도 모든 도메인을 함께 훑는다.

`07-utilities`, `08-clubs`에는 도메인별 테스트 파일이 없다. 대신 `00-privileges.sql`의 schema-wide 검사 대상에 포함된다.

### 권한 및 RLS 검증

`00-privileges.sql`은 수동 목록 대신 PostgreSQL catalog에서 검사 대상을 찾는다.

- RLS 정책이 참조하는 private helper
- 고정된 `search_path`가 없는 `SECURITY DEFINER` 함수
- RLS가 비활성화된 public 테이블
- 누락된 함수 실행 권한
- RLS 쓰기 정책과 컬럼 단위 grant의 불일치
- 금지된 테이블 단위 client 쓰기 grant

`10-rls.sql`은 `authenticated` 역할로 쿼리를 실행해 RLS 정책을 실제로 평가한다. 다른 테스트는 대부분 테이블 소유자인 `postgres`로 실행되므로 `FORCE ROW LEVEL SECURITY`가 없으면 RLS를 우회한다.

Deferred constraint trigger는 rollback 전에 강제로 실행해야 한다.

```sql
set constraints ... immediate;
```

Deferred trigger는 기본적으로 commit 시점에 실행되기 때문이다.

### 테스트 하네스 한계

`require_service_role()`은 `session_user = 'postgres'`를 허용한다. 테스트 하네스가 `postgres`로 연결되므로 service-role gate가 비인가 호출자를 거부하는지 직접 검증할 수 없다.

### E2EE 통합 테스트

`app/lib/crypto/e2ee.integration.test.ts`는 실제 키를 사용해 암호화와 DB round-trip을 검증한다.

기본 테스트와 분리되어 있으므로 로컬 Supabase를 실행한 뒤 다음 명령을 사용한다.

```sh
npm run test:e2ee
```

## Production 배포

원격 DB에는 2026-07-07 baseline 전환 이전 migration 이력이 남아 있다. 전환 후 첫 배포에서는 다음 중 하나로 원격 migration history를 맞춘다.

```sh
supabase db reset --linked
```

이 명령은 production 데이터가 없는 pre-launch 환경에서만 사용한다.

데이터를 보존해야 한다면 다음 명령으로 migration history를 복구한다.

```sh
supabase migration repair
```

History를 맞춘 이후에는 일반 배포 명령을 사용한다.

```sh
supabase db push
```

### 배포 순서: DB 먼저

DB를 frontend보다 먼저 배포한다.

새 RPC나 schema 변경에 의존하는 frontend를 배포하기 전에 `supabase db push` 성공을 확인한다. 순서가 뒤집히면 client-side authentication이 session을 만든 뒤 아직 존재하지 않는 RPC를 호출할 수 있다.

### Production Dashboard 체크리스트

`supabase/config.toml`은 로컬 개발에만 적용된다. 다음 항목은 production Supabase dashboard에서 직접 설정한다.


| 항목                           | 위치                      | 요구 사항                                                                                                                       |
| -------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `/reset-password` Redirect URL | Auth → URL Configuration | 운영 reset-password route를 가리켜야 한다                                                                                       |
| SMTP                           | Auth → SMTP Settings     | 비밀번호 재설정 메일 전송을 위해 설정해야 한다                                                                                  |
| `password_requirements`        | Auth → Policies          | 문자 종류 제한을 추가하지 않는다.`app/lib/crypto/account.ts`의 `PasswordKeys`가 사용하는 `authHash`는 lowercase hexadecimal이다 |
