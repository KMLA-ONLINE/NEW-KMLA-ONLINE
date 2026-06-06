# Supabase 로컬 개발 환경 설정 가이드

> remote(프로덕션) DB에 직접 붙여 개발하다가 **로컬 환경**으로 전환할 때 필요한 설정을 정리합니다.
> 로컬에서 마음껏 DB를 뜯어고쳐도 프로덕션에 영향이 가지 않도록 환경을 분리하는 것이 목표입니다.

---

## 1. 왜 필요한가

- 프로덕션 DB를 건드리지 않고 스키마 변경, 마이그레이션 실험, Auth 설정 변경 등을 안전하게 할 수 있음
- 팀 협업 환경과 유사한 워크플로우를 경험할 수 있음
- `supabase db pull` / `supabase db push`로 변경 내역을 migration 파일로 관리 가능

---

## 2. 전제 조건

아래 중 하나를 설치하세요:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (macOS, Windows, Linux)
- [Rancher Desktop](https://rancherdesktop.io/) (macOS, Windows, Linux)
- [Podman](https://podman.io/) (macOS, Windows, Linux)
- [OrbStack](https://orbstack.dev/) (macOS)

---

## 3. Supabase CLI 설치

공식 문서: [CLI Quickstart](https://supabase.com/docs/guides/local-development?queryGroups=package-manager&package-manager=brew#quickstart)

```bash
supabase --version
```

최신 버전이 아니라면 업데이트하세요. 버전 차이로 인한 버그를 피하기 위해 항상 최신 CLI를 권장합니다.

---

## 4. 로컬 Supabase 초기화 및 실행

```bash
supabase init
```

`supabase/` 디렉토리와 `config.toml` 등이 생성됩니다. 이 `config.toml`이 로컬 환경 설정의 핵심입니다.

```bash
supabase start
```

실행이 완료되면 터미널에 아래와 같은 정보가 출력됩니다:

| 서비스 | 주소 |
|---|---|
| API URL | `http://127.0.0.1:54321` |
| Studio | `http://127.0.0.1:54323` |
| anon key | (로컬 전용 값) |
| service_role key | (로컬 전용 값) |

> 이 값은 **로컬 전용**입니다. remote 프로젝트의 키와 혼동하지 마세요.

---

## 5. 원격 프로젝트 연결

로컬에서 작업한 내용을 프로덕션 DB와 비교하려면 remote 프로젝트를 연결해야 합니다.

### 5.1 로그인

```bash
supabase login
```

브라우저가 열리면 토큰을 복사해서 터미널에 붙여넣습니다.

### 5.2 프로젝트 연결

```bash
supabase link
```

터미널에 프로젝트 목록이 뜨면 연결할 프로젝트를 선택하고, DB 비밀번호를 입력합니다.

> **실패 시**: `config.toml`의 일부 값이 remote와 달라서 링크가 실패할 수 있습니다.
> 터미널에 `- enroll_enabled = false` / `+ enroll_enabled = true` 같은 diff가 출력되면,
> `-`가 붙은 값을 `+`가 붙은 값으로 `config.toml`에서 수정한 후 `supabase link`를 다시 실행하세요.

---

## 6. 환경 변수 교체 (remote → local)

로컬 개발을 시작하면 remote 프로젝트의 키는 더 이상 유효하지 않습니다.
아래 명령어로 로컬 키를 확인하세요:

```bash
supabase status
```

`.env.local` 파일에서 다음 값을 교체합니다:

| 변수 | remote 값 | local 값 |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | `http://127.0.0.1:54321` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | remote anon key | `supabase status`의 local anon key |
| (필요시) service_role key | remote secret | `supabase status`의 local service_role key |

> 배포 환경에서는 remote 값을 사용해야 하므로, 환경 변수는 반드시 `.env` 파일로 분리해서 관리하세요.

변경 후 컨테이너를 재시작합니다:

```bash
supabase stop
supabase start
```

---

## 7. Studio 확인

[http://127.0.0.1:54323](http://127.0.0.1:54323) 에 접속하면 로컬 DB를 Studio에서 관리할 수 있습니다.

이미 remote DB에 스키마 변경사항이 있다면 아래 명령어로 로컬로 가져오세요:

```bash
supabase db pull                    # public 스키마
supabase db pull --schema auth      # auth 스키마 (RLS 정책 등)
```

---

## 8. OAuth (Google) 로컬 설정

> remote 환경에서 이미 Google OAuth를 사용 중이고, 이를 로컬에서도 동작하게 하는 방법입니다.
> 초기 설정이 필요하다면 [Supabase Social Login 문서](https://supabase.com/docs/guides/auth/social-login)를 참고하세요.

공식 문서: [Use Auth Locally](https://supabase.com/docs/guides/local-development/overview#use-auth-locally)

### 8.1 config.toml 설정

`supabase/config.toml`에서 Google OAuth를 활성화합니다:

```toml
[auth.external.google]
enabled = true
client_id = "env(GOOGLE_CLIENT_ID)"
secret = "env(GOOGLE_CLIENT_SECRET)"
redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"
```

> `client_id`와 `secret`은 평문으로 적지 말고 `env(...)`로 참조하세요.
> `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 환경 변수를 로컬에 설정해야 합니다.

### 8.2 환경 변수 설정

`.env.local` 또는 셜 환경 변수에 추가:

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 8.3 Google Cloud Console — OAuth 클라이언트 수정

Google Cloud Console > APIs & Services > Credentials > OAuth 클라이언트 편집:

- **Authorized JavaScript origins**: `http://localhost` 추가
- **Authorized redirect URIs**: `http://127.0.0.1:54321/auth/v1/callback` 추가

> remote 환경의 redirect URI (`https://<ref>.supabase.co/auth/v1/callback`)는 별도로 유지됩니다.
> 로컬용 URI를 **추가**하는 것이지, 기존 URI를 지우면 안 됩니다.

### 8.4 재시작 및 RLS 동기화

```bash
supabase stop
supabase start
supabase db pull --schema auth
```

---

## 9. 자주 실수하는 지점

| 상황 | 설명 |
|---|---|
| `supabase link` 실패 | `config.toml`의 설정이 remote와 불일치. 터미널 diff를 보고 맞춘 후 재시도 |
| 로컬에서 auth가 안 됨 | Google Cloud Console에 `http://127.0.0.1:54321/auth/v1/callback`이 등록되었는지 확인 |
| "Keys don't match" | `.env.local`에 아직 remote 키가 남아있음. `supabase status`로 local 키로 교체 |
| Studio가 안 열림 | `supabase start`가 정상 종료되었는지 확인. Docker 데스크탑이 실행 중인지 확인 |
| migration 충돌 | `supabase db pull`로 최신 상태 유지 |

---

## 10. 참고 링크

- [Supabase Local Development 공식 문서](https://supabase.com/docs/guides/local-development)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli/introduction)
- [Supabase Auth — Social Login (Google)](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase CLI GitHub Releases](https://github.com/supabase/cli/releases)
