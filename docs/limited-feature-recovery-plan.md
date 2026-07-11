# 외부 배포·기능 복구 체크리스트

구현 설명이나 브라우저 데모 목록은 제외하고, 공개 배포 전에 운영자가 수행할 작업만 기록한다.

## 1. Node 백엔드 배포

- `server.js`를 HTTPS가 제공되는 백엔드(Render, Railway 등)에 배포한다.
- 시작 명령은 `node server.js`, 바인딩 주소는 `0.0.0.0`으로 설정한다.
- 플랫폼이 제공하는 `PORT`를 사용하고 `/health` 헬스 체크를 등록한다.
- 배포 후 `GET https://<backend-domain>/health`가 HTTP 200과 함께 다음을 반환해야 한다.
  - `ok: true`
  - `groqConfigured: true`
  - `supabaseDatabaseConfigured: true`

## 2. 비밀값 및 운영 환경 설정

백엔드 호스트의 Secret/Environment 설정에만 다음 값을 등록한다. 실제 값은 저장소, Pages 정적 파일, 공개 문서, 브라우저 설정에 넣지 않는다.

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=<platform-provided>
SESSION_COOKIE_SECURE=true
GROQ_API_KEY=<secret>
GROQ_MODEL=<current-provider-model>
GROQ_API_BASE_URL=<current-provider-api-base>
GROQ_MAX_TOKENS=<approved-limit>
SUPABASE_DB_ENABLED=true
SUPABASE_URL=<project-url>
SUPABASE_SERVICE_ROLE_KEY=<secret>
SUPABASE_SCHEMA=public
SUPABASE_MAX_ROWS=<approved-limit>
```

- `GROQ_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, 관리자 비밀번호와 `.env`는 서버에서만 읽히는지 확인한다.
- 로그, 오류 응답, 클라이언트 번들에 비밀값이 노출되지 않아야 한다.

## 3. 현재 Supabase 스키마·마이그레이션 적용

- 사용할 Supabase 프로젝트를 확정한다.
- 저장소의 현재 `supabase/schema.sql`과 `supabase/migrations/`를 기준으로 운영 DB에 적용한다. 이미 적용된 변경은 중복 실행하지 말고, 적용 순서와 성공 결과를 기록한다.
- 백엔드에는 `SUPABASE_URL`과 서비스 롤 키만 등록하고 서비스 롤 키는 브라우저에 전달하지 않는다.
- 적용 후 실제 운영 DB에서 계정·세션·팬트리·추천 이력에 필요한 테이블과 권한이 존재하는지 확인한다.

## 4. GitHub Pages API 연결 및 쿠키

분리된 Pages/API origin 배포는 현재 구현만으로 완료되지 않는다. `server.js`가 현재 동일 호스트 origin만 허용하고 세션·게스트 쿠키를 `SameSite=Lax`로 직렬화하므로, 아래 코드 변경과 테스트를 먼저 완료해야 한다. 가능하면 같은 origin으로 호스팅해 이 교차 사이트 복잡성을 피한다.

분리 origin을 선택할 때 남은 코드 작업:

- Pages 배포 설정에 `https://<backend-domain>`을 API base로 지정한다. API 키나 서비스 롤 키는 설정하지 않는다.
- 환경 설정으로 정확한 Pages origin(예: `https://tnstory01-svg.github.io`)을 받도록 CORS와 CSRF/origin 검증을 변경한다. 허용 목록 밖 origin은 거부하고, 허용 origin과 거부 origin 각각을 테스트한다.
- credentialed 요청 응답에 `Access-Control-Allow-Credentials: true`와 정확한 `Access-Control-Allow-Origin`을 추가하고, `OPTIONS` preflight를 처리하도록 변경한다. 허용 origin의 preflight 성공과 허용 목록 밖 preflight 거부를 테스트한다.
- 세션 쿠키와 게스트 쿠키 모두에 운영 설정 가능한 `SameSite=None; Secure`를 적용한다. 개발 환경 기본값과 운영 값을 각각 테스트하고, 두 쿠키의 `Set-Cookie` 속성을 검증한다.
- 위 CORS, CSRF/origin, credentialed preflight/응답 헤더, 두 쿠키 설정 변경을 실제 배포 전에 각각 회귀 테스트로 통과시킨다.
- Pages에서 API 요청이 백엔드로 향하고, 브라우저 응답에 서버 비밀값이 포함되지 않는지 확인한다.

## 5. 운영 확인

다음 시나리오를 별도 일반 사용자 계정으로 수행하고 결과를 기록한다.

1. Pages에서 회원가입·로그인·로그아웃을 수행한다. 새로고침 뒤에도 세션 상태가 유지되고, 로그아웃 후 보호 요청이 401이 되어야 한다.
2. 팬트리 항목을 추가·조회한 뒤 새로고침하고 다시 로그인해도 동일 항목이 남아 있어야 한다.
3. 현재 연결된 AI 제공자에 추천을 요청한다. 성공 응답이 반환되고 추천 이력이 저장되어야 하며, 제공자 키는 네트워크 응답에 없어야 한다.
4. 일반 사용자로 `/api/admin/*`에 직접 요청한다. 모든 관리자 기능이 401 또는 403이어야 하고 사용자 목록·차단 IP·역할 정보가 노출되지 않아야 한다.
5. 관리자 계정으로만 필요한 관리자 기능이 성공하는지 확인한다.

## 6. 롤백·안전 확인

- 배포 직전 현재 정상 백엔드 버전, Pages 버전, Supabase 스키마/마이그레이션 상태를 기록한다.
- 새 배포가 `/health` 실패, 인증 실패, 데이터 손실, 비밀값 노출을 일으키면 즉시 이전 백엔드와 Pages 버전으로 되돌리고, 호환되지 않는 DB 변경은 실행하지 않는다.
- 롤백 후 `/health`, 로그인, 팬트리 조회를 다시 확인한다.
- `.env`, `data/`, 실제 API 키, 실제 관리자 비밀번호가 추적 파일과 `public/`에 없고, 서비스 롤 키가 서버 환경 변수에만 존재하는지 최종 점검한다.
