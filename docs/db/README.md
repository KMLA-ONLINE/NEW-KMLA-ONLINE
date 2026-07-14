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

   `tests/00-privileges.sql`이 위 세 가지를 잡는다: public 함수는 `authenticated`나 `service_role` 중 하나는 실행할 수 있어야 하고, `authenticated`에게 열린 insert/update 정책에는 대응하는 컬럼 grant가 있어야 하며, 반대로 테이블 단위 쓰기 grant는 없어야 한다.

4. rename, backfill, type 변환, NOT NULL 전환, seed 등 데이터 보존이 필요한 변경은 migration에 직접 작성한다.
5. `supabase db reset` 후 `npm run test:db`를 실행하고, `supabase db diff`가 "No schema changes found"를 반환하는지 확인한다.
6. 이미 production에 적용된 migration은 수정하거나 삭제하지 않는다.

## 설계 규칙

- 스키마 파일은 도메인 단위로 나누고, 파일 내부는 type → table → index → function → trigger → RLS/policy → RPC 순서를 따른다. `rls.sql`, `rpc.sql`처럼 객체 종류별 전역 파일은 만들지 않는다.
- 기본적으로 `ON DELETE CASCADE`를 사용하지 않는다. 감사·원본 참조 보존 FK는 `ON DELETE SET NULL`, 나머지는 기본 `ON DELETE RESTRICT`.
- public schema의 모든 테이블에 RLS를 활성화한다.
- `anon`, `authenticated`, `service_role`, `PUBLIC` 권한은 필요한 객체에만 명시적으로 부여한다. `on all functions/tables` 형태의 전역 sweep은 파일 분할 구조에서 적용 순서에 따라 깨지므로 금지 — 객체 생성 직후 명시적 grant/revoke를 함께 둔다.
- **client 쓰기 권한은 항상 컬럼 단위다** (`grant insert (a,b)`, `grant update (c)`). RLS는 행 수준이지 컬럼 수준이 아니라서, 테이블 단위 grant를 주면 정책이 허용한 행에서 `sender_id`·`created_at`·`deleted_at` 같은 컬럼까지 함께 열린다. `messages`가 이 구분에 직접 의존한다.
- `public` schema의 어떤 객체도 `anon`에게 열지 않는다. 주의: 00-foundation의 `alter default privileges`는 **`postgres`가 만든 객체에만** 걸린다. Supabase의 `supabase_admin` 기본값은 여전히 anon에게 `arwdDxtm`를 주므로, 다른 롤로 DDL이 돌면 새 테이블이 anon에게 열린 채 태어나고 스키마 파일 어디에도 그 사실이 남지 않는다. `tests/00-privileges.sql`이 anon의 테이블·컬럼·시퀀스·함수 권한을 전부 0으로 강제한다.
- `SECURITY DEFINER` 함수는 `SET search_path = ''`와 내부 권한 검사를 포함한다. search_path 의존 참조(예: `gin_trgm_ops`)는 `extensions.` 접두어로 스키마를 명시한다.
- 명시되지 않은 client 권한은 허용하지 않는다. 판단이 필요하면 권한을 추가하지 말고 작업을 중단한다.

## 파일 구조

`supabase/schemas/`는 lexicographic 순서로 적용된다(`config.toml`의 `[db.migrations] schema_paths`). 숫자 접두어가 도메인 간 의존 순서를 인코딩한다.

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
| `08-clubs.sql`         | [08-clubs](domains/08-clubs.md)                 | clubs, apply rounds, 신청                                      |
| `09-storage.sql`       | [09-storage](domains/09-storage.md)             | storage policy, attachment cleanup queue와 정리 RPC            |

seed 데이터(`permissions`, `reaction_types`, `storage.buckets`)는 스키마가 아니라 migration에 있다 — `supabase/migrations/20260707000000_baseline_schema.sql` 끝부분.

