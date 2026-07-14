# 00. Foundation

Source: [`supabase/schemas/00-foundation.sql`](../../../supabase/schemas/00-foundation.sql)

인스턴스 공통 기반: 확장 설치, default privilege 회수, `private` schema 생성. 그리고 도메인을 가로지르는 MIME 분류 registry.

## 내용

- 확장: `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp`, `pg_trgm`, `btree_gist`
- `postgres`가 만드는 public 객체의 default privilege에서 `anon`/`authenticated`/`service_role` 자동 부여를 회수 — 이후 모든 권한은 각 도메인 파일에서 명시적으로 부여한다.
- `private` schema 생성. RLS helper, trigger 함수, 내부 테이블이 여기 산다. `authenticated`/`service_role`에만 usage.

## 타입

- `attachment_kind` (`image`/`audio`/`video`/`file`) — 아래 `mime_types`가 쓴다.
- `notification_level` (`mention`/`all`) — 알림 피드(06-notifications)와 대화별 알림 설정(05-chat)이 공유한다. 둘 다 이 파일보다 나중에 적용되므로 여기 산다. **음소거는 level이 아니다** — `chat_notification_settings.muted_until` 참고.

## 테이블

- `mime_types` — `content_type` PK, `kind`(`public.attachment_kind`: `image`/`audio`/`video`/`file`). **분류는 표면과 무관하게 보편적이다** — `image/png`는 채팅 버블에서도 게시글에서도 이미지다. 그래서 여기 한 번만 적는다. 반면 *어떤 표면이 어떤 타입을 받아들이는가*와 *크기 상한*은 표면별 결정이라 그 도메인에 산다(`public.message_attachment_mime_types`). 03-content·05-chat보다 먼저 만들어져야 해서 foundation에 있다.
  - RLS select는 `accepted` 가 아니라 `authenticated` 전체에 열려 있다. `private.is_accepted_user()`가 01-identity에 정의돼 이 시점엔 없고, MIME 문자열 목록은 가릴 것이 없다.
  - 행은 seed라 migration에 있다.

## RPC

없음.

## Private helper

| 함수                                           | 용도                                                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `private.require_service_role()`               | 호출 컨텍스트가 service_role(또는 postgres 세션)이 아니면 예외. service 전용 RPC의 공통 가드                                                 |
| `private.has_uuid_object_suffix(name, prefix)` | storage object 이름이`prefix + v4 uuid` 형태와 정확히 일치하는지 검사. identity/storage/chat 경로 검증에서 공통 사용 (uuid 정규식 단일 정의) |
| `private.escape_like(text)`                    | 사용자 입력의 LIKE 메타문자(`% _ \`)를 무력화. `search_posts`/`search_messages`가 통과한다                                                   |
| `private.normalize_search(text)`               | **검색 정규화의 유일한 정의**: NFC → 소문자 → 공백 전부 제거. `immutable`이라 생성 컬럼에서도 쓴다                                           |

`normalize_search`가 여기 있는 이유: `posts.title_normalized`·`content_normalized`, `messages.content_normalized` 같은 **생성 컬럼**과 그 위의 trgm 인덱스, 그리고 `search_posts`/`search_messages`의 검색어가 전부 같은 규칙을 통과해야 한다. 규칙이 도메인마다 복붙되면 조금씩 어긋나고, 그 순간 인덱스와 검색어가 다른 문자열을 보게 된다. 클라이언트 쪽 짝은 `app/lib/crypto/message-search.ts`와 `app/lib/group/format.ts`이고, **이 함수와 같아야 한다** — 1:1 대화는 서버가 평문을 못 보므로 검색이 브라우저에서 돈다.

## Trigger

없음.
