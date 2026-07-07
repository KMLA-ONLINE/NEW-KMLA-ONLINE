
# AI Agent용 Supabase 마이그레이션 실행서

이 문서는 실제 Supabase migration 구현에 필요한 전체 실행 명세다. 다른 문서 없이 이 파일만 보고 작업한다.

---

## 실행 규칙

1. 아래 migration 순서를 변경하지 않는다.
2. 아래 실제 migration 파일을 순서대로 유지·수정한다. 새 단계가 필요한 경우에만 `supabase migration new {name}`으로 생성하고 타임스탬프를 직접 작성하지 않는다.
3. 테이블·컬럼·enum의 최종 정의는 이 문서의 데이터 모델 계약을 따른다.
4. 이 문서에 없는 객체·컬럼·권한·동작은 임의로 추가하지 않는다.
5. 기본적으로`ON DELETE CASCADE`를 사용하지 않는다.
6. 감사·원본 참조 보존 FK는 `ON DELETE SET NULL`, 나머지는 기본 `ON DELETE RESTRICT`로 구현한다.
7. public schema의 모든 테이블에 RLS를 활성화한다.
8. `anon`, `authenticated`, `service_role`, `PUBLIC` 권한은 필요한 객체에만 명시적으로 부여한다.
9. `SECURITY DEFINER` 함수는 `SET search_path = ''`와 함수 내부 권한 검사를 포함한다.
10. 모든 migration 적용 후 검증 절차를 실행한다.
11. 명시되지 않은 client 권한은 허용하지 않는다. 판단이 필요한 경우 권한을 추가하지 말고 작업을 중단한다.
12. SQL 예시보다 본문의 최종 계약이 우선한다. 같은 객체를 여러 section에서 다루면 뒤 section이 앞 section의 권한·제약·트리거를 완성한다.

---

## 생성 순서

| section | 실제 migration 파일                         | 주요 작업                                  |
| ------- | ------------------------------------------- | ------------------------------------------ |
| 00      | `20260611072414_remote_schema.sql`        | 기존 remote baseline                       |
| 01      | `20260612001825_foundation.sql`           | 기본 권한 회수, private schema, 확장, enum |
| 04      | `20260612001830_identity.sql`             | identity 테이블, Auth 생성 trigger, RLS    |
| 05      | `20260612120344_tables_spaces.sql`        | spaces, space_members                      |
| 06      | `20260612120411_tables_content.sql`       | posts, attachments, comments               |
| 07      | `20260612120414_tables_reactions.sql`     | reaction registry 및 reactions             |
| 08      | `20260612120417_tables_chat.sql`          | chat 전체 테이블                           |
| 09      | `20260612120420_tables_notifications.sql` | notifications                              |
| 10      | `20260612120424_tables_utilities.sql`     | gongangs, song_requests                    |
| 11      | `20260612120427_tables_clubs.sql`         | clubs 및 신청                              |
| 12      | `20260612120836_indexes.sql`              | 명시된 필수 인덱스                         |
| 13      | `20260612120839_constraints.sql`          | CHECK, unique, exclusion, FK               |
| 14      | `20260612120843_triggers.sql`             | 검증·동기화·캐시 트리거                  |
| 15      | `20260612121242_rpc_functions.sql`        | mutation/search/cleanup RPC                |
| 16      | `20260612121246_rls_and_grants.sql`       | RLS, helper, GRANT                         |
| 17      | `20260612121249_storage_buckets.sql`      | Storage, cleanup queue, jobs               |

---
