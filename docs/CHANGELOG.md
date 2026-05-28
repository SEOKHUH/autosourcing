# 작업 로그

---

## 2026-05-28 — 상세페이지 중국어 텍스트 제거 기능 추가 (Claude Code)

### 배경
쿠팡 상품 등록 시 상세페이지 이미지에 중국어가 포함되면 안 됨. Step 2에서 크롭한 상세 이미지에 남아있는 1688 중국어 텍스트를 제거하는 기능 추가.

### 채택안: D안 (OCR 자동 감지 + 박스 수정 + 적응형 인페인팅)
- Tesseract.js로 중국어 텍스트 자동 감지 → 빨간 박스 표시
- 사용자가 박스 추가/삭제로 수정 후 인페인팅 적용
- 외부 API 비용 없음, 익스텐션 내부 처리

### 변경 내용

**Tesseract.js + WASM 로컬 번들** (5종 신규, ~26MB)
- `extension/vendor/tesseract.min.js` (65KB)
- `extension/vendor/tesseract-worker.min.js` (121KB)
- `extension/vendor/tesseract-core-lstm.wasm.js` (3.8MB)
- `extension/vendor/tesseract-core-lstm.wasm` (2.7MB)
- `extension/vendor/tessdata/chi_sim.traineddata.gz` (19MB)

**`extension/manifest.json`**
- CSP `script-src`에 `'wasm-unsafe-eval'` 추가 (WASM 컴파일 필수)
- `web_accessible_resources.resources`에 `vendor/tessdata/*` 명시 추가

**신규 모듈**
- `extension/ui/modules/ocr-worker.js` — Tesseract.js 싱글톤 워커. 최초 1회만 모델 로드, 이후 캐싱. `workerBlobURL: false` 필수 (MV3 CSP가 blob URL 차단).
- `extension/ui/modules/inpaint.js` — 적응형 인페인팅. 박스 외곽 픽셀 샘플링 후 단색/세로 그라데이션/가로 그라데이션 자동 분기. 경계 Clamping으로 이미지 가장자리 박스 처리.
- `extension/ui/modules/step2-text-eraser.js` — 모달 + 캔버스 인터랙션. 좌표 보정(Scale Ratio), No-Mode 인터랙션(드래그=생성, ✕ 클릭=삭제), 단어 박스 줄 단위 자동 병합(`mergeNearbyBoxes`), undo 스택, 미리보기 토글. OCR 시 박스 오버레이 없는 오프스크린 캔버스 사용.

**`extension/ui/modules/step2-cropper.js`**
- `renderCroppedItem`에 "텍스트 제거" 버튼 추가. 클릭 시 모달 열고, 콜백으로 새 dataURL 받으면 `state.croppedImages[i]` 교체 + IDB 갱신 + 썸네일 새로고침 + `saveProgress()`.

**`extension/ui/index.html`**
- `<script src="../vendor/tesseract.min.js">` 추가
- 텍스트 제거 모달 DOM 추가 (`#text-eraser-modal`)

**`extension/ui/index.css`**
- `.crop-erase-btn` — 크롭 아이템 hover 시 하단에 표시되는 파란 버튼
- `.text-eraser-backdrop` — `backdrop-filter: blur(4px)` 글래스모피즘
- `.text-eraser-modal` — 둥근 모서리 + 그림자
- `.text-eraser-canvas-wrap` — 다크 그레이 배경 (`#2a2d35`)
- `.text-eraser-toolbar`, `.text-eraser-hint` 등

### 핵심 디테일
- `'wasm-unsafe-eval'` CSP — WASM 컴파일에 필수
- `workerBlobURL: false` — MV3 CSP에서 blob: URL 차단되므로 워커 파일 직접 사용
- 캔버스 좌표 보정 — CSS 크기와 내부 해상도 차이 보정 (`scaleX/scaleY`)
- 박스 병합 — Tesseract 단어 박스를 줄 단위로 자동 통합
- 픽셀 샘플링 Clamping — 박스가 이미지 가장자리에 있을 때 좌표 범위 보호
- OCR 시 오프스크린 캔버스 사용 — 화면 캔버스의 빨간 박스 오버레이가 OCR 입력에 노출되지 않도록

---

## 2026-05-28 — 전체 UI 스타일 일관성 리팩토링 및 가이드 동기화 (Antigravity)

### 변경 내용

**`extension/ui/index.css`**
- 디자인 시스템 변수 추가 (`:root`): 테두리 두께(`1px`), 테두리 색상(`#e2e4e9`, `#edf0f5`), 스크롤바 너비(`5px`), 스크롤바 색상(`#cbd0d9`) 변수 선언.
- 테두리(Border) 통일: `.q-card`, `.cand-card`, 인풋 및 버튼 래퍼, 옵션 카드 등의 테두리를 `1.5px`에서 `1px`로 축소하고 일관성 있게 정돈.
- 버튼(Button) 크기 및 스타일 규격화:
  - 기본 버튼: `height: 36px`, `font-size: 13px`, `padding: 0 16px`로 통일 (기존 ~40px 렌더링 수정).
  - Small 버튼: `height: 28px`, `font-size: 12px`, `padding: 0 10px`로 통일 (기존 ~30px 렌더링 수정).
  - `.btn-danger` 클래스(배경 `#e94560`, 호버 `#d63b56`, 액티브 `#b93148`) 추가로 가이드 라인의 Danger 클래스 부합.
- 인풋(Input) 요소 규격화: `input`, `select`, `textarea` 높이 `36px`, 폰트 크기 `13px`, 패딩 `8px 12px`로 축소하여 촘촘하고 정교한 폼 구축 (기존 ~44px 렌더링 수정).
- 호버(Hover) 피드백 통일: 전역 `button:hover`의 `translateY(-1px)` 움직임을 제거하고 제자리에서 배경색/테두리 색상만 자연스럽게 변경되는 플랫 디자인으로 정립.
- 스크롤바(Scrollbar) 규격화: 대기열 리스트, 워크스페이스, 옵션 목록 등 산발적이던 너비를 `5px`, 스크롤 칩 색상을 `#cbd0d9`로 단일화.

---

## 2026-05-28 — 워크스페이스 헤더 버튼 디자인 및 호버 이벤트 통일 (Antigravity)

### 변경 내용

**`extension/ui/index.css`**
- `.workspace-header .btn-ghost` 스타일 규칙 추가:
  - 버튼 높이를 `30px`로 통일하고 가로 패딩 `12px` 적용.
  - 테두리를 투명(`border: 1px solid transparent`)으로 설정하고, 배경색을 연한 회색(`#f4f6fb`)으로 적용하여 통일된 플랫 디자인 구현.
  - 폰트 크기 `12px` (`btn-sm` 기준)로 통일하여 닫기 버튼이 크게 보이던 현상 해결.
  - `:hover` 및 `:active` 상태에서 배경색(`#e2e4e9`, `#d0d2d6`)이 부드럽게 전환되도록 설정.
  - 전역 `button` 태그에 선언된 호버 시 `translateY(-1px)` 이동 및 `brightness(0.95)` 필터를 `!important`로 오버라이드하여, 마우스 오버 시 미세하게 움직이거나 어두워지던 호버 불일치 현상 완전 해결.

---

## 2026-05-27 — 배너 썸네일 잘림 수정 (Claude Code)

### 변경 내용

**`extension/content_scripts/coupang_search.js`**
- `.heaor-banner-thumb` CSS: `object-fit:cover` → `object-fit:contain`
- 이미지 비율이 정사각형이 아닌 경우(폴백 img 선택 시) 잘리던 문제 해소

**`extension/content_scripts/scraper_1688.js`**
- 동일하게 `object-fit:contain` 적용

---

## 2026-05-27 — 1688 원본 링크 기능 추가 (Claude Code)

### 변경 내용

**`extension/ui/modules/candidates.js`**
- 연결된 후보 카드에 "1688 보기" 버튼 추가 (크롤링 시작 버튼 앞)
- `url1688` 없으면 버튼 비활성화
- 클릭 시 `window.open`으로 새 탭 열기

**`extension/ui/index.html`**
- 워크스페이스 헤더에 `<a id="btn-1688-link">` 추가 (초기 hidden, 재크롤링 버튼 앞)

**`extension/ui/modules/workspace.js`**
- `openDetailView()` 내 `item.url` 있으면 링크 href 세팅 + hidden 해제

---

## 2026-05-27 — 쿠팡 배너 디자인 통일 + SPA 지속성 + 토글 핸들 (Claude Code)

