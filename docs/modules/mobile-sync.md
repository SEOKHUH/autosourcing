## 역할
구글 시트 webhook → 쿠팡 URL 데이터 추출 → 소싱 후보 등록 + 소싱 원장 구글 시트 전송

---

## 주요 함수

- `syncFromSheet()` — 구글 Apps Script 웹앱에서 pending 항목 가져와 순차 처리
  1. `GET ?action=pending` → pending 행 목록
  2. 각 URL에 대해 `extractCoupangData(url)` 호출 (순차)
  3. 성공 시 `CANDIDATE_ADDED` 메시지로 후보 카드 추가 + `POST ?action=done` 마킹
  4. 실패 시 후보 카드에 "재시도" 버튼 표시
- `extractCoupangData(coupangUrl)` — 쿠팡 상품 페이지에서 정보 추출
  - `chrome.windows.create({ state: 'minimized' })` 으로 최소화 팝업 열기
  - `executeScript(world: 'MAIN')` 로 상품 페이지 JS 컨텍스트에서 직접 데이터 읽기
  - 추출 데이터: `productName`, `price`, `estimatedMonthlySales`, `categoryId`, `thumbnailUrl`
  - 완료 후 팝업 자동 닫기
- `pushLedgerToSheet(item)` — Step 4 완료 후 소싱 원장을 구글 시트 `ledger` 탭에 전송
  - `buildLedgerRows(item)` 로 행 데이터 생성
  - `POST ?action=ledger` 호출 (3회 재시도, 500ms 간격)
  - 중복 URL은 서버에서 skip 처리

## 구글 Apps Script 웹앱 엔드포인트

| 메서드 | 액션 | 설명 |
|--------|------|------|
| GET | `?action=pending` | 미처리 행 목록 반환 |
| POST | `?action=add` | 새 행 추가 `{ url, title }` |
| POST | `?action=done` | 처리 완료 마킹 `{ rowIds: [...] }` |
| POST | `?action=ledger` | 소싱 원장 기록 `{ url1688, rows: [...] }` |

## 상태 의존 (state.js)
- 읽기: `sourcingCandidates`, `queueData`

## 주의사항
- `extractCoupangData`는 CORS 우회를 위해 최소화 팝업 + MAIN world executeScript 사용
- `syncFromSheet`는 병렬(Promise.allSettled) 이 아닌 순차 처리 → 쿠팡 봇 차단 방지
- 구글 Apps Script 웹앱 URL은 `chrome.storage` 또는 설정 화면에서 관리
- `pushLedgerToSheet` 3회 실패 시 사용자에게 토스트 알림 표시
