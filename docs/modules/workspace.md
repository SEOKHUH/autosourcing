## 역할
우측 워크스페이스(상세뷰) 열기/닫기 + 스텝 이동 + 진행상황 저장·복원 + 쿠팡 참고 카드 렌더링

---

## 주요 함수

- `initWorkspace({renderOptionCards, renderImageGrid, renderDetailImgList, fillStep1, genAllMedia, refreshImageGridItem, renderCroppedItem, fetchCategory, restoreCategoryUI})` — 콜백 주입
- `openDetailView(itemId)` — 워크스페이스 열기, 스텝 UI 초기화, 진행상황 복원
  - 쿠팡 참고 카드 채우기 (`item.coupangUrl` 존재 시)
  - restoreProgress 후 카테고리 자동 복원 순서:
    1. `f-category-id` 비어있고 `item.categoryId` 있으면 자동 입력
    2. `item.categoryPath` 있으면 경로 텍스트 표시
    3. `item.categoryCodeCandidates` 있으면 `restoreCategoryUI` 호출 (재조회 없음)
    4. 위 조건 없고 categoryId 있으면 `fetchCategory` 자동 호출
- `closeDetailView()` — 워크스페이스 닫기 + 진행상황 저장
- `goToStep(n)` — 스텝 이동 (스테퍼 UI 갱신, Step 3 진입 시 `genAllMedia` 자동 호출)
- `saveProgress(immediate?)` — 현재 폼값·선택 옵션·이미지맵을 queueData에 저장 (800ms 디바운스)
  - 저장 항목: `step`, `selectedOptions`, `optionCustomNames`, `croppedImageKeys`, `optionImageMap`, `name`, `supply`, `selling`, `qty`, `material`, `option`, `categoryId`, `spec`, `weight`, **`yuan`**
- `restoreProgress(p)` — 저장된 진행상황으로 폼·옵션카드·이미지그리드 복원
  - `yuan` 복원 후 `updatePriceDisplay`로 가격 재계산

## 쿠팡 참고 카드
- Step 1 열릴 때 `item.coupangUrl`, `coupangName`, `coupangPrice`, `estimatedMonthlySales`, `coupangThumb` 있으면 우측 상단에 카드 표시
- 카드 클릭 → 쿠팡 상품 페이지 새 탭 열기
- `addToQueueFromCandidate`로 추가된 아이템에만 표시 (URL 직접 입력 시 미표시)

## 상태 의존 (state.js)
- 읽기: `queueData`, `currentScrapeResult`, `currentStep`, `selectedOptions`, `optionImageMap`
- 쓰기: `currentModalItemId`, `isModalOpen`, `currentStep`, `activeOptionName`, `selectedOptions`, `optionImageMap`, `croppedImages`

## 주의사항
- step2·step3·step1-category 모듈과 순환 의존 방지를 위해 콜백 주입 패턴 사용
- Step 3 진입 시 `genAllMedia()` 자동 호출 (결과 확인 탭 진입할 때만 렌더링)
- 폼 input 이벤트에 `saveProgress` 바인딩은 `openDetailView` 내에서 동적으로 추가
- 카테고리 복원 우선순위: `categoryCodeCandidates` 있으면 재조회 없이 복원 (네트워크 요청 생략)