### 변경 내용

**`extension/content_scripts/coupang_search.js`**
- 배너 디자인 1688 기준으로 통일 (흰색 배경, 스카이블루 액션컬러)
- 카드 썸네일: `img.fw-aspect-square` 셀렉터 + `currentSrc` 사용으로 lazy-load URL 정상 추출
- CSS `!important` class `.heaor-banner-thumb` 주입으로 Coupang 페이지 CSS 오버라이드
- SPA 페이지 이동 후 배너 재생성: `document.body.contains(_bannerEl)` 체크
- MutationObserver로 배너 제거 감지 → 자동 재주입
- 배너 토글 핸들 추가: 클릭으로 접기/펼치기, `localStorage`로 상태 영속
- 페이지 초기화 시 `GET_PENDING_CANDIDATES`로 storage에서 후보 복원
- 카드 ✕ 및 전체 닫기 시 `REMOVE_SOURCING_CANDIDATE` 메시지 전송으로 storage 동기화
- 카드 클릭 시 해당 상품 페이지(`coupangUrl`) 새 탭으로 열기

**`extension/content_scripts/scraper_1688.js`**
- 동일한 배너 스타일 적용 (흰색 배경, `#0ea5e9` 버튼)
- 배너 텍스트 "소싱 시작 →" → "URL 연결 →"

**`extension/manifest.json`**
- coupang_search.js matches: 상품 상세 URL만 → `https://www.coupang.com/*` (전 페이지)

---

## 2026-05-15 — 쿠팡 소싱 배너 + 1688 배너 디자인 통일 (Claude Code)

### 변경 내용

**`extension/content_scripts/coupang_search.js`**
- 소싱 후보 배너 추가: "+ 소싱 추가" 클릭 시 쿠팡 검색 페이지 상단에 누적 배너 표시
  - 썸네일 + 이름 카드 슬라이더 + 개수 배지 + 전체 닫기
  - 후보가 없으면 배너 자동 숨김, 개별 카드 ✕ 제거 가능

**`extension/content_scripts/scraper_1688.js`**
- 배너 디자인 UI 규칙에 맞게 통일
  - 배경: `#1a1a2e` (어두운) → `#fff` + `border-bottom:1.5px solid #e2e4e9`
  - 버튼: `#e94560` → `#0ea5e9` (빨강은 삭제 전용)
  - 선택 카드 테두리/배경: 빨강 → 스카이블루 (`#0ea5e9`)
  - 비선택 카드 배경: 반투명 흰색 → `#f4f6fb`
  - 상품명 색상: `#fff` → `#333`

---

## 2026-05-15 — UI 개선 + Step 4 개편 + 버그 수정 (Claude Code)

### 변경 내용

**`extension/ui/index.html`**
- Step 4 배지 빨강(`#e94560`) → `#1a1a2e` 통일 (빨강은 삭제 전용 규칙 준수)
- Step 4 레이아웃 개편: 중앙 텍스트 방식 → 요약 테이블 카드 (상품명·카테고리·옵션·공급가·판매가·무게)

**`extension/ui/index.css`**
- `btn-step-prev`: 큰 타원(`border-radius:50px`) → ghost 버튼 스타일로 변경
- Step 4 요약 테이블 스타일 추가 (`.step4-summary`, `.s4-label`, `.s4-val`)
- `.done-box`: 초록 계열 통일 (`#f0fdf4`)
- 소싱 후보 카드: border-top 평면 → 카드 형태(`border + border-radius`), 썸네일 44→60px, 이름 12→13px
- 대기열 카드: 썸네일 80→60px, `align-items: stretch` → `center`, 이름 12→13px, 배지 10→11px
- 두 탭 카드 스타일 통일 (썸네일 크기·패딩·폰트·border 모두 동일)

**`extension/ui/modules/workspace.js`**
- `goToStep(4)` 진입 시 Step 4 요약 테이블 자동 채우기
- 카테고리: `f-category` hidden input 대신 세부 카테고리 드롭다운 선택값 사용

**`extension/ui/modules/step4.js`**
- `renderQueue` import 추가
- 임시저장 성공 시 `item.status = 'done'` + `renderQueue()` 호출 → 대기열 카드 "완료" 배지 즉시 반영

---

## 2026-05-15 — 쿠팡 소싱 오버레이 버그 수정 + UI 개선 (Claude Code)

### 변경 내용

**`extension/content_scripts/coupang_search.js`**
- 월 판매량 과다 추정 버그 수정: `paging.isNext === false` 조건 추가로 마지막 페이지 초과 요청 방지
  - 원인: 쿠팡 리뷰 API가 마지막 페이지 이후 요청에도 빈 배열이 아닌 동일 데이터 반환 → 33페이지까지 반복 집계되어 실제 리뷰수 × 33 배 과다 계산
  - 수정: `data.rData.paging.isNext === false`이면 즉시 루프 종료
- 리뷰 API 호출 간격 300ms → 100ms 단축 (봇 탐지 방지 범위 내)
- 🔍 버튼 hover 시에만 표시 (opacity 0 → 1 on hover), z-index 2000으로 알리프라이스 등 타 확장 위에 표시
- 오버레이 z-index 2001, border-radius 16px, "+ 소싱" 클릭 후 800ms 뒤 자동 닫힘
- 버튼을 `<a>` 태그 밖 `<li>` (card) 에 직접 부착 → 클릭 시 상품 페이지 이동 방지
- 버튼 위치: `getBoundingClientRect` 기준 `figure[class*="ProductUnit_productImage"]` 중앙 계산

**`extension/ui/index.html`**
- 로그 FAB 버튼 + 글로벌 로그 바 재설계 (항상 표시 → 플로팅 버튼으로 토글)

**`extension/ui/modules/utils.js`**
- `appendGlobalLog()`: 로그창 닫혀 있을 때 FAB 빨간 점 표시
- `toggleLogBar()`: FAB 클릭 시 로그 패널 토글 + 알림 점 제거

**`extension/ui/index.css`**
- UI 규칙 전면 적용: Primary `#0ea5e9`, Danger `#e94560` (삭제 전용), Success `#16a34a`
- `.btn-primary` 스카이블루 통일, `.btn-green`/`.btn-blue` 제거
- 탭 배지, stepper done 색상, 카드 패딩 등 세부 컴포넌트 규칙 준수

---

## 2026-05-15 — UI 구조 개편: URL 분리 / 탭 구조 / 워크스페이스 연동 (Claude Code)

### 변경 내용

**`docs/UI-RULES.md`** (신규)
- 디자인 시스템 규칙 문서 — 색상 토큰, 타이포, 버튼/카드/인풋/배지/탭 컴포넌트 규칙

**`docs/ui-mockup.html`** (v2 업데이트)
- 7개 화면 전체 플로우: 소싱 후보 탭 / 대기열 탭 / 스플릿 레이아웃 / Step 1~4
- URL 입력 섹션 별도 컨테이너로 분리, Step 2 세로 스크롤, Step 3 실제 상세페이지 이미지

**`extension/ui/index.html`**
- URL 입력창 `.split-layout` 외부 `#url-section.url-section-bar`로 분리
- 사이드바 탭 구조 전환: `#tab-candidates` / `#tab-queue` + `#badge-candidates` / `#badge-queue`
- `#panel-candidates` (기본 표시) + `#panel-queue` (기본 `hidden`) + `.queue-header-bar`
- 대기열 스크롤 컨테이너 `#queue-scroll` → `.queue-scroll-vertical#queue-scroll`

**`extension/ui/index.css`**
- `.url-section-bar` / `.url-section-inner` 신규
- `.sidebar-tabs` / `.sidebar-tab` / `.sidebar-tab.active` / `.tab-badge` 신규
- `.tab-panel` / `#panel-candidates` / `.queue-header-bar` / `.queue-scroll-vertical` 신규

**`extension/ui/modules/candidates.js`**
- `renderCandidates()`: `status === 'queued'` 필터링 + `#badge-candidates` 배지 갱신
- "크롤링 시작" 클릭 시: 상태 `'queued'` 마킹 + storage 저장 + `renderCandidates()` 먼저 호출

**`extension/ui/modules/queue.js`**
- `renderQueue()`: `#badge-queue` 배지 갱신 (아이템 수)

**`extension/ui/modules/workspace.js`**
- `openDetailView()`: `#url-section` 숨김
- `closeDetailView()`: `#url-section` 복원

**`extension/ui/index.js`**
- `switchTab(name)` 함수 추가 + `DOMContentLoaded`에 탭 클릭 이벤트 등록

