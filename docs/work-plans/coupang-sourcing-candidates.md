# 쿠팡 소싱 후보 관리 + 1688 자동 연결

## Context

현재 소싱 흐름에서 반복되는 수작업 3가지:
1. 1688 URL 복사 → 익스텐션에 붙여넣기
2. DevTools에서 categoryId 수동 확인
3. 이미지 검색 확장프로그램(AiPrice) 별도 실행

**역할 분담**:
- **AiPrice 확장프로그램**: 1688 이미지 검색 → 기존 그대로 사용
- **우리 확장프로그램 신규 역할**: ① 쿠팡 목록 오버레이 + 소싱 후보 큐 ② 1688 상품 페이지 자동 연결

---

## 목표 사용자 흐름

### 현재
쿠팡 목록 탐색 → AiPrice로 1688 검색 → 1688 URL 복사 → 익스텐션에 붙여넣기 → DevTools로 categoryId 찾기

### 개선 후
1. **쿠팡 목록 페이지**: 상품 카드에 오버레이 (월 예상 판매량 + "+" 버튼)
2. **"+" 클릭**: 소싱 후보 큐에 자동 추가 — categoryId·상품명·가격·썸네일 수집
3. **AiPrice로 1688 이미지 검색** (기존과 동일): 1688 상품 클릭 → 상품 페이지 진입
4. **1688 상품 페이지**: 상단 배너 자동 표시 — "이 상품을 [쿠팡 상품명]으로 소싱하기"
5. **배너 클릭**: URL 자동 연결 → 기존 Step 1~4 자동 시작

**제거되는 수작업**: URL 복사/붙여넣기, categoryId DevTools 조회

---

## 월 예상 판매량 계산

- 공식: `최근 30일 리뷰수 × 10`
- IntersectionObserver → 카드가 뷰포트 진입 시 lazy fetch
- 초기: DOM에 보이는 전체 리뷰수 먼저 표시 → 비동기로 월별 수치 교체
- 주의: 쿠팡 리뷰 API 호출 시 필요한 헤더/쿠키는 구현 중 DevTools Network로 확인

---

## 수정/추가 파일 목록

### 1. `extension/manifest.json`
**host_permissions 추가**:
```json
"https://www.coupang.com/*"
```
**content_scripts 추가**:
```json
{
  "matches": [
    "https://www.coupang.com/np/search*",
    "https://www.coupang.com/np/campaigns*",
    "https://www.coupang.com/np/categories*"
  ],
  "js": ["content_scripts/coupang_search.js"],
  "run_at": "document_idle"
}
```
**connect-src CSP 추가**: `https://www.coupang.com`

### 2. `extension/content_scripts/coupang_search.js` (신규)
**역할**:
- 상품 카드 DOM에서 추출: `productId`, `name`, `price`, `thumbnailUrl`, `categoryId`
- categoryId 추출 우선순위: ① 카드 `<a href>` URL 파라미터 ② `window.__NEXT_DATA__` JSON ③ 실패 시 null
- IntersectionObserver: 카드 뷰포트 진입 시 리뷰 API 호출 → 최근 30일 리뷰수 카운트 → 오버레이 업데이트
- **MutationObserver 필수**: 페이지네이션/스크롤로 카드 동적 추가 시 새 카드에도 오버레이 자동 부착
- "+" 클릭 → `chrome.runtime.sendMessage({ type: 'ADD_SOURCING_CANDIDATE', data })`

**오버레이 표시 항목**: 월 예상 판매량 / "소싱 후보 추가 (+)" 버튼

### 3. `extension/content_scripts/scraper_1688.js` (수정)
페이지 로드 시 pending 후보 전체 조회 → 배너 표시:
```js
chrome.runtime.sendMessage({ type: 'GET_PENDING_CANDIDATES' }, (candidates) => {
  if (!candidates?.length) return;
  // 상단 고정 배너 생성
  // 후보 1개: "이 상품을 [상품명]으로 소싱하기" 버튼
  // 후보 여러 개: <select> 드롭다운으로 후보 목록 표시 → 선택 후 "소싱하기" 버튼
  // 클릭 → LINK_1688_TO_CANDIDATE { url, candidateId } 메시지
});
```

**배너 UI (후보 여러 개일 때)**:
```
┌─────────────────────────────────────────────┐
│ 이 상품을 [ 쿠팡 상품 B ▾ ] 으로 소싱하기  │
│              ↑ 드롭다운 (A, B, C 선택 가능)  │
└─────────────────────────────────────────────┘
```

### 4. `extension/background/service-worker.js` (수정)
**새 메시지 핸들러**:

| 타입 | 동작 |
|------|------|
| `ADD_SOURCING_CANDIDATE` | candidates 배열에 추가, storage 저장, UI 브로드캐스트 |
| `GET_PENDING_CANDIDATES` | status가 'pending'인 후보 전체 배열 반환 |
| `LINK_1688_TO_CANDIDATE` | candidate에 url1688 저장, status → 'linked', UI 브로드캐스트, addToQueue 자동 트리거 |
| `REMOVE_SOURCING_CANDIDATE` | 해당 candidateId 배열·storage에서 삭제, UI 브로드캐스트 |

### 5. `extension/ui/modules/state.js` (수정)
```js
sourcingCandidates: [],  // 추가
```

### 6. `extension/ui/modules/candidates.js` (신규)
**역할**:
- 좌측 패널 상단에 접이식 섹션으로 후보 카드 렌더링 (기존 1688 큐 위)
- 카드 구성: 쿠팡 썸네일 / 상품명 / 가격 / 월 판매량 / status 표시
- **"직접 입력" 버튼**: 1688 URL 수동 입력 인풋 노출 (배너 연결 외 수동 대안)
- **[ X ] 삭제 버튼**: 카드 우측 상단 → `REMOVE_SOURCING_CANDIDATE` 메시지 → storage + 배열에서 제거
- linked 상태 → `addToQueue()` 자동 실행 (url1688 + categoryId 미리 채움)
- 초기화 시 `chrome.storage.local.get('sourcingCandidates')`로 이전 후보 복원

### 7. `extension/ui/index.html` (수정)
좌측 패널 상단에 섹션 추가:
```html
<div id="candidates-section">
  <div class="section-header" id="candidates-toggle">
    소싱 후보 <span id="candidates-count">0</span>
  </div>
  <div id="candidates-list"></div>
</div>
```

### 8. `extension/ui/modules/messages.js` (수정)
```js
case 'CANDIDATE_ADDED':   // 새 후보 추가됨
case 'CANDIDATE_LINKED':  // 1688 URL 연결됨 → addToQueue 호출
```

### 9. `extension/ui/modules/queue.js` (수정)
`addToQueue(candidateId?)` — candidateId 있으면 해당 후보의 categoryId 자동 적용

---

## 검증 방법

1. 리로드 → 쿠팡 검색 결과 접속 → 카드 오버레이 표시 확인
2. 페이지네이션 후 새 카드에도 오버레이 부착 확인 (MutationObserver)
3. "+" 클릭 → 익스텐션에 후보 카드 추가 + categoryId 자동 확인
4. AiPrice로 1688 이미지 검색 → 상품 페이지 진입 → 배너 표시 확인
5. 배너 클릭 → 후보 status linked 변경 + Step 1 자동 시작 확인
6. 익스텐션 닫았다 재오픈 → 후보 목록 복원 확인
