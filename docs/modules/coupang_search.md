## 역할
쿠팡 상품 목록 페이지에서 각 상품 카드에 돋보기 버튼 오버레이 — 클릭 시 예상 월판매량·카테고리 ID 조회 후 팝업 표시

파일 위치: `extension/content_scripts/coupang_search.js`

---

## 주요 함수

- `injectButtons()` — 상품 카드 목록 탐지 후 각 카드에 돋보기(🔍) 버튼 삽입
- `showOverlay(productId, btn)` — 버튼 클릭 시 오버레이 팝업 표시
  1. `fetchMonthlySales(productId)` — 예상 월판매량 조회
  2. `fetchCategoryId(productId)` — 카테고리 ID 조회
  3. 결과를 오버레이 카드에 렌더링
- `fetchMonthlySales(productId)` — `/next-api/review` 엔드포인트 호출
  - 반환: 월판매량 숫자 (없으면 null)
- `fetchCategoryId(productId)` — `/next-api/review/batch` 엔드포인트 호출
  - `referrer` 헤더를 상품 상세 페이지 URL로 지정 (Akamai 봇 차단 우회 필수)
  - `credentials: 'include'` 포함
  - 반환: `data.reviewable.contents.categoryId` 문자열 (없으면 null)

## Akamai 봇 차단 우회 (fetchCategoryId)

```javascript
const resp = await fetch(`/next-api/review/batch?productId=${productId}&viRoleCode=3`, {
  headers: { accept: 'application/json, text/plain, */*' },
  referrer: `https://www.coupang.com/vp/products/${productId}`,
  credentials: 'include',
});
```

- **원인**: content script의 `referrer` 없는 fetch → Akamai가 403 반환
- **해결**: `referrer`를 상품 상세 페이지 URL로 명시 → 페이지 본체 JS와 동일하게 통과
- `/next-api/review` (월판매량)는 referrer 없이도 통과, `/next-api/review/batch` (카테고리)만 차단

## 오버레이 표시 항목
- 예상 월판매량 (단위: 개)
- 카테고리 ID
- "소싱 후보에 추가" 버튼 (클릭 → SW에 `ADD_CANDIDATE` 메시지)

## 주의사항
- 쿠팡 상품 목록 URL 패턴에서만 content script 실행 (`manifest.json` matches 확인)
- 상품 카드 셀렉터는 쿠팡 UI 업데이트 시 깨질 수 있음
- MutationObserver로 동적으로 추가되는 카드에도 버튼 자동 삽입