---

## 2026-05-15 — 소싱 후보 UX 개선 + categoryId 자동 입력 + 카테고리 복원 (Claude Code)

### 변경 내용

**`extension/content_scripts/scraper_1688.js`**
- 배너 버튼 텍스트: "소싱 시작 →" → "URL 연결 →" (크롤링은 익스텐션 UI에서 수동 시작)

**`extension/ui/modules/candidates.js`**
- `onCandidateLinked()`에서 `_addToQueueFromCandidate` 자동 호출 제거
- 연결된 카드에 "크롤링 시작" 버튼 추가 (클릭 시 addToQueueFromCandidate 실행)
- 버튼(크롤링 시작 / 직접입력 / 삭제)을 `.cand-body` 밖 `.cand-actions` div로 이동 → 우측 정렬

**`extension/ui/index.css`**
- `.cand-card`: `align-items: flex-start` → `align-items: center`, `position: relative` 제거
- `.cand-card.cand-linked`: `opacity: 0.65` 제거 (연결된 카드가 희미하게 보이던 문제)
- `.cand-actions` 신규: `display: flex; align-items: center; gap: 6px; flex-shrink: 0;`
- `.cand-del-btn`: `position: absolute` 제거 (flex 내 정상 흐름)
- `.cand-body`: `padding-right: 20px` 제거

**`extension/manifest.json`**
- CSP `connect-src`에 `https://xauth.coupang.com` 추가 (카테고리 조회 리다이렉트 허용)

**`extension/ui/modules/step1-category.js`**
- `fetchCategory`: `credentials: 'include'` 폐기 → Cookie header 수동 주입 방식 복원
- `fetchCategory`: `Accept: 'application/json'` 헤더 추가 (HTML 응답 방지)
- `renderDisplayCodeSelect`: `savedCode` 파라미터 추가 — 이전에 선택한 드롭다운 값 복원
- `renderDisplayCodeSelect` change 이벤트: `tabId` 동적 조회 (`chrome.tabs.query`)로 변경
- `saveCategoryMeta`: `categoryCodeCandidates` 배열 `queueData`에 저장
- `restoreCategoryUI(itemId)` export 신규 추가 — 재조회 없이 드롭다운 복원

**`extension/ui/modules/workspace.js`**
- `initWorkspace`: `fetchCategory`, `restoreCategoryUI` 콜백 슬롯 추가
- `openDetailView`: `restoreProgress` 후 카테고리 자동 복원 로직 추가
  - `f-category-id` 비어 있고 `item.categoryId` 있으면 자동 입력
  - `item.categoryPath` 있으면 `f-category` 경로 텍스트 표시
  - `item.categoryCodeCandidates` 있으면 `restoreCategoryUI` 호출 (재조회 없음)
  - 위 조건 없고 categoryId 있으면 `fetchCategory` 자동 호출

**`extension/ui/index.js`**
- `restoreCategoryUI` import 추가 (`step1-category.js`)
- `initWorkspace` 호출에 `fetchCategory`, `restoreCategoryUI` 인수 추가

**`docs/ui-mockup.html` (신규)**
- 현재 UI / A안 / B안 나란히 비교하는 HTML 목업 파일 생성

---

## 2026-05-14 — 쿠팡 소싱 후보 관리 + 1688 자동 연결 (Claude Code)

### 변경 내용

**`extension/manifest.json`**
- `host_permissions`: `https://www.coupang.com/*` 추가
- `content_scripts`: `coupang_search.js` 추가 (쿠팡 검색/캠페인/카테고리 페이지)
- CSP `connect-src`: `https://www.coupang.com` 추가

**`extension/content_scripts/coupang_search.js` (신규)**
- 쿠팡 검색 결과 카드에 오버레이 부착 (월 예상 판매량 + "+ 소싱" 버튼)
- 월 판매량: DOM 리뷰수 × 10 초기 표시 → IntersectionObserver로 API 비동기 교체
- MutationObserver: 페이지네이션/무한스크롤로 추가되는 카드에 자동 부착
- "+ 소싱" 클릭 → `ADD_SOURCING_CANDIDATE` 메시지로 SW에 후보 저장

**`extension/content_scripts/scraper_1688.js` (수정)**
- 페이지 진입 시 `GET_PENDING_CANDIDATES`로 pending 후보 확인
- 후보 있으면 상단 고정 배너 표시 ("이 상품을 [후보명]으로 소싱하기")
- 후보 여러 개: `<select>` 드롭다운으로 선택
- 배너 클릭 → `LINK_1688_TO_CANDIDATE` 메시지 → 연결 완료

**`extension/background/service-worker.js` (수정)**
- `ADD_SOURCING_CANDIDATE`: candidates 배열에 추가, storage 저장, UI 브로드캐스트
- `GET_PENDING_CANDIDATES`: status='pending' 후보 전체 반환
- `LINK_1688_TO_CANDIDATE`: url1688 저장, status→'linked', UI 브로드캐스트
- `REMOVE_SOURCING_CANDIDATE`: 해당 candidateId 삭제, UI 브로드캐스트

**`extension/ui/modules/state.js` (수정)**
- `sourcingCandidates: []` 추가

**`extension/ui/modules/candidates.js` (신규)**
- 좌측 패널 상단 소싱 후보 카드 렌더링 (접이식 섹션)
- 카드: 쿠팡 썸네일 / 상품명 / 가격 / status / 삭제 버튼
- "직접 입력" 버튼: 1688 URL 수동 입력 인풋 노출
- linked 상태 → `addToQueueFromCandidate()` 자동 실행

**`extension/ui/modules/queue.js` (수정)**
- `addToQueueFromCandidate(candidate)` 추가: 후보 연결 시 자동 큐 진입 + 크롤링 시작

**`extension/ui/modules/messages.js` (수정)**
- `CANDIDATE_ADDED`, `CANDIDATE_LINKED`, `CANDIDATE_REMOVED` 케이스 추가

**`extension/ui/index.html` (수정)**
- 좌측 사이드바 상단에 "쿠팡 소싱 후보" 접이식 섹션 추가

**`extension/ui/index.css` (수정)**
- 소싱 후보 패널 스타일 추가 (`.candidates-section`, `.cand-*`)

**`extension/ui/index.js` (수정)**
- `candidates.js` import + `initCandidates()`, `onCandidateAdded/Linked/Removed` 콜백 연결

---

## 2026-05-14 — Step 4 색상 속성명 동적화 + Step 2/3 크롭 이미지 개선 (Claude Code)

### 변경 내용

**`extension/ui/modules/step4.js`**
- 색상 속성명 동적화: 스키마 API `exposedAttributes.examples`에서 `/색상/` 매칭 속성명 자동 추출
  - 카테고리에 따라 `'색상'` 또는 `'색상/항'` 등 다른 속성명 자동 사용
  - 추출 실패 시 `'색상'` 폴백

**`extension/ui/modules/step2-imagegrid.js`**
- Step 3 이미지 그리드에 크롭 이미지(`state.croppedImageKeys`) 추가 표시
- 크롭 이미지 아이템에 `crop-item` 클래스 부여

**`extension/ui/index.css`**
- `.img-grid-item.crop-item img`: `object-fit: contain` + 회색 배경 — 크롭 이미지 잘림 방지

**`extension/background/service-worker.js`**
- `fetchDetailImages`: `data-src` 속성도 함께 추출 (지연 로딩 이미지 대응)
- 최대 추출 수: 20개 → 40개로 확대
- `offer_details` JS 변수 형태(`var offer_details={"content":"..."}`) JSON 파싱 후 img 추출

---

## 2026-05-13 — 2D SKU 색상·사양 옵션 UX 개선 (Claude Code)

### 변경 내용

**`extension/ui/modules/step2-options.js`**
- 이미지 없는 색상 카드: 빈 플레이스홀더 제거 → `no-thumb` 클래스 추가 (컴팩트 레이아웃)
- 그룹 렌더 순서 정렬: 사양(칩) → 색상(카드) 순으로 표시 (사양 먼저 선택하는 흐름)

**`extension/ui/modules/step1-form.js`**
- `onSkuChange`: 사양 차원 옵션 선택 시 `f-spec` 자동 입력
- `onSkuChange`: 가격 계산 시 사양 차원 우선 — 색상 선택해도 사양 가격 유지

**`extension/ui/index.css`**
- `.option-card.no-thumb` 스타일 추가 (이미지 없는 카드용 컴팩트 패딩)

