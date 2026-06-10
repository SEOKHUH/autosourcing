# 소싱 후보 UX 보강 + 모바일 동기화 데이터 추출 개선

> 작성일: 2026-05-28  
> 상태: 워크플랜 작성 — 사용자 승인 대기

## 배경

모바일(iOS 단축어 → 구글 시트) → 데스크탑 동기화의 백엔드/단축어/익스텐션 기본 흐름은 완성됐다. 그런데 두 가지 문제가 남아있다:

1. **모바일 후보에 상품 정보가 안 채워짐** — 익스텐션이 쿠팡에 직접 `fetch`하면 쿠팡이 403으로 막아서 상품명·가격·썸네일을 못 가져옴. 카드에 URL만 덩그러니 표시됨.
2. **소싱 후보 UX 부족** — 후보 큐 카드에서 쿠팡 상품 페이지로 바로 갈 수 없고, 월판매량·가격이 배너/큐에 제대로 표시되지 않음.

목표: **PC에서 🔍로 추가한 후보와 모바일 동기화 후보가 완전히 동일한 정보를 표시**하도록 맞추기.

---

## 작업 항목

### A. 모바일 동기화 — 백그라운드 탭 방식으로 전환

**파일**: `extension/ui/modules/mobile-sync.js` (이 파일만 수정)

#### 현재 문제
`fetchCoupangMeta(url)` 함수가 익스텐션 컨텍스트에서 쿠팡 URL을 직접 `fetch()` → 쿠팡이 403 Forbidden으로 차단 → 상품명·가격·썸네일 전부 실패.

#### 변경 방향
쿠팡 페이지를 **백그라운드 탭으로 열고, 페이지 내부에서 데이터를 추출**한다. 1688 스크래퍼와 동일한 철학.

#### 추출 방식

| 정보 | 방법 | 근거 |
|------|------|------|
| 상품명·가격 | `window.dataLayer`의 `view_item` 이벤트 → `item_name`, `price` | 쿠팡이 분석용으로 유지하는 구조화된 전역 객체. DOM 아님 → UI 변경에 무관 |
| 썸네일 | `<meta property="og:image">` | `//`로 시작 시 `https:` 보정 필요 |
| 카테고리ID | `/next-api/review/batch?productId=...&viRoleCode=3` → `data.reviewable.contents.categoryId` | PC 🔍 흐름(`coupang_search.js`)과 동일한 API. **dataLayer의 `item_category`는 값이 달라 사용 안 함** |
| 월판매량 | `/next-api/review?productId=...` 페이지네이션, 30일 리뷰 × 10 | PC 🔍 흐름(`countRecent30DaysReviews`)과 동일 로직 |

> ⚠️ `coupang_search.js`의 기존 코드(`fetchCategoryId`, `countRecent30DaysReviews`)는 **한 줄도 건드리지 않는다**. 동일한 API 호출 로직을 `mobile-sync.js` 안에 페이지 내부 실행 스크립트로 복제.

#### 구현 흐름
```
syncFromSheet()
  ↓
쿠팡 URL 목록 (pending rows) → 중복 제거 후 toProcess 배열 수집
  ↓
Promise.allSettled(toProcess.map(url => extractCoupangData(url)))  ← 병렬 처리
  ↓
각 URL마다 (병렬):
  1. chrome.windows.create({ url, state: 'minimized', focused: false })
     → 현재 탭바에 탭이 안 보이는 최소화 창
  2. tabs.onUpdated status==='complete' 대기
  3. scripting.executeScript({ world: 'MAIN' }) 실행:
     - dataLayer 폴링 (최대 6초, view_item 이벤트 등장 대기)
     - productId 추출 → review/batch API → categoryId
     - review API 페이지네이션 → estimatedMonthlySales
     - og:image → thumbnailUrl
  4. chrome.windows.remove(winId)
  5. 후보 객체 생성 → _onCandidateAdded() 호출
  ↓
chrome.storage.local.set({ sourcingCandidates })
  ↓
Google Sheets ?action=done (처리 완료 마킹)
```

#### 후보 객체 필드 (PC 후보와 동일)
```js
{
  id: 'mobile_...',
  productName,           // dataLayer item_name
  price,                 // dataLayer price (숫자)
  thumbnailUrl,          // og:image
  categoryId,            // review/batch API
  estimatedMonthlySales, // review API × 10
  coupangUrl,            // 원본 쿠팡 URL
  status: 'pending',
  source: 'mobile'
}
```

