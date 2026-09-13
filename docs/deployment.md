# 배포 설정

## Vercel

현재 서비스는 <https://hackerton-project1.vercel.app/>이며 저장소는 <https://github.com/tnstory01-svg/naengteol-ai>의 `main`이다. 현재 운영 배포의 소스·검증 상태는 [구현 및 배포 기록](implementation-plan.md)을 확인한다. `public/`의 프론트와 `api/index.js`의 Node 함수를 같은 배포에서 제공한다. `vercel.json`은 `/api/*`와 `/health`를 함수로 전달한다.

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

후속 변경은 [게스트 스키마](../supabase/migrations/202607110001_guest_selection_merge.sql)와 [보안·세션 정리 수정](../supabase/migrations/202609080001_security_cleanup.sql)이다. 먼저 [읽기 전용 SQL 점검](../supabase/security-audit.sql)과 `npx supabase migration list`로 적용 이력을 확인한다. SQL 점검 파일은 SQL 편집기에서 각 조회 결과를 확인한다. CLI Management API 경로는 마지막 조회 결과만 반환하므로 필요한 조회를 개별 실행한다. 운영 스키마가 준비된 경우 `npx supabase db push --dry-run`으로 미적용 변경을 확인한 뒤 적용한다. 최초 게스트 마이그레이션은 모호한 소유권 데이터를 격리하므로 이력 확인 없이 다시 실행하지 않는다. `db reset`이나 스키마 전체 재실행은 연결 복구 절차가 아니다. 이 저장소는 마이그레이션을 자동 실행하지 않는다.

보안 수정은 앱 테이블의 RLS를 활성화하고 `PUBLIC`, `anon`, `authenticated`의 직접 테이블·RPC 접근을 차단하며 서버용 `service_role` 권한을 유지한다. 앱은 자체 세션을 검증하는 서버를 통해 DB를 이용한다. 병합 기록이 참조하는 게스트 세션은 감사 기록을 보존하기 위해 남긴다. 정리 함수는 병합 중 잠긴 세션을 건너뛴다. 별도의 기록 보존 기간이나 영구 삭제 정책은 추가하지 않는다.

`npm run test:sql`은 PGlite PostgreSQL 18에서 기존 권한 누락과 외래키 정리 실패를 재현한 뒤, 수정 적용·재적용·역할별 접근·데이터 보존·병합 재시도를 검증한다. `pgcrypto` 설치문만 생략하고 엔진 내장 `gen_random_uuid()`를 사용한다. 운영 Supabase의 실제 버전, 확장, 동시 연결, 마이그레이션 적용 여부와 PostgREST 캐시는 별도로 검증해야 한다.

Supabase CLI는 `npx supabase login`, `npx supabase link --project-ref uoqzntvgtqpseyffjonu`로 인증·연결한다. `supabase init`은 로컬 설정 생성이며 DB 초기화가 아니다.

제공된 `startAuthorization('connect/hackerton-project1', { subject: { type: 'user', id: 'usr_123' } })` 호출은 Vercel Connect 인증 요청이다. [SDK 문서](https://github.com/vercel/vercel/tree/main/packages/connect)에 따라 프로젝트 OIDC 인증이 필요하며 Vercel 관리 계정 로그인 자체를 대신하지 않는다. 로컬에서는 Vercel 로그인·프로젝트 연결과 OIDC 준비가 선행돼야 한다. 이번 점검은 운영자 연결 용도로 실행했으며 사용자 화면이나 기존 로그인 흐름에 새 기능을 삽입하지 않았다. 앱 사용자 기능으로 도입한다면 예시 ID를 실제 서버 검증 사용자 ID로 대체해야 한다.

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
| `ADMIN_CONFIGURATION_INVALID` | `details.fields`에 표시된 관리자 환경 변수의 형식·비밀번호 정책을 수정하거나, 초기 계정 생성이 필요 없으면 관리자 이메일·비밀번호를 둘 다 제거하고 재배포한다. |
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