---

## 2026-05-13 — SKU 가격/팝업/속성 수집 버그 3종 수정 (Claude Code)

### 변경 내용

**`extension/background/service-worker.js`**
- `isColorDim`: 썸네일 이미지 유무 + 차원명 키워드(`颜色|色彩|色系`) 병행 체크로 변경
  - 이전: 이미지 없는 색상 차원이 `false`로 잘못 분류되어 칩 렌더링 → 팝업 미표시
- SKU 구성 로직: 단순 배열 → `Map` 기반 중복 제거로 변경
  - 2D 제품(색상×사양)에서 모든 차원(색상+사양 둘 다) 항목을 `skus`에 포함
  - 동일 옵션명은 최고가 기준으로 dedup → 사양 칩 선택 시 가격 업데이트 가능
  - 초기 최저가 계산도 더 정확해짐
- `parseAttributesFromHtml` skip 목록: `'사양'` 추가
  - SKU 차원 메타데이터 "사양"이 속성으로 잘못 수집되어 f-spec에 모든 사양값이 합쳐서 들어가는 문제 해결

**`extension/ui/modules/step2-options.js`**
- `renderOptionCards`: `isColor` 판별에 차원명 키워드 체크 추가 (`색상|颜色|color` 등)
  - 이미 스크랩된 제품(isColorDim=false인 구 데이터)에서도 런타임에 정상 동작

---

## 2026-05-13 — 사양/무게 수집 + Step 1 UI 편집 필드 추가 (Claude Code)

### 변경 내용

**`extension/background/service-worker.js`**
- `parseAttributesFromHtml`: `装箱数`, `箱规` skip 목록 추가 (도매 포장 정보 필터링)
- `mapContextData`: 무게 폴백 추가 — 속성에 `무게` 없으면 `pieceWeightScale.pieceWeightScaleInfo[0].weight`(g) 사용
- 디버그 로그 제거 (`[productPackInfo]`, `[속성]`)
- 속성 파싱 방식: `<td>` 구조 → HTML 내 JSON `"name"/"value"` 패턴 파싱으로 변경

**`extension/ui/index.html`**
- Step 1 폼에 `사양(f-spec)`, `무게(f-weight)` 입력 필드 추가 (g2 그리드, 재질 행 아래)

**`extension/ui/modules/step1-form.js`**
- `fillStep1`에서 사양/무게 자동 입력 추가 (속성 배열에서 이름 매칭)

**`extension/ui/modules/workspace.js`**
- `saveProgress`: `spec`, `weight` 필드 추가
- `restoreProgress`: `f-spec`, `f-weight` 복원 추가
- input 이벤트 리스너: `f-spec`, `f-weight` 추가

**`extension/ui/modules/step4.js`**
- executeScript args에 `spec`, `weight` 추가
- 사이즈 exposedAttribute: `f-spec` 값 사용, 없으면 `'one size'` 폴백

**문서**
- `CLAUDE.md`: Step 1 UI 구조, 서플라이어 허브 사이즈 설명 업데이트
- `docs/modules/step1.md`: fillStep1 함수 설명 업데이트
- `docs/modules/step4.md`: 사이즈/무게 처리 설명 업데이트

---

## 2026-05-13 — Plan B 제거 + 로그인 에러 처리 개선 (Claude Code)

### 변경 내용

**`extension/background/service-worker.js`**
- Plan B(탭 열기 + window.context) 코드 완전 삭제 — Plan A(BackgroundFetch)로 단일화
- 삭제된 함수: `findOrCreateTab`, `waitForTabLoad`, `pageInterceptorFn`
- 삭제된 리스너: `chrome.tabs.onUpdated` 1688 인터셉터 주입
- 삭제된 핸들러: `handleRegisterRequest` / `REGISTER_REQUEST` (dead code)
- Plan A 실패 시: "1688 로그인이 필요합니다" 에러 메시지 + 로그인 탭 자동 열기
- `tryBackgroundFetch`: 속성 수집 결과 로그 추가 (`[속성] N개: [...]`)
- 수집 완료 로그에 속성 수 포함 (`속성 N개`)

---

## 2026-05-13 — window.context SSR 스크래퍼 전환 (Claude Code)

### 변경 내용

**`extension/background/service-worker.js`**
- `extractWindowContext(html, debug)`: HTML에서 `window.context` IIFE 패턴 감지 후 data 인수 JSON 추출
  - `window\.context\s*=/g` 정규식으로 `window.contextPath` 오인식 방지
  - IIFE 함수 바디 bracket-count 스킵 → `,{` 이후 data 인수 추출
  - unquoted 숫자 키(`{5703581853351:0.5}`) → `{"5703581853351":0.5}` 전처리 후 JSON.parse
- `parseAttributesFromHtml(html)`: `<td>키</td><td>값</td>` 구조 파싱으로 재료·사양·무게 등 속성 수집
- `htmlDecodeStr(str)`: `&gt;`, `&lt;` 등 HTML 엔티티 디코딩
- `mapContextData(ctx, htmlText)`: window.context → `{title_cn, images, skus, sku_groups, attributes, detailUrl}` 변환
  - SKU 가격: `discountPrice` 우선 사용 (`price` 없을 수 있음)
  - SKU 이미지: `skuProps`에서 이름 매칭으로 추출
- `fetchDetailImages(detailUrl)`: 상세 이미지 URL 별도 fetch → img src 추출
- `tryBackgroundFetch(url)`: Plan A — 쿠키 포함 SW fetch → window.context 파싱 → 탭 없이 완료
- `handleScrapeRequest`: Plan A 먼저 시도, 실패 시 Plan B(탭 방식) fall-through
  - Plan B: `executeScript(world:'MAIN')`으로 탭에서 `window.context` 직접 읽기

**`extension/ui/modules/scrape.js`**
- `scrape_method === 'BackgroundFetch' || 'WindowContext'`이면 번역 전체 스킵 (이미 한국어)
- `sku_groups_translated`: 번역 없이 `dimension_kr = dimension`, `name_kr = name`으로 직접 매핑

**`extension/ui/modules/step4.js`**
- `attributes` → executeScript args에 추가
- 사이즈 exposedAttribute: `'one size'` 고정 → `attributes`에서 `사양` 값 추출 (없으면 `'one size'` 폴백)

**`docs/work-plans/scraper_window_context.md`** (신규)
- 작업 계획서 작성

### 결과
- Plan A(BackgroundFetch): 탭 없이 ✅ 동작 (SKU 5개, 이미지 10장 확인)
- Plan B(WindowContext): 탭 방식 ✅ 동작 (Plan A 실패 시 폴백)
- 번역 스킵 ✅ (한국어 데이터 그대로 사용)
- 재질(속성) 수집: 미완료 🔄 (parseAttributesFromHtml 결과 0개, 다음 세션에서 디버그 예정)

---

## 2026-05-08 — 이미지 매칭/업로드 버그 수정 (Claude Code)

### 변경 내용

**`extension/ui/modules/step2-options.js`**
- `toggleImageAssignmentTo`: 이미지 할당 시 `push` → `unshift` 로 변경
  - 수동으로 매칭한 이미지가 배열 첫 번째(대표 이미지)가 되도록 수정
  - 기존: 자동 할당된 SKU 썸네일이 항상 [0]에 남아 대표 이미지로 업로드되던 문제 해소

**`extension/ui/modules/step4.js`**
- MAIN 이미지 업로드 전 canvas로 JPEG 변환 (`toJpegBlob`) 추가
  - WebP 등 Java ImageIO 미지원 포맷 → JPEG 강제 변환 후 업로드
  - 파일명 한국어 제거: `main_화이트.jpg` → `main_0.jpg` 형태로 변경
  - MAIN 업로드 응답 로그 길이 제한 해제

**`extension/ui/modules/workspace.js`**
- `openDetailView()`: `restoreProgress()` → `await restoreProgress()` 변경 — 크롭 이미지 IDB 복원이 완료된 후 다음 단계로 진행되도록 수정
- `openDetailView()`: `renderImageGrid()` 호출 제거 — `goToStep(3)` 진입 시에만 렌더링하도록 변경
  - `restoreProgress()` 이전에 그리드가 렌더링되어 저장된 매칭이 반영 안 되던 문제 해소
- `goToStep(3)`: 그리드에 이미 아이템이 있으면 전체 재렌더 대신 배지만 갱신하도록 변경
  - Step 3 재진입 시 매칭 표시가 사라지던 문제 해소