#### 권한
`scripting`, `tabs`, `host_permissions: www.coupang.com` → 이미 manifest에 존재. **추가 불필요**.

---

### B. 후보 큐 카드 → 쿠팡 상품 페이지 이동

**파일**: `extension/ui/modules/candidates.js`, `extension/ui/index.css`

#### 현재 상태
- 쿠팡 페이지 배너: ✅ 이미 구현 ([coupang_search.js:122](../content_scripts/coupang_search.js)) — 카드 클릭 → `window.open(c.coupangUrl)`
- 익스텐션 후보 큐 카드: ❌ 없음

#### 변경 내용
후보 큐 카드 렌더링([candidates.js:34](../ui/modules/candidates.js))에 쿠팡 이동 링크 추가:
- 썸네일 또는 상품명 영역 클릭 → `window.open(c.coupangUrl, '_blank')`
- `coupangUrl`이 없으면(구버전 후보) 비활성화

---

### C. 월판매량 표시

**파일**: `extension/ui/modules/candidates.js`, `extension/content_scripts/coupang_search.js`

#### 현재 상태
- 데이터(`estimatedMonthlySales`)는 PC 후보에 이미 저장됨 ([coupang_search.js:365](../content_scripts/coupang_search.js)) — 화면 표시만 없음
- 모바일 후보도 A 작업 완료 후 동일하게 보유

#### 변경 내용
- **후보 큐 카드** `cand-meta` 영역에 `월 N개` 조건부 추가 (값 없으면 미표시)
- **쿠팡 배너 카드** 상품명 아래에 `월 N개` 표시 추가

---

### D. 쿠팡 배너에 판매가 표시

**파일**: `extension/content_scripts/coupang_search.js`

#### 현재 상태
배너 카드([coupang_search.js:79-128](../content_scripts/coupang_search.js))에 썸네일 + 상품명만 표시. 가격 없음.

#### 변경 내용
`c.price` 있으면 가격 줄 추가 (`23,990원` 포맷 — 후보 큐 카드와 동일)

---

## 파일 변경 요약

| 파일 | 변경 항목 |
|------|----------|
| `extension/ui/modules/mobile-sync.js` | A — fetch 방식 버리고 백그라운드 탭 방식 전면 재작성 |
| `extension/ui/modules/candidates.js` | B, C — 쿠팡 이동 + 월판매량 표시 |
| `extension/ui/index.css` | B, C — 관련 스타일 |
| `extension/content_scripts/coupang_search.js` | C, D — 배너 카드에 월판매량·가격 추가 |
| `docs/SESSION.md`, `docs/CHANGELOG.md` | 작업 로그 갱신 |

**건드리지 않는 것**:
- `coupang_search.js`의 `fetchCategoryId`, `countRecent30DaysReviews` 함수
- `manifest.json` (권한 이미 충족)
- 그 외 모든 파일

---

## 작업 순서

1. **A. `mobile-sync.js` 재작성** (핵심 — 나머지 B/C/D는 독립적으로 진행 가능)
2. **B. 후보 큐 쿠팡 이동** (`candidates.js` 소량 수정)
3. **C. 월판매량 표시** (`candidates.js` + `coupang_search.js`)
4. **D. 쿠팡 배너 가격 표시** (`coupang_search.js`)
5. 통합 테스트 + 문서 갱신

---

## 검증 방법

| 항목 | 확인 방법 |
|------|----------|
| A. 모바일 동기화 | 구글 시트에 pending row → 📲 가져오기 → 후보 카드에 상품명·가격·썸네일·카테고리ID·월판매량 표시. 콘솔 403 없음. 1688 연결 → 크롤링 → Step 1 카테고리ID 자동 입력 확인 |
| B. 쿠팡 이동 | 후보 큐 카드 클릭 → 새 탭으로 쿠팡 상품 페이지 열림 |
| C. 월판매량 | 🔍로 PC 후보 추가 → 배너 카드에 `월 N개` 표시. 후보 큐 카드에도 표시 |
| D. 가격 표시 | 쿠팡 배너 카드에 판매가 표시 |

---

## 진행 상태

| 항목 | 상태 |
|------|------|
| 워크플랜 작성 | ✅ |
| A. 모바일 동기화 재작성 | ✅ |
| B. 후보 큐 쿠팡 이동 | ✅ |
| C. 월판매량 표시 | ✅ |
| D. 쿠팡 배너 가격 표시 | ✅ |
| 통합 테스트 + 문서 갱신 | ✅ |
