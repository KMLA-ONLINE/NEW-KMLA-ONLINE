# 이미지 처리 정책

업로드되는 이미지를 **클라이언트에서 압축하고 WebP로 통일**하는 정책. 버킷·RLS·cleanup 같은 저장 계층은 [db/domains/09-storage.md](db/domains/09-storage.md)에 있고, 여기서는 반복하지 않는다 — 이 문서는 "바이트가 storage에 닿기 전"만 다룬다.

구현: [`app/lib/image/compress.ts`](../app/lib/image/compress.ts)(압축), [`app/lib/supabase/storage.ts`](../app/lib/supabase/storage.ts)의 `uploadImage`(업로드 문), [`eslint.config.js`](../eslint.config.js)(강제).

## 파이프라인

```
File ──compressImage(preset)──► WebP File ──uploadImage──► storage ──finalize_* RPC──► DB 컬럼
        (app/lib/image)                     (storage.ts)              (09-storage 참고)
```

압축과 업로드는 분리된 두 단계가 아니다. `compressImage`는 오직 `uploadImage` **안에서만** 불리고, `uploadImage`는 이미지 업로드의 유일한 통로다. 그래서 "압축을 빼먹고 올린다"는 조합이 코드에 존재하지 않는다 — 정책이 아니라 구조로 강제된다.

## 압축 정책

- **출력은 전부 WebP.** jpeg/png/webp 무엇이 들어와도 WebP로 재인코딩한다. 용량이 최선이고 타깃 브라우저가 전부 지원한다.
- **예외 1 — 비이미지 통과.** `file.type`이 `image/`로 시작하지 않으면(pdf/hwp/문서 등) 손대지 않고 원본 그대로 반환한다. post/message 버킷은 문서도 받는다.
- **예외 2 — 작은 이미지 원본 유지.** 재인코딩 결과가 원본보다 크면 원본을 쓴다. 이미 최적화된 작은 파일에서만 일어나고, 이 경우에만 WebP 통일이 깨진다(무해).
- **EXIF는 버린다.** 방향은 재인코딩에 이미 반영되므로 회전 정보가 필요 없고, 위치·기기 메타데이터는 프라이버시상 떨궈야 한다.
- **압축 실패는 업로드 실패가 아니다.** 어떤 이유로든 압축이 던지면 원본으로 진행한다 — 크기 상한은 어차피 버킷 정책이 막는다.

엔진은 `browser-image-compression`(웹워커 + 방향 처리 내장). 실제 압축은 canvas가 필요해 jsdom 단위 테스트에서 못 돌리므로, 테스트는 "비이미지 통과" 계약만 고정한다([compress.test.ts](../app/lib/image/compress.test.ts)).

### 프리셋

지점마다 이미지가 뜨는 크기가 달라 상한을 나눈다. 아이콘·아바타는 작게 떠서 512로 충분하고, 배너·피드 사진은 크게 보이므로 여유를 둔다. 프리셋은 유틸이 소유하고 호출부는 이름만 넘긴다(`compressImage(file, "avatar")`).

| preset         | 용도                   | maxEdge | maxSizeMB |
| -------------- | ---------------------- | ------- | --------- |
| `avatar`       | 프로필 사진            | 512     | 0.3       |
| `spaceImage`   | 스페이스 아이콘        | 512     | 0.3       |
| `profileCover` | 프로필 커버            | 1600    | 0.6       |
| `spaceCover`   | 스페이스 커버(배너)    | 1600    | 0.6       |
| `post`         | 게시글 첨부 사진       | 2048    | 1.5       |
| `message`      | 채팅 첨부 사진         | 2048    | 1.5       |

## 강제 — 왜 주석이 아닌가

주석은 "잊지 말고 압축을 불러라"는 부탁이고, 부탁은 언젠가 안 지켜진다. 두 겹으로 막는다:

1. **choke point.** 압축을 `uploadImage` 안에 박아 "압축 없이 이미지 업로드"를 부를 수 없게 한다. 빼먹을 단계 자체가 없다.
2. **lint.** 남은 위험은 "누가 `uploadImage`를 안 쓰고 raw `supabase.storage.from().upload()`를 직접 부르는가"다. `no-restricted-syntax`가 `storage.ts` 밖의 raw upload를 **빌드 에러**로 막는다. 예외는 두 곳뿐 — 유일한 문인 `storage.ts`, 그리고 storage를 직접 두드려 계약을 검증하는 테스트(E2EE 암호문 업로드 등, 압축 대상 아님).

**알려진 구멍**: lint는 인라인 체이닝(`…from(x).upload()`)을 잡는다. 변수로 쪼개면(`const b = …from(x); b.upload()`) 셀렉터가 못 잡는데, 이는 실수가 아니라 lint를 우회하려는 의도적 행위라야 발생한다. 완전 봉쇄가 필요해지면 브랜드 타입(`compressImage`만 만들 수 있는 타입만 `uploadImage`가 받게)으로 올린다.

## 경로 계약

object 이름은 호출부가 아니라 `uploadImage`가 `pathPrefix + v4 uuid`로 조립한다. prefix는 버킷 insert policy가 요구하는 접두사다(identity 버킷 `${auth_uid}/`, space 버킷 `${space.pub_id}/`). uuid를 함수가 붙여 storage의 `has_uuid_object_suffix` 계약을 by construction으로 만족시킨다. **확장자는 붙이지 않는다** — policy가 이름을 prefix+uuid와 정확히 대조하고, MIME은 이름이 아니라 object metadata로 판정한다. 경로 설계의 배경(익명성 때문에 post 첨부 경로에 uid를 넣지 않는 이유 등)은 [09-storage.md](db/domains/09-storage.md).

## 주의

- **E2EE 채팅은 압축 → 암호화 순서.** 1:1 대화 첨부는 암호문이라(전부 octet-stream) 압축이 불가능하다. 이미지라면 반드시 **암호화하기 전에** `compressImage`를 거쳐야 한다. 암호화 이후의 blob은 `compressImage`에 넣어도 비이미지로 통과할 뿐 줄지 않는다. E2EE 첨부 전반은 [e2ee.md](e2ee.md).
- **포맷 함정(현재는 버킷이 막음).** 애니메이션 GIF는 canvas 재인코딩에서 첫 프레임만 남고 정지 WebP가 된다. SVG는 벡터가 래스터로 굳는다. 지금은 두 타입 다 버킷 `allowed_mime_types`가 입구에서 거부해 무관하다. 나중에 받고 싶어지면 `compressImage`에 "이 타입은 통과" 예외를 먼저 추가할 것.