**`extension/ui/index.js`**
- `renderCroppedItem` import 추가 + `initWorkspace`에 전달 — 크롭 이미지 복원 시 UI 렌더링 콜백 연결

**`CLAUDE.md`**
- UI 구조 Step 1/3 설명을 현재 구현에 맞게 수정
- 법적 근거 증빙 서류 adCert "조사 중" → 해결됨으로 업데이트

---

## 2026-05-07 — UX 개편 + 퍼시스턴스 수정 (Claude Code)

### 변경 내용

**`extension/content_scripts/scraper_1688.js`**
- scrollToBottom: `setTimeout(step, 200)` → `setTimeout(step, 80)`, `setTimeout(resolve, 1500)` → `setTimeout(resolve, 800)` (스크랩 속도 향상)

**`extension/ui/modules/state.js`**
- `optionCustomNames: {}` 추가 — 원본 옵션명 → 사용자 수정명 매핑
- `croppedImageKeys: []` 추가 — 크롭 이미지 IDB 키 목록

**`extension/ui/modules/step1-form.js`**
- 상품명 비동기 덮어쓰기 버그 수정: Gemini 정제 완료 후 현재 값이 "상품명 정제 중..."일 때만 업데이트
- `onSkuChange()` f-option 표시를 수정명(`optionCustomNames`)으로 반영

**`extension/ui/modules/step2-options.js`**
- 옵션 카드 클릭 → 이름 입력 팝업(`showNameInputPopup`) 표시 (기본값: name_kr)
- 확인 시 `optionCustomNames`에 수정명 저장 + `selectedOptions`에 원본명 추가
- 해제 시 `optionCustomNames`에서도 제거
- `showOptionPicker` 팝업 버튼 텍스트에 수정명 반영

**`extension/ui/modules/step2-imagegrid.js`**
- 옵션 배지 텍스트에 수정명 반영

**`extension/ui/modules/step2-cropper.js`**
- `renderDetailImgList()`: `state.croppedImageKeys = []` 초기화 추가
- `addCroppedImage()` async 변경: 크롭 시 IDB에 저장 (`crop_${itemId}_${ts}` 키)
- `renderCroppedItem(dataUrl, key)` 함수 분리 + export: IDB 삭제 포함한 × 버튼 핸들러

**`extension/ui/modules/workspace.js`**
- `openDetailView()`: `state.croppedImageKeys = []`, `state.optionCustomNames = {}` 초기화 추가
- `goToStep(3)`: `_renderImageGrid()` 호출 추가 (이미지 그리드 Step 3 표시)
- `saveProgress()`: `croppedImageKeys`, `optionCustomNames` 저장 추가
- `restoreProgress()` async 변경: IDB에서 크롭 이미지 복원 (Base64 Data URL로 변환)
- `openDetailView()`: `await restoreProgress(item.progress)` 로 변경
- `_renderCroppedItem` 콜백 슬롯 추가

**`extension/ui/modules/step3.js`**
- `genLabel()` 옵션명 텍스트에 수정명 반영

**`extension/ui/modules/step4.js`**
- `makeSkuEntry` 색상 `attributeValue`에 수정명 반영
- `logisticsPage`: `totalSKUsInBox: 30`, `daysToExpiration: 365`, `skuUnitBoxWeight: '500'`, `skuUnitBoxDimension: '150*300*400'`, `fashionYear: String(new Date().getFullYear())`, `fashionSeason: '사계절'`
- `args`에 `optionCustomNames` 추가

**`extension/ui/modules/idb.js`**
- `remove(key)` 함수 추가 + export

**`extension/ui/index.html`**
- Step 1: `.image-grid-zone` 제거, 옵션 카드만 표시
- Step 3: `#img-grid` 이미지 매칭 섹션 추가, 불필요한 버튼(재렌더링·다운로드) 제거

**`extension/ui/index.css`**
- 옵션 이름 입력 팝업 스타일 추가 (`.option-name-popup` 등)
- `.preview-img` 가운데 정렬 (`margin: 12px auto 0`)

**`extension/ui/index.js`**
- `renderCroppedItem` import + `initWorkspace` 전달 추가
- 불필요한 버튼 이벤트 리스너 제거

---

## 2026-05-06 — Step 4 legalPage 수정 + notices 동적화 (Claude Code)

### 변경 내용

**`extension/ui/modules/step1-category.js`**
- `fetchNoticeNumber` → `fetchNoticeSchema`로 확장
  - 스키마 API 응답에서 `noticeNumber` + `noticeItems` 배열 동시 추출
  - 응답 필드 시도 순서: `j.notices → j.noticeItems → j.productNoticeItems`
  - 카테고리 선택(초기 + 드롭다운 변경) 시 `queueData[id].productNoticeItems` 저장

**`extension/ui/modules/step4.js`**
- `adCert: ''` 완전 제거 — 필드 absent = "없음", 빈 문자열 전송 = "있음"으로 표시되던 문제 해소
- `legalPage.notices` 동적 구성: `p.noticeItems` 배열로 전체 항목 "상세페이지 참조" 처리
  - 폴백: `productNoticeItems` 없을 때 5개 공통 항목 사용
- executeScript args에 `noticeItems: item.productNoticeItems || []` 추가

---

## 2026-05-06 — Step 4 이미지 업로드 500 오류 수정 + colorOptions 폴백 (Claude Code)

### 변경 내용

**`extension/ui/modules/step4.js`**
- **Pre-update 추가**: `/sr/draft/api/create` 직후, 이미지 업로드 전에 빈 imagePage 포함한 전체 구조로 `/sr/draft/api/update` 선행 호출
  - 원인: 업로드 API가 draft의 `imagePage` 노드를 읽는데 create 시 `startPage`만 전송 → Jackson NPE(서버 500)
- **colorOptions 폴백**: `sku_groups_translated` 없거나 단일 차원일 때 필터 결과 빈 배열 → 선택된 전체 옵션을 색상으로 처리
- `legalPage` 상수 + `makeSkuEntry()` 헬퍼 함수로 리팩토링

**`extension/background/service-worker.js`**
- 1688 이미지 다운로드 fetch 요청에 `Accept: image/jpeg,image/png,image/*;q=0.8` 헤더 추가
  - 원인: 1688 CDN이 기본 Accept 헤더에 WebP 응답 → Java ImageIO WebP 미지원 → MAIN 이미지 업로드 500

---

## 2026-05-06 — Step 4 필드 누락 수정 (Claude Code)

### 변경 내용 (`extension/ui/modules/step4.js`)

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 모델명 | 미전송 | `productPage.modelNumber = productName` |
| SKU 행 구성 | selectedOptions 전체 (색상+사양) | 색상 옵션만 행 생성 |
| exposedAttributes | 색상만 | 색상 + 수량(`f-qty`) + 사이즈(`one size` 고정) |

- 색상/사양 구분: `isColorDim` 플래그 + `imageUrl` 유무 + 키워드 매칭으로 판별
- 사이즈: 1688 API 규격 미수집 → `one size` 고정 (추후 교체 예정)

---

## 2026-05-04 — Step 4 버그 분석 + 구조 수정 (Claude Code)

### 네트워크 로그 수집
사용자가 서플라이어 허브에서 직접 상품 등록하며 네트워크 요청 기록 → `docs/api_update/` 저장.

### 수정된 버그 5개 (`extension/ui/modules/step4.js`)
1. `version: 160` → `164`
2. `productPage.commonAttributes` 구조 누락 → 가격/속성이 비어있던 원인 수정
3. `brand`: `'헤오르'` → `'브랜드 없음'`
4. `manufacturer`: `'헤오르'` → `'헤오르 협력사'`
5. 이미지 파일명 추출: `j[0]`(객체 전체) → `j[0]?.imageName`(문자열)
6. 다중 SKU: 단일 jsonDocument 항목 → 옵션별 개별 행 생성

---

## 2026-05-04 — Step 4 버그 분석 (네트워크 로그 수집)

### 작업 내용
- 사용자가 서플라이어 허브 직접 등록하며 네트워크 요청 기록 → `docs/api_update/` 저장
- 현재 `step4.js`와 실제 API 스펙 비교 분석 완료

### 발견된 버그 (수정 예정)
1. `version: 160` → `164` 로 변경 필요
2. `productPage.commonAttributes` 구조 누락 → 가격/속성이 비어있던 원인
3. `brand`: `'헤오르'` → `'브랜드 없음'`
4. `manufacturer`: `'헤오르'` → `'헤오르 협력사'`
5. 이미지 파일명 추출 오류 (`j[0]?.imageName` 으로 수정 필요)
6. 다중 SKU 옵션별 jsonDocument 항목 개별 생성 필요