1:1 대화의 종단간 암호화는 01-identity(`user_keys`)·05-chat(`message_keys`)·09-storage(전용 버킷)에 걸쳐 있고, 클라이언트 프로토콜과 위협 모델은 [docs/e2ee.md](../e2ee.md)에 한 번만 적혀 있다. 도메인 문서는 스키마가 그것을 어떻게 강제하는지만 말한다.

## 검증

`npm run test:db` — `supabase/tests/*.sql`을 순서대로 로컬 DB에 돌린다. 파일마다 자기 `begin`/`rollback`을 갖고 있어 서로 독립이고, 하나만 돌릴 수도 있다(`node supabase/tests/run.mjs 05-chat`).

**`supabase/` 아래를 건드린 커밋은 pre-commit 훅이 이걸 강제한다** (`.husky/pre-commit`): 먼저 `db diff`가 "No schema changes found"여야 하고(아니면 아래 테스트가 *옛 스키마*를 검사하고 통과한다 — 그 초록은 거짓말이다), 그다음 `test:db`가 통과해야 한다. 로컬 Supabase가 안 떠 있으면 조용히 건너뛰지 않고 **커밋을 막는다.** 스키마를 안 건드린 커밋은 지금까지와 똑같이 빠르다 — 느린 훅은 `--no-verify`를 습관으로 만들고, 그러면 검사가 아예 없는 것보다 나쁘다(있다고 믿게 되니까).

테스트는 **모든 것을 덮으려 하지 않는다.** 틀렸을 때 **아무 소리도 나지 않는 것**만 고른다 — 익명 작성자가 새는 것, 봉인된 키가 새는 것, 심사 대기 프로필이 보이는 것, owner가 0명인 공간이 만들어지는 것. 이런 건 화면도 멀쩡하고 에러도 없어서 아무도 모른 채 몇 달이 간다. 반대로 깨지면 즉시 시끄러운 것(RPC가 없다, 컬럼이 없다)은 테스트가 없어도 된다.

| 파일                   | 픽스처 | 내용                                                        |
| ---------------------- | ------ | ----------------------------------------------------------- |
| `00-privileges.sql`    | 없음   | public 스키마 전체의 권한 불변식 (아래)                     |
| `01-identity.sql`      | 있음   | Auth trigger, 프로필 생애주기, 승인 큐, 열쇠고리            |
| `02-spaces.sql`        | 있음   | 공간 생성·가입 정책·영구 삭제, **owner 불변식**(아래)       |
| `03-content.sql`       | 있음   | 글·댓글 읽기 RPC, 익명 라벨, tombstone                      |
| `05-chat.sql`          | 있음   | 그룹 평문 계약 + 1:1 종단간 암호화 계약                     |
| `06-notifications.sql` | 있음   | 읽기 RPC의 상한 계약                                        |
| `09-storage.sql`       | 없음   | 정리 큐, 버킷 allowlist가 MIME 레지스트리와 어긋나지 않는지 |
| `10-rls.sql`           | 있음   | **RLS를 실제로 태운다** (아래)                              |

`04-reactions.sql`·`07-utilities.sql`·`08-clubs.sql`에는 테스트가 없다. 다만 `00-privileges.sql`의 전수 검사는 이 도메인들도 함께 훑는다 — RLS가 꺼지거나 정책이 쓰는 헬퍼가 grant를 잃으면 거기서 걸린다.

### `00-privileges.sql` — 카탈로그 불변식

도메인 파일이 아닌 이유: 그 검사들은 채팅 얘기도 공간 얘기도 아니라 **`supabase db diff`가 권한을 보지 못한다**는 하나의 실패 유형을 잡는다(위 워크플로 3번). 도메인 픽스처 사이에 묻어두면 정작 도메인 하나를 손볼 때 눈에 들어오지 않는다.

