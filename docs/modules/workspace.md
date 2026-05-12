## 역할
우측 워크스페이스(상세뷰) 열기/닫기 + 스텝 이동 + 진행상황 저장·복원

## 주요 함수
- `initWorkspace({renderOptionCards, renderImageGrid, renderDetailImgList, fillStep1, genAllMedia, refreshImageGridItem})` — 콜백 주입
- `openDetailView(itemId)` — 워크스페이스 열기, 스텝 UI 초기화, 진행상황 복원
- `closeDetailView()` — 워크스페이스 닫기 + 진행상황 저장
- `goToStep(n)` — 스텝 이동 (스테퍼 UI 갱신, Step 3 진입 시 genAllMedia 자동 호출)
- `saveProgress(immediate?)` — 현재 폼값·선택 옵션·이미지맵을 queueData에 저장 (800ms 디바운스)
- `restoreProgress(p)` — 저장된 진행상황으로 폼·옵션카드·이미지그리드 복원

## 상태 의존 (state.js)
- 읽기: `queueData`, `currentScrapeResult`, `currentStep`, `selectedOptions`, `optionImageMap`
- 쓰기: `currentModalItemId`, `isModalOpen`, `currentStep`, `activeOptionName`, `selectedOptions`, `optionImageMap`, `croppedImages`

## 주의사항
- step2·step3 모듈과 순환 의존 방지를 위해 콜백 주입 패턴 사용
- Step 3 진입 시 `genAllMedia()` 자동 호출 (결과 확인 탭 진입할 때만 렌더링)
- 폼 input 이벤트에 saveProgress 바인딩은 openDetailView 내에서 동적으로 추가