---

## 2026-04-29 — index.js 모듈화 + 폴더 정리 (Claude Code)

### 변경 내용

**`extension/ui/index.js` 1,687줄 → 진입점 55줄으로 축소**
- 기능별 17개 ES 모듈로 분리 (`extension/ui/modules/`)
- 순환 의존: 콜백 주입 패턴 (`initQueue`, `initWorkspace`, `initScrape`, `initImageGrid`, `initMessageHandler`)

**`extension/vendor/` 신규 생성**
- html2canvas.min.js, jszip.min.js — 서드파티 라이브러리 전용 폴더

**`extension/lib/` 삭제**
- idb.js, price_calculator.js, translator.js, html_renderer.js → `modules/`로 이동 (export 추가)
- html2canvas.min.js, jszip.min.js → `vendor/`로 이동

**`extension/ui/index.html`**
- `../lib/*.js` 스크립트 태그 제거
- `../vendor/html2canvas.min.js`, `../vendor/jszip.min.js` 전역 로드
- `index.js`에 `type="module"` 추가

**`extension/manifest.json`**
- `web_accessible_resources`: `"lib/*"` → `"vendor/*"`

**displayCategoryCode 추출 구현 (`modules/step1-category.js`)**
- `/qvt/v3/kan-categories/download-quotation` ZIP → JSZip 두 번 파싱 → sharedStrings.xml 정규식 추출
- 후보 복수 시 라디오 버튼 UI

**문서**
- `docs/MODULES.md` 신규 (전체 모듈 지도)
- `docs/modules/*.md` 8개 신규 (state, queue, scrape, workspace, step1, step2, step3, step4)
- `CLAUDE.md` 파일 구조 섹션 재작성
- `docs/work-plans/README.md` Claude Code 단독 작업 흐름으로 업데이트

---

## 2026-04-23 — Step 2 크롭 UI 개선 + 라벨/상세페이지 렌더링 픽스 (Claude Code)

### 4단계 스텝 구조 (`ui/index.html`, `ui/index.js`, `ui/index.css`)
- Step 3(정보검수) → Step 4 구조였던 것을 Step1~4로 명확화
  - Step1: 정보검수, Step2: 이미지크롭, Step3: 결과확인(라벨/상세페이지 미리보기), Step4: 쿠팡론칭
- `genAllMedia()`는 Step3 진입 시에만 호출 (크롭 전 조기 생성 방지)

### 자유 크롭 + 자동 스크롤 (`ui/index.js`, `ui/index.css`)
- 개별 이미지 드래그 → `detail-img-list` 단일 핸들러로 교체 (여러 이미지에 걸친 자유 크롭)
- 크롭 선택 영역이 여러 이미지에 걸치면 세로 합성 캔버스 생성
- 드래그 중 커서가 상/하 60px 진입 시 rAF 기반 자동 스크롤
- 리스트 상대 좌표계로 스크롤해도 선택 영역 유지
- `.detail-img-item img` width 70% (가시성 개선)

### 수량 반영 가격 계산 (`lib/price_calculator.js`, `ui/index.js`)
- `calculatePrices(yuanPrice, qty)` — 원가 = 위안가 × 400 × 수량

### 라벨 이미지 완전 재구현 (`static/label/index.html`, `static/label/style.css`)
- 기존: Figma 자동 익스포트 방식 (절대 좌표 텍스트 나열, 10.png 배경 의존)
- 변경: 시맨틱 `<table>` + CSS border로 완전 재구현 (외부 이미지 의존 없음)
- 동적 필드: 상품명(`.name`), 색상(`.color`), 재질(`.mtl`), 수량(`.count`)
- 고정 필드: 소비자 상담실, 제조자, 수입자, 반품 및 교환 — HTML에 직접 작성

### 상세페이지 렌더링 픽스 (`lib/html_renderer.js`)
- 이미지 슬롯 주입: blob URL → data URL(base64)로 변경
  - `foreignObjectRendering` SVG 직렬화 시 blob URL은 null origin에서 fetch 차단됨
- 상세페이지 캡처: `foreignObjectRendering: false` 명시 (data URL 대용량이 SVG 직렬화 시 실패하는 문제 회피)
- 라벨 캡처: `foreignObjectRendering: true` 유지 (한국어 폰트 정확 렌더링)
- `@import url('https://fonts.googleapis.com/...')` 제거 — 시스템 폰트 스택(`Apple SD Gothic Neo`, `Malgun Gothic`)으로 대체
- 10.png 배경 주입 코드 완전 제거

---

## 2026-04-17 - UI/UX 전면 개편: Master-Detail (좌우 분할) 레이아웃 도입 (Antigravity)

### 변경 내용
1688 오토소싱 익스텐션의 사용성 극대화를 위해 기존의 중앙 팝업 모달(4단계) 방식을 폐기하고, SaaS 앱 표준인 좌우 분할(Split Pane) 형태의 3-Step 데스크톱 위저드로 UI 및 UX를 전면 재작성했습니다.

**`extension/ui/index.html` & `extension/ui/index.css`**
- `.split-layout`, `.sidebar`, `.workspace` 기반의 Flexbox 레이아웃 도입.
- 해상도 붕괴 문제를 해결하고 측면 큐(Queue) 대기열 리스트를 항상 볼 수 있도록 개선.
- 화려한 효과를 배제하고 직관적이고 깔끔한 이메일 클라이언트 스타일의 디자인 적용.

**`extension/ui/index.js`**
- `goToStep` 등 기존 파일 파편화 및 4단계 모달 전환 로직 제거.
- `openModal` 함수를 `openDetailView`로 전환, 3-Step 데이터를 한 화면에 렌더링.
- 2단계 이미지 매핑 시 수동 렌더링 버튼 클릭을 제거하고, `genAllMedia()`를 비동기 호출하여 하단에 즉각적인 이미지 렌더링 프리뷰(Live Preview) 기능 제공.

---

## 2026-04-17 - 1688 순수 DOM 스크래퍼 전면 개편 (Antigravity)

### 변경 내용
1688 페이지의 복잡한 데이터를 가로채기 위해 작성되었던 약 1,000줄의 방대하고 잦은 타임아웃을 유발하는 클로드(Claude) 버전 코드를 폐기하고, 사용자가 직접 테스트해 해결했던 "화면 강제 크롤링(DOM Scraping)" 위주로 코드를 약 200줄 규모로 경량화 및 전면 재작성했습니다.

**`extension/content_scripts/scraper_1688.js`**
- `window.__1688_intercepted__` 대기 및 fetch/XHR 후킹 폴백 제거
- `document.querySelector`를 사용하여 제목, 옵션명, 옵션 썸네일, 속성 추출 로직 통합
- 제목 추출 안전망으로 `document.title` 문자열 스플릿(`-`) 폴백 추가
- 4단계 위저드(스텝 모달) UI를 1원클릭 대시보드로 압축하는 UX 안이 논의되었으나, 사용자 기획 재검토 요청으로 UI 수정은 보류됨.

---

## 2026-04-16 - SKU 크롤링 해결 (DOM 셀렉터)

### 원인 및 해결

**문제**: 1688 크롬 익스텐션에서 SKU 옵션이 0개로 수집됨
**원인**: 1688 서비스워커가 SKU API 응답을 캐싱 → fetch/XHR hook 우회
**해결**: SKU 데이터는 API가 아닌 DOM에 직접 렌더링됨을 확인
- 색상 버튼 HTML 구조 확인: `<span class="item-label" title="색상명">색상명</span>`
- `.item-label` 셀렉터 추가로 즉시 해결

### 변경 파일

**`extension/content_scripts/scraper_1688.js`**
- DOM SKU 셀렉터에 `.item-label`, `[class="item-label"]` 추가
- `.item-label`은 span이라 img 없음 → `.closest()`로 부모 컨테이너에서 이미지 탐색
- `hasSkuPrices()` 전역 함수로 분리 (scope 오류 수정)
- `waitForPageData()` 대기 시간 3초 → 5초
- `dom-intercept:found(force)` 체크: SKU 있을 때만 반환
- window 깊은 탐색 추가 (`deepFindSku`, WeakSet 순환 참조 방지)
- 인라인 스크립트: 번들 JS 제외(`/*!`, `!function`, `(function`), 크기 오름차순 정렬
- HTML 소스 직접 fetch 폴백 추가 (`cache: 'no-store'`)
- `api-diag` → `api-list` (URL명만 간결하게)

