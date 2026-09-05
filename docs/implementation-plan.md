# 구현 및 배포 계획

요청 해석(2026-09-05): Groq는 키 유출 우려로 의도적으로 제외한 상태를 유지한다. Vercel 배포를 확인하고 나머지 기능을 구현·검증한 뒤 GitHub에 커밋·푸시한다.

- 서비스: <https://hackerton-project1.vercel.app/>
- 저장소: <https://github.com/tnstory01-svg/naengteol-ai>, `main`
- 배포 구성과 환경 변수: [배포 설정](deployment.md)
- Groq 키 등록, 실제 API 호출, 성능 측정은 보류한다. 기존 `fallback` 추천을 검증하며 실제 AI 응답으로 표현하지 않는다.

## 1. 배포 오류 복구

- [x] 원격 README 변경을 기존 로컬 커밋과 병합한다.
- [x] 미완료 DB CRUD 정리와 화면 코드 정리를 회귀 검증한다.
- [x] DB 초기화 실패를 구조화된 503 응답으로 처리하고 다음 요청에서 재시도한다. 정적 화면은 DB 실패와 독립적으로 제공한다.
- [x] production 및 Vercel에서 Supabase를 요구한다. 설정 누락·연결 실패 시 로컬 JSON으로 전환하지 않는다.
- [x] DB 오류 응답·로그에 요청 ID, 경로, 오류 코드, 재시도 가능 여부를 남기고 외부 오류 본문·비밀값은 제외한다.
- [x] `/health`에서 실제 Supabase 최소 조회를 수행한다. 연결 실패를 DB 준비 완료로 표시하지 않는다.
- [x] Vercel이 미리 읽은 요청 본문도 처리하고 JSON·바이트 크기 제한을 검증한다.
- [ ] 변경 커밋을 `main`에 푸시하고 연결된 Vercel 배포 결과를 확인한다.
- [ ] 운영 Supabase 설정·스키마를 확인하고 `/health`와 API 복구를 실측한다.

수정 전 관찰(2026-09-05): `/`는 HTML을 반환했지만 `/health`는 `500 FUNCTION_INVOCATION_FAILED`, `/runtime-config.js`는 404였다. 공개 응답만으로 500의 원인을 확정하지 않는다. 원격 배포는 `d09e4db`였으며 로컬 후속 커밋은 포함하지 않았다.

## 2. 핵심 흐름 검증

- 게스트 재료 생성·수정·삭제, 소유자 격리, CSRF를 확인한다.
- Groq 키 없이 추천 3개를 받고 메뉴를 선택한다. 중복 선택을 방지하고 선택한 메뉴만 절약 내역에 반영한다.
- 회원가입 시 게스트 데이터를 병합한다. 로그인·새로고침 후 재료와 선택 내역이 유지되고 로그아웃하면 보호 요청은 거부되어야 한다.
- 일반 사용자에게 관리자 데이터가 노출되지 않는지 확인한다.
- 모바일 360/390px에서 주요 흐름과 생활도구 저장을 확인한다.
- 로컬·대체 서버 테스트와 실제 Vercel/Supabase 검증을 구분한다. 운영 검증은 [기능 복구 체크리스트](limited-feature-recovery-plan.md)를 따른다.

## 3. 커밋 전 검증

```bash
npm test
npm run test:api
npm run test:pwa
npm run test:browser
node --check server.js
node --check api/index.js
node --check lib/local-db.js
node --check lib/supabase-db.js
node --check public/app.js
git diff --check
```

Windows PowerShell에서 실행 정책으로 `npm.ps1`이 막히면 `npm.cmd`를 사용한다. 브라우저 실행기의 서버 종료가 지연되면 별도 로컬 서버를 실행하고 `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000`을 지정한다.

검증 기록(2026-09-05): DB·스키마 24개, API·배포 진입점 23개, PWA 5개, 브라우저 14개 통과. 구문 검사와 `git diff --check`도 통과했다. 브라우저 병렬 실행에서 버튼 탐색 시간 초과 1건이 있었으며 해당 검사 재실행과 최종 전체 단일 worker 실행은 통과했다(14개, 27.8초). 실제 Supabase 연결·운영 저장 검증은 이 결과에 포함하지 않는다.

## 4. 운영 확인 후 최적화

[DB·쿼리 최적화 계획](db-query-optimization-plan.md)에 따라 기준선을 먼저 수집한다. 측정되지 않은 쿼리·캐시·프레임워크 변경은 진행하지 않는다. Groq 관련 측정은 사용자가 재연결을 요청할 때 별도로 재개한다.
