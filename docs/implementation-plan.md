# 남은 작업 계획

완료된 MVP·빌드 순서는 반복하지 않고, 아래 순서의 미완료 작업만 진행한다.

## 1. GROQ 기반 스테이징 증거 확보

- 운영 담당자가 직접 제공한 `GROQ_API_KEY`만 스테이징 시크릿으로 등록한다. 키를 문서, 저장소, 브라우저 번들에 기록하지 않는다.
- 스테이징에서 실제 제공자 호출 경로를 검증한다. 데모·목업·fallback 응답은 증거로 인정하지 않는다.
- 동일한 대표 요청으로 워밍업 10회 후, 동시성 5로 50회 호출을 수행한다.
- 모든 성공 응답에 `meta.source=groq`가 있어야 하며, 전체 호출의 p95 지연시간은 3초 이하여야 한다. 실패·타임아웃·제공자 불일치가 있으면 원인을 수정한 뒤 전체 측정을 다시 수행한다.

실행 전에 실제 provider-backed 측정 harness를 추가하거나, 이미 존재하는 실제 harness를 지정해 사용한다. 존재하지 않는 스크립트명이나 가상 결과를 검증 명령으로 문서화하지 않는다. harness는 다음 계약을 강제해야 한다: 워밍업 10회, 동시성 5의 본호출 50회, 모든 성공 응답의 `meta.source=groq`, p95 3초 이하.
검증 산출물에는 실행 시각, 대상 URL, 워밍업/본호출 수, 동시성, 성공·실패 수, p95, 응답별 `meta.source` 확인 결과를 남긴다.

## 2. 최종 동결 테스트·리뷰 게이트

- 1단계의 측정 산출물과 현재 배포 후보를 기준으로 최종 테스트와 코드·보안·설정 리뷰를 수행한다.
- 필수 시나리오, 오류 처리, 비밀값 노출 여부, 제공자 메타데이터, 배포 설정을 확인하고, 발견된 문제를 해결한 뒤 동일 검증을 재실행한다.
- 승인된 후보와 변경 범위를 동결한다. 동결 후 변경은 재리뷰와 재검증 없이는 배포하지 않는다.
- 최종 검증에 사용할 기존 명령은 다음과 같다.

```bash
npm test
npm run test:api
npm run test:pwa
npm run test:browser
node --check server.js
node --check api/index.js
node --check lib/local-db.js
node --check lib/supabase-db.js
```

## 3. 외부 서비스 마이그레이션 및 배포

- 대상 Supabase 프로젝트에 migration을 적용하고, backend가 해당 프로젝트의 외부 환경변수·권한·RLS 설정으로 동작하는지 확인한다.
- 외부 backend를 배포한 뒤 staging에서 API 연결과 데이터 기록을 확인한다.
- GitHub Pages에 frontend를 배포하고, Pages의 공개 URL에서 외부 backend 호출 및 주요 사용자 흐름을 확인한다. 비밀키는 frontend에 포함하지 않는다.

예시 검증 명령:

```bash
supabase link --project-ref <project-ref>
supabase db push
curl --fail https://<backend-host>/health
curl --fail https://<github-pages-host>/
```

## 4. 측정으로 판정하는 출시 후 최적화

- 출시 후 오류율, p95 지연시간, 제공자 성공률(`meta.source`), 핵심 흐름 전환율을 수집한다.
- 기준 기간과 개선 목표를 먼저 기록하고, 측정 결과가 목표 미달일 때만 병목에 한정해 최적화한다.
- 변경 전후 동일 지표로 비교해 개선이 확인된 변경만 유지하며, 악화되거나 근거가 부족한 변경은 되돌린다.
