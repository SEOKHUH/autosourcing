## 역할
Step 1 — 상품 정보 폼 채우기 + 가격 계산 + 카테고리 조회

---

## step1-form.js

### 주요 함수
- `fillStep1(result)` — 크롤링 결과로 폼 초기값 채우기 (상품명 정제·재질·사양·무게·가격 계산)
- `refineProductName(rawName)` — 룰 기반 필터링 후 Gemini API로 상품명 정제
- `onSkuChange()` — 옵션 선택 변경 시 선택된 옵션의 최고가 기준으로 가격 재계산
- `updatePriceDisplay(yuan, prices)` — 위안가·원가·공급가·판매가 화면 갱신

### fillStep1 자동 입력 필드
| 필드 ID | 소스 | 비고 |
|---------|------|------|
| `f-name` | `title_kr` | Gemini API로 정제 |
| `f-material` | 속성 중 재질 키워드 매칭 | 영문 약자 대문자화 |
| `f-spec` | 속성 `name === '사양'` | 그대로 입력 |
| `f-weight` | 속성 `name === '무게'` | 그대로 입력 |
| `f-supply` / `f-selling` | 가격 계산 | PriceCalculator |

### 편집값 저장/복원
- `workspace.js`의 `saveProgress`에서 `f-spec`, `f-weight` 값도 저장
- `restoreProgress`에서 복원 (새로고침·스텝 이동 후에도 유지)

### 가격 계산 로직
- 원가 = 위안가 × 400
- 공급가 = ceil((원가 + 3000) / 100) × 100
- 판매가 = ceil(공급가 / 0.6 / 100) × 100

---

## step1-category.js

### 주요 함수
- `fetchCategory()` — KAN ID 입력 후 "조회" 버튼 클릭 시 실행
  1. `/qvt/kan-categories/search` 호출 → `categoryPath`, `categoryId` 확보
  2. `saveCategoryMeta()` 호출
- `saveCategoryMeta(item, resultEl)` — `/qvt/v3/kan-categories/download-quotation` ZIP 다운로드
  - JSZip 두 번 파싱: 외부 ZIP → XLSX(내부 ZIP) → `xl/sharedStrings.xml`
  - 정규식으로 `(숫자코드)` 패턴 추출 → `displayCategoryCode` 확보
  - 후보 1개: `queueData[id].displayCategoryCode` 직접 저장 + `fetchNoticeSchema` 호출
  - 후보 복수: `renderDisplayCodeSelect`로 드롭다운 UI 표시
- `renderDisplayCodeSelect(candidates, itemId, resultEl, tabId)` — 세부 카테고리 드롭다운 렌더링
- `fetchNoticeSchema(displayCode, tabId)` — 스키마 API에서 noticeNumber + noticeItems 동시 추출
  - 호출 엔드포인트: `/sr/schema/api/get-default-schemaform?internalDisplayCode=${code}&useCustomizedJsonSchema=true`
  - 반환: `{ noticeNumber, noticeItems }` (noticeItems = 항목 이름 문자열 배열)
  - 응답 필드 시도 순서: `j.notices → j.noticeItems → j.productNoticeItems`

### 저장되는 queueData 필드
- `categoryPath` — 카테고리 전체 경로 문자열
- `categoryId` — KAN 카테고리 ID
- `displayCategoryCode` — 세부 카테고리 숫자 코드 (Step 4에서 사용)
- `productNoticeNumber` — 상품고시 번호 (Step 4에서 사용)
- `productNoticeItems` — 상품정보제공고시 항목 이름 배열 (Step 4 notices 동적 구성에 사용)

### 주의사항
- 모든 supplier.coupang.com API는 CORS 차단 → `executeScript` MAIN world 방식으로 우회
- displayCategoryCode는 XLSX sharedStrings.xml에서 `경로 > 경로 (숫자코드)` 패턴으로 추출
- `productNoticeItems`가 비어있으면 Step 4에서 5개 공통 항목으로 폴백

## 상태 의존 (state.js)
- 읽기: `currentModalItemId`, `queueData`, `currentScrapeResult`
- 쓰기: `queueData[id].categoryPath`, `categoryId`, `displayCategoryCode`, `productNoticeNumber`, `productNoticeItems`
