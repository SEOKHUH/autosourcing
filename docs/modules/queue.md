## 역할
좌측 대기열 관리 — 아이템 추가·삭제·재시도·렌더링·chrome.storage 저장/로드, 크롤 스로틀

---

## 주요 함수

- `initQueue({openDetailView, closeDetailView})` — 순환 의존 방지용 콜백 주입 (index.js에서 호출)
- `addToQueue(url?)` — URL 입력창 또는 인자로 아이템 추가 후 크롤 스케줄
- `addToQueueFromCandidate(candidate)` — 소싱 후보 카드에서 크롤링 시작 시 사용
  - `candidate.coupangUrl`, `coupangName`, `coupangPrice`, `estimatedMonthlySales`, `coupangThumb`를 `queueData[id]`에 저장 → Step 1 쿠팡 참고 카드 표시용
- `enqueueRescrape(id)` — 가격 0 감지 후 1회 자동 재크롤 트리거 (scrape.js에서 호출)
- `crawlSettled(id, success)` — 크롤 완료 콜백: 상태 업데이트 후 다음 대기 항목 크롤 스케줄
- `renderQueue()` — 전체 대기열 DOM 재렌더링
- `selectItem(itemId)` — 아이템 클릭 시 상세뷰 열기
- `updateQueueItemStatus(itemId, status)` — 상태 갱신 + 렌더링
- `deleteItem(itemId)` — 아이템 삭제 (워크스페이스 열려있으면 닫음) + IDB 이미지 정리
- `retryItem(itemId)` — 에러 아이템 재크롤링
- `clearDoneItems()` / `clearAllItems()` — 완료/전체 삭제
- `saveQueue()` — `state.queueData` → `chrome.storage.local` 저장
- `loadQueue()` — `chrome.storage.local` → `state.queueData` 복원 + 렌더링

## 크롤 스로틀
- `CRAWL_THROTTLE_MS = 1800` — 연속 크롤 최소 간격 (ms)
- 대기 중 항목이 있으면 이전 크롤 완료 후 1.8초 후 자동 실행

## priceMissing 배지
- 크롤 완료 후 가격이 0이면 대기열 카드에 `⚠️ 가격 없음` 배지 표시
- `enqueueRescrape`로 1회 자동 재크롤 시도
- `item._priceRetried = true` 플래그로 무한 재시도 방지 (재시도 후에도 0이면 배지 유지)

## 상태 의존 (state.js)
- 읽기/쓰기: `queueData`, `currentItemId`
- 읽기: `isModalOpen`, `currentModalItemId`, `sourcingCandidates`

## 주의사항
- `openDetailView` / `closeDetailView`는 workspace.js에서 오는데, workspace.js가 queue.js를 import하므로 직접 import 불가 → 콜백 주입 패턴 사용
- `addToQueueFromCandidate`로 추가된 아이템은 `queueData[id].coupangUrl` 등 쿠팡 참고 데이터 포함
- `saveQueue`는 상태 변경 직후 매번 호출 (페이지 리로드 대비)
