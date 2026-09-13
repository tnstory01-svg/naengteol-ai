# 재료·요리 콘텐츠 개선

Understood as (2026-09-13): 영문 페이지와 본격적인 프론트 개편 전에 기존 식재료·요리 자료를 인터넷 출처 및 DB 구조·저장 내용과 대조해 수정하고, 재료별 내용을 별도 HTML 상세 페이지로 제공한다. 이전 콘텐츠 품질 작업의 마무리·검증·운영 반영까지 이어간다. 144개 전체 메뉴의 내용 텍스트 대조는 Sol이 2026-09-13 완료했으며, 조리 시험은 수행하지 않았다. 운영 배포 반영은 아직 미완료다. Git commit·push는 보류하고 Groq 호출·설정은 계속 제외한다. 계획·출처 검토는 root, 구현은 Sol high, 반복 점검·디버깅은 Luna max가 담당한다.

## 수정 범위와 완료 조건

- 기존 음식 카탈로그의 모든 재료 ID를 유지하며, 각 재료의 보관·손질 정보와 요리 안내를 검토한다.
- 모든 메뉴에 실제 메뉴에 맞는 재료량, 조리도구, 순서와 완료 기준을 제공한다. 조리·시험으로 검증하지 않은 시간과 분량은 앱의 조리안으로 명시한다.
- 카탈로그의 추천 조합, 사용자 입력, 실제 DB 보유 재료를 구분한다. 필요한 재료가 보유·부족 목록에 동시에 나타나지 않아야 한다.
- 서버 기본 추천도 보유하지 않은 필수 재료를 명시하고, 희망 시간에 맞추려고 실제 조리 시간을 숫자만 줄이지 않는다.
- 별도 목록·상세 HTML을 추가하고 기존 재료 선택 화면에서 이동하도록 연결한다. 직접 URL 접근, 알 수 없는 ID, 검색 결과 없음, 모바일 화면을 확인한다.
- 기존 사용자·재료·추천·선택 이력을 보존하고, 새로운 추천의 저장·조회가 계속 작동하는지 확인한다.

## 출처 대조 · 2026-09-12 열람

외부 자료는 아래 명시된 주장에 대한 근거다. 식품안전 출처가 앱의 모든 메뉴 조합·맛·조리 시간을 검증했다는 뜻은 아니다. 특정 상품의 보관·조리 조건은 포장 표시를 우선 확인한다. 해외 권고를 국내 법정 기준으로 표기하지 않는다.

