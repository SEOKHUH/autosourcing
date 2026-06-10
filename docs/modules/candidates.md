## 역할
좌측 패널 소싱 후보 카드 렌더링 + 크롤링 시작·직접입력·삭제 버튼 처리

---

## 주요 함수

- `renderCandidates()` — `state.sourcingCandidates` 배열로 후보 카드 전체 재렌더링
- `onCandidateAdded(candidate)` — SW 메시지 `CANDIDATE_ADDED` 수신 시 콜백
  - `state.sourcingCandidates`에 추가 후 `renderCandidates`
- `onCandidateLinked(data)` — SW 메시지 `CANDIDATE_LINKED` 수신 시 콜백
  - 후보 카드 상태를 `linked`로 업데이트 (크롤링 대기열에 연결됨)
- `onCandidateRemoved(id)` — SW 메시지 `CANDIDATE_REMOVED` 수신 시 콜백
  - 해당 후보 카드 제거
- `addCandidateManually(url, title)` — "직접입력" 버튼 → URL 수동 입력 후 후보 추가

## 후보 카드 상태

| 상태 | 의미 |
|------|------|
| `pending` | 미처리 (크롤링 시작 버튼 활성) |
| `linked` | 대기열에 추가됨 (크롤링 중/완료) |
| `queued` | 처리 완료 |

## 카드 UI 구성
- 썸네일 이미지
- 상품명 (클릭 → 쿠팡 상품 페이지 새 탭)
- 가격 (볼드)
- 월판매량 (하늘색)
- 버튼: "크롤링 시작" / "직접입력" / 삭제(×)
- 모바일 싱크 실패 시: "재시도" 버튼 표시

## 상태 의존 (state.js)
- 읽기/쓰기: `sourcingCandidates`

## 주의사항
- "크롤링 시작" 클릭 → `addToQueueFromCandidate(candidate)` 호출 (queue.js)
- "직접입력" 클릭 → 후보 카드 내 URL 입력 인풋 노출
- `state.sourcingCandidates`는 페이지 리로드 시 초기화 (chrome.storage 영속화 없음)
