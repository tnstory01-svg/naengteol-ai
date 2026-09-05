# 배포 설정

## Vercel

현재 서비스는 <https://hackerton-project1.vercel.app/>이며 저장소는 <https://github.com/tnstory01-svg/naengteol-ai>의 `main`이다. `public/`의 프론트와 `api/index.js`의 Node 함수를 같은 배포에서 제공한다. `vercel.json`은 `/api/*`와 `/health`를 함수로 전달한다.

`public/runtime-config.js`의 `NAENGTEOL_API_BASE_URL`은 빈 값으로 유지한다. 브라우저가 현재 Vercel 주소의 `/api/*`를 호출하므로 별도 백엔드 주소나 교차 사이트 쿠키가 필요하지 않다.

Vercel 프로젝트의 서버 환경 변수:

```text
NODE_ENV=production
SESSION_COOKIE_SECURE=true
SUPABASE_DB_ENABLED=true
SUPABASE_URL=<project-url>
SUPABASE_SERVICE_ROLE_KEY=<server-secret>
SUPABASE_SCHEMA=public
SUPABASE_MAX_ROWS=5000
```

같은 주소에서 프론트와 API를 제공할 때 `FRONTEND_ORIGIN`은 비워도 된다. 별도 프론트가 필요할 때만 정확한 HTTPS origin을 설정한다. 관리자 초기 계정이 필요하면 `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_DISPLAY_NAME`을 서버 환경에만 설정한다.

**Groq는 현재 의도적으로 제외한다.** `GROQ_API_KEY`와 `GROQ_MODEL`을 비워 두고 기존 fallback 추천을 사용한다. 키 등록이나 실제 제공자 호출을 배포 선행 조건으로 삼지 않는다. `.env`, 서비스 롤 키, 관리자 비밀번호는 저장소·프론트·문서에 넣지 않는다.

Vercel 함수의 파일시스템은 영구 DB 저장소로 사용할 수 없다. [Vercel 런타임 문서](https://vercel.com/docs/functions/runtimes)에 따르면 일반 파일시스템은 읽기 전용이며 `/tmp`는 임시 공간이다. 이 앱은 production 또는 `VERCEL=1`일 때 Supabase를 요구하며 `/tmp`나 메모리 DB로 대체하지 않는다.

## DB 준비와 진단

신규 DB에는 `supabase/schema.sql`을 적용한다. 기존 DB는 `supabase/migrations/`의 적용 이력을 먼저 확인하고 미적용 변경만 순서대로 반영한다. 이미 적용된 스키마를 무작정 재실행하지 않는다.

현재 후속 파일은 `supabase/migrations/202607110001_guest_selection_merge.sql`이다. 적용에 사용한 배포 기록 또는 SQL 실행 기록에서 이 파일의 실행 여부를 확인한다. 이력을 확인할 수 없다면 운영 스키마와 파일을 대조하기 전에는 적용하지 않는다. 이 저장소는 마이그레이션을 자동 실행하지 않는다.

`GET /health`가 200이고 다음을 반환해야 한다:

```json
{
  "ok": true,
  "groqConfigured": false,
  "aiProvider": "fallback",
  "supabaseDatabaseConfigured": true,
  "localDbConfigured": false
}
```

헬스 체크는 `app_users`에서 ID 최대 1행을 조회한다. 이는 연결·해당 테이블 조회 권한 확인이며, 전체 스키마·쓰기·회원가입·병합 검증을 대신하지 않는다. [기능 복구 체크리스트](limited-feature-recovery-plan.md)의 실제 저장·재조회까지 확인한다.

503 응답의 `details`에 `code`, `requestId`, `path`, `retryable`을 제공한다. 같은 요청 ID로 서버 로그를 찾는다.

| 코드 | 대응 |
| --- | --- |
| `DATABASE_CONFIGURATION_REQUIRED` | Supabase 활성화 여부와 URL·서비스 롤 키 설정을 확인한 뒤 재배포한다. |
| `DATABASE_INITIALIZATION_FAILED` | DB 초기화와 관리자 초기 계정 설정을 확인한다. 원인 수정 후 다음 요청에서 재시도한다. |
| `DATABASE_UNAVAILABLE` | 프로젝트 연결, 테이블·권한·키 상태를 확인한다. 재시도 불가이면 설정을 먼저 수정한다. |

`retryable=false`이면 같은 요청을 반복하기 전에 설정·권한 원인을 수정한다. 외부 DB 오류 본문이나 비밀값은 진단 응답·로그로 전달하지 않는다. 네트워크 요청과 응답 읽기는 10초 제한을 사용한다.

요청 본문은 일반 Node 스트림과 [Vercel의 `request.body` helper](https://vercel.com/docs/functions/runtimes/node-js#request-body)를 모두 지원한다. JSON 형식과 바이트 크기 제한은 두 경로에 동일하게 적용한다.

## 로컬 실행

```bash
node server.js
```

<http://localhost:3000>에서 사용한다. 로컬 개발·테스트에서는 Supabase가 구성되지 않으면 `LOCAL_DB_PATH` 또는 `./data/app.db.json`을 사용한다. `data/`는 Git 추적 대상이 아니다. Groq 없이도 fallback 추천, 게스트·계정·재료·선택 내역 흐름을 검사할 수 있다.

## 대체 호스팅

Render는 `render.yaml`과 `Dockerfile`, Railway는 `railway.toml`을 사용한다. `node server.js`, `HOST=0.0.0.0`, 플랫폼의 `PORT`, `/health`를 설정하고 위 서버 환경 변수를 적용한다. Groq 환경 변수는 등록하지 않는다.

GitHub Pages는 선택 가능한 정적 배포 경로다. 사용할 경우 외부 Node 백엔드를 먼저 준비하고 `PUBLIC_API_BASE_URL=https://<backend-host> npm run configure:pages`로 runtime 설정을 생성한다. 백엔드에는 정확한 `FRONTEND_ORIGIN`과 보안 쿠키 설정이 필요하다. 현재 Vercel 배포에는 이 명령을 실행하지 않는다.
