## 역할
Step 2 — 옵션 카드 렌더링, 이미지 그리드, 드래그 크롭 UI

---

## step2-options.js

### 주요 함수
- `renderOptionCards(skus, skuGroups)` — 옵션 카드 4열 그리드 렌더링
  - skuGroups가 2개 이상이면 다차원 SKU (색상 카드 + 사양 칩 혼합 레이아웃)
- `activateOption(optionName)` — 옵션 카드 active 스타일 토글
- `showOptionPicker(imgKey, imgEl, itemEl, e)` — 이미지 클릭 시 옵션 선택 팝업 표시
  - 색상 옵션만 필터링해 표시 (사양 옵션은 이미지 매칭 불필요)
  - 단일 옵션이면 팝업 없이 바로 매칭
- `toggleImageAssignmentTo(imgKey, imgEl, itemEl, optName)` — 이미지↔옵션 매칭 토글

---

## step2-imagegrid.js

### 주요 함수
- `initImageGrid({showOptionPicker})` — 콜백 주입 (step2-options.js와 순환 방지)
- `renderImageGrid()` — 메인 이미지 + SKU 썸네일 그리드 렌더링 (중복 URL 제거)
- `refreshImageGridItem(item, img, key)` — 단일 이미지 아이템 배지 갱신

---

## step2-cropper.js

### 주요 함수
- `renderDetailImgList()` — 상세 이미지 목록 렌더링 + 드래그 크롭 이벤트 등록
  - 여러 이미지에 걸친 자유 크롭 → 세로 합성 캔버스 생성
  - 드래그 중 상/하 60px 진입 시 rAF 기반 자동 스크롤
- `addCroppedImage(dataUrl)` — 크롭 결과 추가 (최대 3개, 삭제 버튼 포함)

## 상태 의존 (state.js)
- 읽기: `allImages`, `skuThumbKeys`, `detailImages`, `selectedOptions`, `optionImageMap`
- 쓰기: `activeOptionName`, `selectedOptions`, `optionImageMap`, `croppedImages`