| 자료 | 확인한 내용 | 적용할 수정 |
| --- | --- | --- |
| [FoodSafety.gov 최소 중심온도](https://www.foodsafety.gov/food-safety-charts/safe-minimum-internal-temperatures) | 가금류·남은 음식 74°C, 달걀 요리 71°C, 달걀 흰자·노른자를 단단하게 익힘 | 재료 상태에 맞는 익힘 기준 추가. 단순 조리 시간으로 안전을 보장하지 않음 |
| [FoodSafety.gov 네 가지 식품안전 수칙](https://www.foodsafety.gov/keep-food-safe/4-steps-to-food-safety) | 냉장 4°C 이하·냉동 −18°C 이하, 부패하기 쉬운 음식은 2시간 내 냉장(32°C 초과 환경 1시간), 얕은 용기, 냉장 해동, 채소 세척, 냉동 가공식품 표시대로 조리 | 생재료와 가공·완전조리 제품 구분, 요거트 등 비가열 메뉴에 일률적인 볶기 단계 제거 |
| [FoodSafety.gov 냉장 보관표](https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts) | 식품 종류·상태에 따라 보관 기간이 다름 | 원재료와 조리 반찬에 동일한 유통·보관 기간을 적용하지 않음 |
| [USDA 상온 보관 식품 안내](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/shelf-stable-food) | 통조림은 서늘하고 건조한 곳, 개봉 후 냉장. 생선·고기 등 저산성 통조림 개봉 후 냉장 3~4일. 용기 이동은 품질 유지에 도움 | 개봉 전후 구분. 캔에 보관하면 무조건 독성이 생긴다는 설명을 만들지 않음 |
| [FSA 가정 식품 사실 확인](https://www.gov.uk/government/publications/home-food-fact-checker/home-food-fact-checker) | 조리한 밥은 빨리 식혀 가능하면 1시간 내 냉장, 24시간 내 섭취, 재가열 한 번. 소비기한 식품은 냄새만으로 안전 판단 불가. 달걀 부유 검사는 안전 검사 아님 | 개봉하지 않은 즉석밥과 조리한 남은 밥 구분. 냄새·부유 검사로 소비기한 연장하지 않음 |
| [BfR 감자 안내](https://www.bfr.bund.de/en/press-release/solanine-in-potatoes-green-and-strongly-germinating-potato-tubers-should-be-sorted-out/) | 감자는 서늘하고 어둡고 건조한 곳. 녹색·심하게 싹이 난 감자는 섭취하지 않음 | 감자 상태 확인과 보관 안내. 가열하면 무조건 안전하다는 문구 금지 |
| [Maangchi 김치볶음밥](https://www.maangchi.com/recipe/kimchi-bokkeumbap) | 김치를 먼저 볶은 뒤 조리된 밥과 섞고 참기름으로 마무리 | 밥·김치를 필수 재료로 명시하고 조리 순서 구체화. 앱 분량은 별도 조정안 |
| [Korean Bapsang 두부김치](https://www.koreanbapsang.com/dubu-kimchi-tofu-with-stir-fried-kimchi/) | 두부를 별도로 데워 볶은 김치와 곁들임 | 두부와 김치 중 하나만 있어도 두부김치라고 표시하던 조건 수정. 앱의 고기 없는 간단 조리안은 원문과 구분 |
| [윤씨네키친 계란국](https://www.10000recipe.com/recipe/7044262) | 육수를 먼저 끓이고 달걀물을 넣어 모양이 잡힌 후 마무리 | 달걀 필수 표시, 물·간의 분량과 순서 안내. 원문 문구·사진 복제 없이 앱 조리안 작성 |
| [Maangchi 비빔국수](https://www.maangchi.com/recipe/bibim-guksu) | 면을 삶고 찬물에 헹궈 물기를 뺀 뒤 양념과 버무림 | 비빔국수와 볶음면 조리 단계 구분 |
| [Barilla 파스타 조리 안내](https://www.barilla.com/en-us/help-with/pasta-kitchen-tips/how-to-cook-pasta) | 끓는 물에서 포장 시간대로 삶고, 면수를 남기고, 헹구지 않은 면을 소스와 마무리 | 건면을 밥처럼 마지막에 넣고 섞는 오류 제거 |
| [Maangchi 감자전](https://www.maangchi.com/recipe/gamjajeon) | 간 감자의 물기를 걸러 가라앉은 전분을 섞고 얇게 부침 | 감자전의 반죽과 형태를 만드는 과정 구체화 |
| [Maangchi 계란말이](https://www.maangchi.com/recipe/gyeran-mari) | 약한 불에서 얇은 층을 말고 겉면을 돌려 익힘 | 계란말이의 반복·마무리 과정 구체화 |
| [미국 양파협회 보관 안내](https://www.onions-usa.org/onionista/how-to-store-an-onion/) | 통양파는 서늘하고 건조하며 통풍되는 곳, 껍질을 벗기거나 자른 양파는 냉장 | 통양파와 손질한 양파의 보관 조건 구분 |
| [네브래스카대 식품 보관 안내](https://food.unl.edu/free-resource/food-storage/) | 빵·건조식품·냉장 햄 등은 종류와 상태별 보관 방식이 다름 | 모든 개봉 식품을 일률적으로 냉장하던 초안 수정. 외국 제품 보관 기간을 한국 상품 소비기한으로 전용하지 않음 |

2026-09-13 추가 대조: [네브래스카대학교 식품 보관 안내](https://food.unl.edu/free-resource/food-storage/) 원문에서 4°C 냉장·제품 표시, 냉장 표시 캔햄과 조리된 냉장 햄, 일반 캔의 개봉 후 3~4일 안내를 재확인했다. `spam`의 캔·냉장 햄 구분 근거로 유지한다.

## 초기 발견

`public/app.js`의 카탈로그는 재료당 세 메뉴를 갖지만 상세 조리법은 모두 동일한 네 단계로 합성했다. `toFullCategoryRecipe`는 추천 조합과 추가 재료 전체를 보유 목록에 넣어, 일부 재료가 부족 목록에도 동시에 나타났다. `applySelectedCategoryToForm`도 추천 조합 전체를 입력했다.

`server.js` 기본 추천은 밥·김치 중 하나만 있어도 김치볶음밥, 두부·김치 중 하나만 있어도 두부김치로 표시했다. 달걀이 없는 경우에도 국 조리 단계에 달걀이 등장했다. 희망 시간이 짧으면 `Math.min`으로 표기 시간만 줄였다.

DB 스키마에서 `pantry_items`는 사용자 보유 재료이고, `recommendation_logs.ai_response`와 `menu_selections.recipe_snapshot`은 과거 추천·선택의 스냅샷이다. 독립된 레시피 마스터 테이블은 확인되지 않았다. 따라서 콘텐츠 원본을 수정하고 이후 추천에 반영하며, 과거 사용자의 기록을 덮어쓰지 않는다. 전체 카탈로그 및 로컬 DB 대조 결과는 [초기 목록 조사](content-inventory.md)에 기록한다.

## 운영 DB 대조 · 2026-09-12

연결된 Supabase의 `information_schema.tables`와 재료·메뉴명 및 개수만 읽기 전용으로 조회했다. 운영 `public`에는 13개 테이블이 있으며 별도 레시피 마스터는 없다. `pantry_items` 1건의 재료명은 계란, `recommendation_logs`는 11건, `menu_selections`는 0건이다. 계란은 카탈로그의 `egg`와 대응한다.

과거 추천에 등장한 메뉴명은 계란 김치 밥, 계란 김치 볶음밥, 계란 김치 토스트, 계란 볶음, 계란 토스트, 계란국, 김치볶음밥, 냉장고 재료 볶음밥, 단백질 냉장고 한 접시, 두부김치, 빠른 냉장고 국, 우동 계란 볶음, 우동 볶음, 우동 어묵 국물, 우동 어묵 볶음 덮밥, 우유 커피다. 이는 과거 추천의 다양성과 기본 추천 저장 경로를 확인하는 자료이며, 이름만으로 각 과거 요리법의 정확성을 검증한 것은 아니다. 이번 변경은 과거 추천을 현재 원본처럼 덮어쓰지 않는다.

## 검증 상태

2026-09-13 재개 후 `npm test` 32개, `npm run test:api` 26개, `npm run test:pwa` 5개가 통과했다. SQL 2개와 로컬 브라우저 30개는 이전 실행의 통과 기록이며 이번에 재실행하지 않았다. 브라우저 증거는 `C:/Users/김동욱/AppData/Local/Temp/naengteol-content-browser-95Y1kZ/browser-results`에 있다. 재료 페이지 검사는 360/390px에서 각 화면 크기의 목록·검색·상세 흐름과 48개 상세 페이지의 메뉴 3개·콘솔 오류 없음을 확인했다. 390px의 긴 목록 스크린샷은 기기 픽셀 배율 때문에 이미지 크기 제한에 걸려 CSS 픽셀 기준으로 저장한다. 상세 페이지 캡처에서도 재료량·도구·순서·출처가 카드 안에 표시되는지 확인했다.

콘텐츠 검사는 기본 `npm test`에 포함한다. 보유·부족 배열이 없는 정적 원본을 검사하던 빈 검사는 실제 API 계약 검사로 교체했다. 임시 DB에 `달걀`을 저장하고 `계란·김치·밥`을 입력해 보유·입력·부족 분류를 확인하며, 각 분류가 실제로 등장해야 통과한다. 추천의 조리 시간이 원본과 같고 DB 파일에 조리법이 저장되며, 메뉴 선택 재조회에서도 재료·단계·출처가 유지되는지 검사한다. 이는 API 전달·저장 계약을 검증하며, 반환된 필수 재료 목록 자체의 요리 정확성은 별도 콘텐츠 검토 대상이다.

기존 회원가입·로그인·게스트 가져오기·저장 응답 유실·후속 조회 실패를 포함한 전체 모바일 회귀 검사 30개도 위 브라우저 검사에 포함해 통과했다. 실행은 별도 임시 DB와 동적 포트로 격리했다. 구문 검사와 `git diff --check`도 통과했다. 144개 전체 메뉴의 내용 텍스트 대조는 2026-09-13 완료했지만 조리 시험은 수행하지 않았다. 이번 콘텐츠 수정본의 운영 반영 확인은 남아 있다. 기존 운영 복구 기록을 콘텐츠 배포 증거로 사용하지 않는다.

운영 반영은 Vercel 작성자 권한으로 차단됐다(2026-09-13 16시대 KST). 이번에 확인한 기존 운영 배포는 `dpl_6wjLWwrnNrZBo38qo7x64RjUtNdP`다. `food-catalog.js`, `recipe-specs.js`, `ingredient.js`, `ingredients.js`, `ingredient.html`, `ingredients.html`은 모두 HTTP 404이고, `app.js`, `index.html`, `styles.css`도 로컬 수정본과 다르다. Luna의 운영 WebKit 검사는 360px 목록 접근에서 404로 중단됐으며, 운영 모바일 검증을 통과한 것으로 기록하지 않는다. 실패 증거는 `test-results/content-production-smoke-2026-09-13T07-37-05-720Z`에 있다. 이번 재개에서는 운영 API 쓰기 검사를 실행하지 않았다.

로컬 수정본을 CLI로 업로드한 배포는 [`dpl_GA4zAvsXkpjzSr7NEu1hmTNcvw1a`](https://vercel.com/dongwook-hobby-projects1/hackerton-project1/GA4zAvsXkpjzSr7NEu1hmTNcvw1a)다. 기반 커밋은 `4cbb58f`, 작성자는 `tnstory01-svg`이며 미커밋 수정본을 업로드했다. Vercel API의 `readyState=BLOCKED`, `readyStateReason`은 커밋 작성자에게 이 프로젝트의 배포 권한이 없다는 내용이다. CLI 일반 출력의 `UNKNOWN`은 성공이나 단순 대기로 해석하지 않는다. Git commit·push, 작성자 변경, 권한 변경은 수행하지 않았다.

다음 작업은 사용자가 `dongwook-hobby-projects1` 프로젝트 소유자의 Vercel Account Settings → Login Connections에서 커밋 작성자 `tnstory01-svg`의 GitHub 연결과 권한을 확인하는 것이다. CLI 로그인 이름도 `tnstory01-svg`로 확인됐지만 배포 권한 판정은 실패했다. [Vercel 공식 문제 해결 안내](https://vercel.com/docs/deployments/troubleshoot-project-collaboration)에 따라 Git 제공자 연결과 커밋 이메일 연결을 확인한다. 이번 세션에는 연결된 관리 브라우저가 없어 계정 연결을 확인하거나 수정하지 못했다. 권한 해결 후 `npx.cmd vercel --prod --yes`로 현재 작업 트리를 배포하고 `node test-results/content-asset-check.mjs`, `node test-results/content-production-smoke.mjs`, `node test-results/content-production-api.mjs` 순서로 운영 파일 9개 일치·360/390px 각각 상세 48개·저장을 검증한다. 임시 검사 파일이 없다면 기존 검사 계약에 맞춰 복원한다.

정적 검사는 원래 재료 48개와 메뉴 144개의 누락 여부, 주요 메뉴의 필수 재료와 조리 방식을 확인한다. 카탈로그와 사양이 같다는 검사만으로 요리법 자체가 올바르다고 판정하지 않는다.

보유 여부는 재료명 기준이다. 사용자가 입력한 자유 형식 수량과 레시피 필요량이 충분히 일치하는지는 별도 확인이 필요하다. 브라우저·API 테스트는 맛, 영양, 실제 조리 시간 또는 모든 상품의 조리 조건을 검증하지 않는다.