**`extension/content_scripts/interceptor_1688.js`**
- SW Cache Storage 전체 삭제 추가 (`caches.keys()`)
- SW 등록 해제 추가 (`navigator.serviceWorker.getRegistrations()`)
- mtop success 콜백에서 데이터 처리 추가
- Promise 방식 처리 추가 (`reqResult.then(...)`)
- offerdetail API 강제 저장 (`postProduct(dd, 'offerdetail-force')`)
- mtop 재호출 500ms 딜레이 추가

### 결과
- 옵션 0개 → 5개 수집 성공 ✅
- 가격 5.5위안 정상 수집 ✅
- `dom-sku:.item-label:5`, `dom-price-map-success` 확인

---

## 2026-04-15 - UI/UX 개편 + SKU 수정 계획서 작성

### 작업 내용 (Antigravity 플래닝)

**docs/work-plans/05_ui_ux_overhaul.md** (신규)
- SKU 크롤링 디버그 결과 정리 (`present:[none]` — 키워드 탐색 선행 필요)
- 스텝 모달 위저드 UI 설계 (4단계: 정보 → 옵션&이미지 → 생성 → 등록)
- 옵션별 이미지 1:1 할당 워크플로우 상세 설계
- 글로벌 로그 바 설계 (하단 고정, 클릭 토글 확장/축소)
- 파일별 수정 내역 + 엣지 케이스 + 구현 순서 명세

**docs/work-plans/README.md**
- 05번 계획서 항목 추가

---

## 2026-04-15 - Chrome Extension 핵심 버그 수정

### 수정된 버그

**`extension/side_panel/index.js`**
- `fillForm()`의 `const skus` 이중 선언(SyntaxError) 수정 → 추가 버튼 동작 복구
- `downloadImagesViaSwitch()`: 30초 타임아웃 + `chrome.runtime.lastError` 처리 (무한 대기 방지)
- `onScrapeDone()`: try-catch 추가, `item.thumb` 설정 로직 추가 (대기열 썸네일)

**`extension/manifest.json`**
- `style-src 'unsafe-inline'` 추가 (inline style 차단 해제)
- `connect-src`에 `https://*.alicdn.com`, `https://*.alibaba.com` 추가 (이미지 fetch 허용)
- `cdnjs.cloudflare.com` script-src에서 제거 (MV3 외부 스크립트 로드 불가)

**`extension/side_panel/index.html`**
- html2canvas: CDN → 로컬(`../lib/html2canvas.min.js`)으로 교체

**`extension/lib/html2canvas.min.js`** (신규)
- html2canvas 1.4.1 로컬 번들 (198KB)

**`extension/content_scripts/scraper_1688.js`**
- 이미지 URL `//cdn...` → `https://cdn...` 정규화
- 크롤링 완료/오류 시 `CLOSE_TAB` 메시지 전송

**`extension/background/service-worker.js`**
- `CLOSE_TAB` 핸들러 추가 (크롤링 후 1688 탭 자동 닫기)

### 결과
- 추가 버튼 ✅ / 이미지 로딩 ✅ / 카드 클릭 ✅ / 탭 자동 닫힘 ✅

---

## 2026-04-13 - Chrome Extension 계획서 검토 + 문서 정리

### 작업 내용 (Claude Code 검토)

**docs/work-plans/04_chrome_extension.md**
- "9. 클로드 코드 검토 결과" 섹션 추가
  - 필수 보완 4개: Shadow DOM 스크롤, SW 수명, 이미지→Canvas 경로, 파일 업로드 전략
  - 누락 기능 2개: Gemini 중국어 제거, KAN 카테고리 조회
  - 경미 보완 1개: content script 타이밍 폴링

**docs/work-plans/README.md**
- 역할 분담 수정: "Claude Code가 구현" → "Antigravity가 구현, Claude Code는 검토"
- 작업 흐름도 추가
- 03번 계획서 상태 설명 업데이트 (Gemini REST API로 extension에서 재검토 예정)
- 04번 상태: `📋 계획 완료` → `🔍 검토 완료, Antigravity 구현 대기`

**docs/SESSION.md**
- 현재 상태 전면 업데이트

---

## 2026-04-07 - v2.1 견적서 엑셀 기반 categoryPath 동적 조회 완성

### 변경

**modules/supplier_hub.py**
- `_download_quotation_excel(category_id, log)` 신규 추가
  - `GET /qvt/v3/kan-categories/download-quotation?leafKanCategoryIds={id}&locale=ko` 호출
  - Chrome 쿠키로 인증, ZIP 바이너리를 메모리(`io.BytesIO`)에서만 처리 → 디스크 저장 없음
  - `zipfile` → `openpyxl` 로 엑셀 파싱 → `>` 구분 경로 스캔
  - 노이즈 필터: ID가 숫자가 아닌 항목, "E.g." 예시, 가이드 텍스트 제거
  - 중복 경로 제거
- `resolve_category()`: KAN 경로 조회 + 견적서 엑셀 조회 동시 수행 → `candidates` 반환

**app.py**
- `/api/fetch-coupang-category` 상태 판정 수정: `kan_path` 또는 `candidates` 중 하나라도 있으면 `done`

### 결과
- KAN ID 710 입력 → "출산/유아동>유아목욕/스킨케어>유아목욕/욕실용품>유아목욕스펀지 (77058)" 라디오 버튼으로 표시 ✅

---

## 2026-04-04 - v2.0 Chrome 쿠키 기반 API 방식으로 전환 (진행 중)

### 변경

**modules/supplier_hub.py**
- `_get_supplier_cookies()`: `browser_cookie3`로 현재 Chrome의 `.coupang.com` 쿠키 직접 추출
- `call_supplier_api(path, method, body)`: 추출한 쿠키로 서플라이어 허브 API 직접 호출 (브라우저 불필요)
- `_do_resolve_category()`: QVT 브라우저 매크로 → API 직접 호출로 교체
  - `/qvt/kan-categories/search?keyword={id}&searchType=kanCategoryIds` → `categoryFullPath` 파싱
- `probe_sr_category_apis()`: `/sr/` 경로 카테고리 검색 API 탐색 함수 (진행 중)
- 싱글톤 브라우저(`_hub_pw`, `_hub_ctx`, `_hub_page`) 및 로그인 대기 로직은 등록(`_register`)용으로 유지

**app.py**
- 불필요한 엔드포인트 제거: `/api/supplier-status`, `/api/connect-supplier`, `/api/debug/probe-category` (구버전), `/api/resolve-category`
- `/api/debug/probe-category` 재추가: `/sr/` 경로 프로빙용 (임시, 완료 후 제거 예정)
- 헤더 "연결" 버튼 관련 코드 제거

**templates/index.html**
- 서플라이어 허브 연결 버튼 제거
- 카테고리 결과: KAN 경로 + 라디오 버튼 후보 선택 UI 구현 (candidates 데이터 채워지면 바로 동작)
- `#f-category-id` hidden input 추가

**requirements.txt**
- `browser-cookie3` 추가

**삭제된 파일**
- `Coupang_Category_20260311_1413/` (견적서 엑셀 16개) — 데이터 주기적 변경으로 부적합
- `modules/category_map.py` — 엑셀 기반 카테고리 맵 (위 이유로 삭제)

**start.command**
- `kill -9` → `kill -15` (정상 종료) + `sleep 3`

### 진행 중
- 등록용 세부 categoryPath 동적 조회 API 탐색 중
  - KAN 710 → `출산/유아동>...>유아목욕스펀지 (77058)` (Excel에서 확인)
  - 개별 상품 등록 URL: `https://supplier.coupang.com/sr/registration/step/startPage`
  - `/sr/` 경로 프로빙 예정

---

## 2026-04-04 - v1.9 카테고리 자동 선택

### 변경

**modules/category_map.py** (신규)
- 쿠팡 카테고리 엑셀 16개 파싱 → `{카테고리ID: [단계1, 단계2, ...]}` 맵 생성
- `data/category_map.json`에 캐시 저장 (최초 1회만 빌드, 이후 JSON 로드)
- 총 16,390개 카테고리 포함 (기프트카드.xlsx 제외)
- `get_category_path(id)` 함수: ID → 경로 배열 반환

**modules/supplier_hub.py**
- 카테고리 선택 로직 전면 교체
  - 기존: "칸 카테고리 아이디" 탭 + 검색창 방식 (미동작)
  - 변경: `category_map.py`에서 경로 조회 → 계층 패널 단계별 클릭