여기 있는 검사는 전부 **전수 검사**다 — 목록을 손으로 들고 있지 않는다. RLS 정책이 참조하는 `private` 헬퍼는 `pg_policy`의 정책 본문에서 직접 캐낸다. 손 목록을 쓰면 그 목록에서 빠지는 것이 정확히 이 파일이 잡으려는 실수와 같은 종류가 되기 때문이다(실제로 `has_permission`과 `is_club_round_open`이 빠져 있었고, 둘 다 grant를 잃어도 녹색이었다). 같은 이유로 "security definer인데 `search_path`를 고정하지 않은 함수", "RLS가 꺼진 public 테이블"도 카탈로그를 훑어서 본다.

### `10-rls.sql` — RLS를 실제로 태우는 유일한 파일

나머지 테스트는 전부 `postgres`로 도는데, `postgres`는 이 테이블들의 **소유자**라 RLS를 통째로 건너뛴다(`FORCE ROW LEVEL SECURITY`를 켠 테이블이 없다). 그래서 `set local role authenticated`로 갈아타지 않으면 스키마의 정책은 **단 한 번도 평가되지 않는다** — `spaces_select`를 `using (true)`로 바꿔도 전 테스트가 녹색이다.

`00-privileges.sql`은 카탈로그를 읽어 "grant 엔트리가 없다"까지 말하고, 이 파일은 실제로 그 롤이 되어 쿼리를 쏴서 "정말로 못 읽는다"를 말한다. 익명성과 열쇠고리를 지키는 것은 후자다.

### 하네스의 한계

`private.require_service_role()`은 `session_user`가 `postgres`면 통과시킨다. 테스트가 `psql -U postgres`로 돌고 `set session authorization`은 소유자 권한으로 불가능하므로, **service_role 게이트가 거절하는 것을 확인할 방법이 없다.** 그 게이트를 쓰는 RPC(`purge_due_spaces`, `soft_delete_space`, storage cleanup 등)는 "호출되면 동작한다"까지만 검증된다.

종단간 암호화는 `app/lib/crypto/e2ee.integration.test.ts`가 진짜 키로 진짜 DB를 왕복시킨다 — `npm test`에 포함되며 로컬 Supabase가 없으면 알아서 skip한다.

## Production 배포

원격 DB는 2026-07-07 전환 이전 migration 이력을 갖고 있다. 최초 배포 시 `supabase db reset --linked`(pre-launch, 보존할 데이터 없음 전제) 또는 `supabase migration repair`로 baseline과 이력을 맞춘 뒤, 이후부터 일반 `supabase db push`를 사용한다.

### 배포 순서: **DB 먼저, 프론트 나중에**

`supabase db push`가 성공한 것을 확인한 **뒤에** 프론트를 배포한다. 순서가 뒤집히면 새 프론트가 아직 없는 RPC를 부르는데, 로그인은 이게 특히 나쁘다: Supabase Auth 세션은 정상 수립되어 **쿠키까지 심어진 뒤** `get_my_key_vault`가 "함수 없음"으로 죽는다. 사용자는 로그인된 것도 아니고 안 된 것도 아닌 상태에서 알 수 없는 오류만 본다.

반대 순서(DB 먼저)는 안전하다 — 새 RPC를 아직 아무도 안 부를 뿐이다.

### 배포 체크리스트 (코드로 관리되지 않는 것들)

`supabase/config.toml`은 **로컬 전용**이다. 아래는 운영 Supabase 대시보드에서 손으로 맞춰야 하고, 안 맞으면 조용히 실패한다.

| 항목                                               | 어디                     | 안 하면                                                                                                                                       |
| -------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Redirect URL** — 운영 도메인의 `/reset-password` | Auth → URL Configuration | 재설정 메일 링크가 `site_url`로 되돌아가 **비밀번호 재설정이 통째로 죽는다**. 비밀번호 재설정 흐름 전체가 여기 걸려 있다                      |
| **SMTP**                                           | Auth → SMTP Settings     | 재설정 메일이 아예 안 나간다                                                                                                                  |
| **`password_requirements`를 건드리지 말 것**       | Auth → Policies          | `authHash`가 소문자 hex라 문자 클래스 제약을 걸면 **가입·비밀번호 변경이 전부 거부된다**. 근거는 `app/lib/crypto/account.ts`의 `PasswordKeys` |
