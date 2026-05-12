## 역할
Step 3 — 라벨 이미지 + 상세페이지 이미지 생성 후 IDB 저장

## 주요 함수
- `genAllMedia()` — genLabel + genDetailPage 순서대로 실행 (Step 3 진입 시 자동 호출)
- `genLabel()` — 라벨 이미지 생성
  - 상품명·색상옵션·재질·수량 → HtmlRenderer.renderLabel() → IDB 저장 (`label_{itemId}`)
- `genDetailPage()` — 상세페이지 이미지 생성
  - 크롭 이미지 있으면 우선 사용, 없으면 getImagesForGeneration(3)으로 자동 선택
  - HtmlRenderer.renderDetailPage() → IDB 저장 (`detail_{itemId}`)
- `getColorOptions()` — 선택 옵션 중 색상 차원만 필터링 반환 (Step 4에서도 사용)
- `getImagesForGeneration(maxCount)` — 상세페이지용 이미지 키 선택 로직
  - 첫 번째 선택 옵션의 매칭 이미지 → `__default__` → `allImages` 순서로 폴백

## 상태 의존 (state.js)
- 읽기: `croppedImages`, `selectedOptions`, `optionImageMap`, `allImages`, `currentItemId`, `currentScrapeResult`

## 주의사항
- IDB 키: `label_{itemId}`, `detail_{itemId}` → Step 4에서 이 키로 읽어서 업로드
- html2canvas는 전역 스크립트로 로드됨 (ES 모듈 아님) → `window.html2canvas`로 접근