- 못 찾은 단계는 로그에 `⚠️ 카테고리 단계 못 찾음:` 출력 → 수동 선택 안내

**Coupang_Category_20260311_1413/** (복사)
- 쿠팡 공식 카테고리 엑셀 파일 16개를 프로젝트 루트에 추가

---

## 2026-04-04 - v1.8 병렬 처리 + 봇 탐지 우회 + SKU 가격 폴백

### 변경 (복사본에서 merge)

**modules/scraper.py**
- SKU 가격이 전부 0원일 때 DOM(`[class*="item-price-stock"]`)에서 직접 긁어오는 폴백 로직 추가
- `price_min`을 SKU 옵션 중 최솟값으로 자동 설정
- 이미지 다운로드 병렬화: `ThreadPoolExecutor(max_workers=10)` → 속도 대폭 향상
- `main_urls` 중복 선언 제거

**app.py**
- 번역 병렬화: 상품명 + 재질 + SKU 옵션 전체를 `ThreadPoolExecutor`로 동시 번역 → 속도 향상

**modules/supplier_hub.py**
- 봇 탐지 우회 스크립트 추가 (`add_init_script` + `set_extra_http_headers`)
  - `navigator.webdriver` 숨김, `chrome.runtime` 주입, 언어 헤더 설정
- `context.pages[0]` 재사용 방식으로 변경 (1688 scraper와 동일)
- `--disable-blink-features=AutomationControlled`, `--no-sandbox` args 추가

**templates/index.html**
- `input[type="checkbox"], input[type="radio"]` CSS 추가 → SKU 체크박스가 width:100% 되던 버그 수정

---

## 2026-04-04 - v1.7 SKU 체크박스 UI 완성

### 변경

**modules/scraper.py**
- `R` 초기화에 `sku_debug: []` 추가 — 방법1(runParams) 성공 시 `R.sku_debug.push()` 오류로 SKU debug 정보가 try/catch에 조용히 삼켜지던 버그 수정
- result dict에서 `"skus"` 키 중복 선언 제거 (Python은 마지막 값만 사용하므로 기능은 동일했으나 혼란 제거)

**templates/index.html**
- SKU 체크박스 렌더링을 `label.innerHTML +=` 패턴 → 순수 DOM 조작(`createElement`)으로 교체
  - 기존 방식: `appendChild(cb)` 후 `innerHTML +=` → 기존 DOM 노드 파괴·재생성되는 불안정 패턴
  - 개선: `createElement`로 각 자식 요소 직접 구성 → 이벤트 리스너가 원본 노드에 안정적으로 바인딩
- 체크 해제 시 border 색상을 `#ddd` → `#e0e0e0`으로 초기 스타일과 통일

### SKU 체크박스 UI 동작 요약
1. 크롤링 완료 후 옵션 목록이 체크박스로 표시 (옵션명 + 가격 ¥)
2. 체크 시 → label border 빨간색, f-color 필드에 선택된 이름 쉼표 구분
3. 다중 선택 시 → 선택된 옵션 중 최고가 기준으로 가격 자동 재계산

---

## 2026-04-03 - v1.6 상세 이미지 크롤링 + SKU 가격 구조 개선

### 변경

**modules/scraper.py**
- 상세 이미지 크롤링 방식 확정: Shadow DOM (`[class*="html-description"]` → `shadowRoot` → `img`) 접근
  - 1688 상세 설명은 `v-detail-2` 컴포넌트의 Shadow DOM 안에 위치
  - Shadow DOM 초기화를 위해 페이지 끝까지 스크롤 후 추출
- 크롤러 로그인 방식: `browser_profile/` 폴더에 세션 저장, 최초 1회 로그인 후 유지
- 불필요한 초기 스크롤(500px 왕복) 제거
- SKU 데이터 구조 변경: 옵션명만 → `{name, price}` 객체 배열
  - `window.runParams.data.skuModel.skuPriceList`에서 옵션명 + 가격 동시 추출

**app.py**
- 상세 이미지 다운로드 최대 20장, 최소 파일크기 30KB (아이콘 제외)

**templates/index.html**
- 상세 페이지 이미지 미리보기 섹션 추가 (대표 이미지 아래)

### 진행 중
- SKU 체크박스 선택 UI + 옵션별 가격 반영 (작업 중)

---

## 2026-04-01 - v1.0 전체 재작성

### 변경 내용
- 모든 파일(app.py, modules/*.py, templates/index.html) 처음부터 새로 작성
- 기존 v0.1 코드 전면 교체

### 주요 변경사항
**app.py**
- 코드 구조 정리, 불필요한 코드 제거
- `model_name` 필드를 `product_name`으로 자동 사용

**modules/scraper.py**
- `asyncio.run()` 기반 단순화
- 로그인 감지 루프 개선 (최대 3분 대기)
- 상세 이미지 selector 추가 (`[class*="descContent"] img`)

**modules/supplier_hub.py**
- 1688과 동일하게 영구 프로필(`browser_profile_coupang/`) 사용 → 로그인 유지
- 로그인 감지 루프 개선
- 각 단계별 헬퍼 함수(`_fill`, `_radio`, `_upload`, `_next`) 정리

**modules/label_generator.py**
- 캔버스 크기 960×600으로 조정
- 폰트 인덱스 처리 개선

**modules/translator.py / price_calculator.py**
- 로직 동일, 코드 정리

**templates/index.html**
- UI 전면 개편 (border-left 스타일 카드 제목, 가격 bar 레이아웃)
- 이미지 선택 toggle 개선 (.on 클래스)
- 로직 함수 정리

### 알려진 제한사항 (미변경)
- 서플라이어 허브 CSS selector는 실제 사이트에서 테스트 후 수정 필요
- 카테고리 자동 선택은 수동 확인 필요
- 1688 anti-bot으로 인해 headless 모드 불가

---

## 2026-04-01 - v1.4 가격 계산 용어 및 공식 수정

### 변경
- `modules/price_calculator.py` 가격 계산 로직 수정
  - 기존 "공급가"(위안×300)는 실제로 "원가"였음 → 용어 수정
  - 원가 = 위안가 × 300
  - 공급가 = ceil((원가 + 3000) / 100) × 100 (공급마진 최소 3,000원)
  - 판매가 = ceil(공급가 / 0.6 / 100) × 100 (쿠팡마진 40%)
  - 예: ¥8 → 원가 2,400 → 공급가 5,400 → 판매가 9,000
- `templates/index.html` 가격 bar에 "원가" 항목 추가, "마진" → "쿠팡마진"으로 변경
- `app.py` cost_price 결과에 포함

---

## 2026-04-01 - v1.3 SKU 옵션(색상) 추출 구현

### 변경
- `modules/scraper.py` 인라인 스크립트에서 `skuModel.skuProps` JSON 파싱으로 색상 옵션 추출
  - `window.runParams` 미사용 확인 → 인라인 script 태그에서 직접 파싱
- `app.py` SKU 옵션 번역 후 결과에 포함
- `templates/index.html` 색상 필드 아래 클릭 가능한 옵션 태그 표시

---

## 2026-04-01 - v1.2 카테고리 ID 방식으로 변경

### 변경
- `templates/index.html` 카테고리 필드: 검색어 → 카테고리 ID 입력으로 변경
- `modules/supplier_hub.py` 카테고리 선택: "칸 카테고리 아이디" 탭으로 ID 검색 후 자동 선택

---

## 2026-04-01 - v1.1 상품명 추출 수정

### 문제
- Chrome 자동번역 + 잘못된 h1 선택으로 엉뚱한 상품명 추출

### 수정
- `modules/scraper.py` 상품명 추출 우선순위 변경
  1. `<script type="application/ld+json">` (번역 영향 없는 원문)
  2. `document.title` ("상품명 - 판매자 - 1688.com" 형식 파싱) ← 현재 작동 방식
  3. `window.runParams`
  4. DOM h1 (추천/사이드바 영역 제외)
- Google Translate 요청 차단 (`page.route`)
- 탭 2개 열리던 문제 수정 (`context.pages[0]` 재사용)
- 이미지 다운로드 URL 처리 개선

---

## 2026-03-31 - v0.1 초기 구축

### 완료된 작업
- 전체 프로젝트 구조 설계
- modules/scraper.py, translator.py, price_calculator.py, label_generator.py, supplier_hub.py
- app.py Flask 서버
- templates/index.html 웹 UI
- start.command Mac 실행 파일
