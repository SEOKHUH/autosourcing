## 역할
전역 상태 단일 객체 — 모든 모듈이 이 파일에서 `state`를 import해 읽고 씀

## 주요 속성
- `currentItemId` — 현재 선택된 대기열 아이템 ID
- `queueData` — `{ [itemId]: item }` 전체 대기열 맵
- `currentScrapeResult` — 현재 아이템의 크롤링 결과 원본
- `allImages` — 메인 갤러리 IDB 키 목록
- `detailImages` — 상세 이미지 IDB 키 목록
- `skuThumbKeys` — SKU 썸네일 IDB 키 목록
- `croppedImages` — Step 2에서 크롭된 이미지 dataURL 배열 (최대 3개)
- `currentStep` — 현재 스텝 번호 (1~4)
- `isModalOpen` / `currentModalItemId` — 워크스페이스 열림 여부 + 아이템 ID
- `activeOptionName` — 이미지 그리드에서 현재 활성 옵션
- `selectedOptions[]` — 사입 선택된 옵션 이름 배열
- `optionImageMap{}` — `{ 옵션이름: [imgKey, ...] }` 이미지 매칭 맵
- `optionAssignedRowEls{}` — 옵션 할당 DOM 요소 참조 (현재 미사용)

## 주의사항
- setter 없음 — 각 모듈이 `state.xxx = ...` 직접 변경
- 페이지 리로드 시 초기화됨 (영속화는 `queue.js`의 `saveQueue` 담당)
