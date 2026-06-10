# 모듈 지도

`extension/ui/modules/` 아래 모든 모듈의 역할 요약.
각 모듈 상세 내용은 `docs/modules/` 참조.

---

## 인프라

| 파일 | 역할 | 상세 |
|------|------|------|
| `state.js` | 전역 상태 단일 객체 | [state.md](modules/state.md) |
| `utils.js` | 순수 유틸 + DOM 헬퍼 (`$`, `appendGlobalLog`, `showToast`, `getCoupangCookies` 등) | [utils.md](modules/utils.md) |
| `messages.js` | SW → UI 메시지 라우팅 (SCRAPE_DONE, CANDIDATE_ADDED, DRAFT_LOG 등) | [messages.md](modules/messages.md) |
| `idb.js` | IndexedDB 래퍼 (`IDB.get`, `IDB.put`, `IDB.toObjectUrl`, `IDB.clearItem`) | [idb.md](modules/idb.md) |
| `price_calculator.js` | 위안 → 원가·공급가·판매가 계산 | [price_calculator.md](modules/price_calculator.md) |
| `translator.js` | Google Translate 비공개 API 배치 번역 + 상품명 정제 | [translator.md](modules/translator.md) |
| `html_renderer.js` | HTML 템플릿 → html2canvas → dataURL 변환 (라벨·상세페이지) | [html_renderer.md](modules/html_renderer.md) |

---

## 소싱 후보

| 파일 | 역할 | 상세 |
|------|------|------|
| `candidates.js` | 좌측 패널 소싱 후보 카드 렌더링 + 크롤링 시작·직접입력·삭제 버튼 | [candidates.md](modules/candidates.md) |
| `mobile-sync.js` | 구글 시트 webhook → 쿠팡 URL 데이터 추출 → 후보 등록 + 소싱 원장 전송 | [mobile-sync.md](modules/mobile-sync.md) |
| `ledger.js` | 소싱 원장 행 데이터 빌드 (buildLedgerRows) — 색상 옵션별 행 생성 | [ledger.md](modules/ledger.md) |

- 후보 카드: 썸네일 / 상품명(클릭 → 쿠팡 이동) / 가격(볼드) / 월판매량(하늘색) / 버튼
- "크롤링 시작" 클릭 → `addToQueueFromCandidate()` 실행 (queue.js)
- "직접입력" 클릭 → 1688 URL 수동 입력 인풋 노출
- `mobile-sync.js`: `chrome.windows.create({ state: 'minimized' })` 로 쿠팡 페이지 열어 데이터 추출

---

## 대기열

| 파일 | 역할 | 상세 |
|------|------|------|
| `queue.js` | 좌측 대기열 추가·삭제·재시도·크롤 스로틀·chrome.storage 저장 | [queue.md](modules/queue.md) |
| `scrape.js` | 크롤링 완료 후 Gemini/Google Translate 번역·이미지 다운로드·워크스페이스 열기 | [scrape.md](modules/scrape.md) |

---

## 워크스페이스

| 파일 | 역할 | 상세 |
|------|------|------|
| `workspace.js` | 상세뷰 열기/닫기, 스텝 이동, 진행상황 저장·복원, 쿠팡 참고 카드 | [workspace.md](modules/workspace.md) |

---

## Step 1 — 정보 검수

| 파일 | 역할 | 상세 |
|------|------|------|
| `step1-form.js` | 상품명 정제, 가격 계산, 폼 채우기. 위안가(`f-yuan`) 직접 수정 시 원가·공급가·판매가 자동 재계산 (`initYuanInput`) | [step1.md](modules/step1.md) |
| `step1-category.js` | KAN 카테고리 조회 + ZIP/XLSX 파싱 → displayCategoryCode 추출 | [step1.md](modules/step1.md) |

---

## Step 2 — 이미지 크롭

| 파일 | 역할 | 상세 |
|------|------|------|
| `step2-options.js` | 옵션 카드 렌더링, 이미지↔옵션 매칭 팝업 | [step2.md](modules/step2.md) |
| `step2-imagegrid.js` | 메인 이미지 그리드 렌더링 + 배지 갱신 + hover 편집 버튼 | [step2.md](modules/step2.md) |
| `step2-cropper.js` | 상세 이미지 드래그 자유 크롭 UI | [step2.md](modules/step2.md) |
| `image-editor.js` | 통합 이미지 편집 모달 — 크롭(1:1 정사각형) + 텍스트 제거를 한 모달에서 순차 수행. `openImageEditorModal(dataUrl, callback, { enableCrop })` | — |
| `ocr-worker.js` | Tesseract.js 싱글톤 OCR 워커 (`getOcrWorker()`) — 첫 호출 시 lazy 초기화 | — |
| `inpaint.js` | 박스 영역 적응형 인페인팅 (`fillBox`, `fillBoxes`) — 단색/그라데이션 분기 | — |

---

## Step 3 — 결과 확인

| 파일 | 역할 | 상세 |
|------|------|------|
| `step3.js` | 라벨 이미지 + 상세페이지 이미지 생성 후 IDB 저장 | [step3.md](modules/step3.md) |

---

## Step 4 — 쿠팡 론칭

| 파일 | 역할 | 상세 |
|------|------|------|
| `step4.js` | 서플라이어 허브 Draft API 임시저장 (create → upload → update) + 소싱 원장 전송 | [step4.md](modules/step4.md) |

---

## 진입점

| 파일 | 역할 |
|------|------|
| `index.js` | 모듈 import + 콜백 주입 + DOMContentLoaded 이벤트 등록 |
| `index.html` | UI 레이아웃 (vendor 스크립트 전역 로드 + `index.js` type=module) |

---

## Content Scripts & 외부 연동

| 파일 | 역할 | 상세 |
|------|------|------|
| `content_scripts/coupang_search.js` | 쿠팡 상품 목록에 돋보기 버튼 오버레이 — 월판매량·카테고리 ID 조회 | [coupang_search.md](modules/coupang_search.md) |
| `docs/google-apps-script/Code.gs` | 구글 Apps Script 웹앱 — 소싱 후보 동기화 + 소싱 원장 기록 | [google_apps_script.md](modules/google_apps_script.md) |
