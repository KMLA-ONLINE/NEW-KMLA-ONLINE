# 00. Foundation

Source: [`supabase/schemas/00-foundation.sql`](../../../supabase/schemas/00-foundation.sql)

인스턴스 공통 기반: 확장 설치, default privilege 회수, `private` schema 생성. 도메인 객체는 없다.

## 내용

- 확장: `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp`, `pg_trgm`, `btree_gist`
- `postgres`가 만드는 public 객체의 default privilege에서 `anon`/`authenticated`/`service_role` 자동 부여를 회수 — 이후 모든 권한은 각 도메인 파일에서 명시적으로 부여한다.
- `private` schema 생성. RLS helper, trigger 함수, 내부 테이블이 여기 산다. `authenticated`/`service_role`에만 usage.

## RPC

없음.

## Private helper

| 함수 | 용도 |
| --- | --- |
| `private.require_service_role()` | 호출 컨텍스트가 service_role(또는 postgres 세션)이 아니면 예외. service 전용 RPC의 공통 가드 |
| `private.has_uuid_object_suffix(name, prefix)` | storage object 이름이 `prefix + v4 uuid` 형태와 정확히 일치하는지 검사. identity/storage/chat 경로 검증에서 공통 사용 (uuid 정규식 단일 정의) |

## Trigger

없음.
