## 역할
좌측 대기열 관리 — 아이템 추가·삭제·재시도·렌더링·chrome.storage 저장/로드

## 주요 함수
- `initQueue({openDetailView, closeDetailView})` — 순환 의존 방지용 콜백 주입 (index.js에서 호출)
- `addToQueue()` — URL 입력창에서 아이템 추가 후 SCRAPE_REQUEST 메시지 전송
- `renderQueue()` — 전체 대기열 DOM 재렌더링
- `selectItem(itemId)` — 아이템 클릭 시 상세뷰 열기
- `updateQueueItemStatus(itemId, status)` — 상태 갱신 + 렌더링
- `deleteItem(itemId)` — 아이템 삭제 (워크스페이스 열려있으면 닫음)
- `retryItem(itemId)` — 에러 아이템 재크롤링
- `clearDoneItems()` / `clearAllItems()` — 완료/전체 삭제
- `saveQueue()` — `state.queueData` → `chrome.storage.local` 저장
- `loadQueue()` — `chrome.storage.local` → `state.queueData` 복원 + 렌더링

## 상태 의존 (state.js)
- 읽기: `queueData`, `currentItemId`, `isModalOpen`, `currentModalItemId`
- 쓰기: `queueData`, `currentItemId`

## 주의사항
- `openDetailView` / `closeDetailView`는 workspace.js에서 오는데, workspace.js가 queue.js를 import하므로 직접 import 불가 → 콜백 주입 패턴 사용
