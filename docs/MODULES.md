# 모듈 지도

`extension/ui/modules/` 아래 모든 모듈의 역할 요약.
각 모듈 상세 내용은 `docs/modules/` 참조.

---

## 인프라

| 파일 | 역할 | 상세 |
|------|------|------|
| `state.js` | 전역 상태 단일 객체 | [state.md](modules/state.md) |
| `utils.js` | 순수 유틸 + DOM 헬퍼 (`$`, `appendGlobalLog`, `showToast` 등) | — |
| `messages.js` | SW → UI 메시지 라우팅 (SCRAPE_DONE, REGISTER_LOG 등) | — |
| `idb.js` | IndexedDB 래퍼 (`IDB.get`, `IDB.put`, `IDB.toObjectUrl`) | — |
| `price_calculator.js` | 위안 → 원가·공급가·판매가 계산 | — |
| `translator.js` | Google Translate 비공개 API 배치 번역 | — |
| `html_renderer.js` | HTML 템플릿 → html2canvas → dataURL 변환 (라벨·상세페이지) | — |

---

## 소싱 후보

| 파일 | 역할 | 상세 |
|------|------|------|
| `candidates.js` | 좌측 패널 소싱 후보 카드 렌더링 + 크롤링 시작·직접입력·삭제 버튼 | — |

- 후보 카드: 쿠팡 썸네일 / 상품명 / 가격 / 연결 상태 배지
- "크롤링 시작" 클릭 → `addToQueueFromCandidate()` 실행 (수동 트리거)
- "직접입력" 클릭 → 1688 URL 수동 입력 인풋 노출
- `onCandidateAdded`, `onCandidateLinked`, `onCandidateRemoved` — SW 메시지 수신 시 콜백

---

## 대기열

| 파일 | 역할 | 상세 |
|------|------|------|
| `queue.js` | 좌측 대기열 추가·삭제·재시도·chrome.storage 저장 | [queue.md](modules/queue.md) |
| `scrape.js` | 크롤링 완료 후 번역·이미지 다운로드·워크스페이스 열기 | [scrape.md](modules/scrape.md) |

---

## 워크스페이스

| 파일 | 역할 | 상세 |
|------|------|------|
| `workspace.js` | 상세뷰 열기/닫기, 스텝 이동, 진행상황 저장·복원 | [workspace.md](modules/workspace.md) |

---

## Step 1 — 정보 검수

| 파일 | 역할 | 상세 |
|------|------|------|
| `step1-form.js` | 상품명 정제, 가격 계산, 폼 채우기 | [step1.md](modules/step1.md) |
| `step1-category.js` | KAN 카테고리 조회 + ZIP/XLSX 파싱 → displayCategoryCode 추출 | [step1.md](modules/step1.md) |

---

## Step 2 — 이미지 크롭

| 파일 | 역할 | 상세 |
|------|------|------|
| `step2-options.js` | 옵션 카드 렌더링, 이미지↔옵션 매칭 팝업 | [step2.md](modules/step2.md) |
| `step2-imagegrid.js` | 메인 이미지 그리드 렌더링 + 배지 갱신 | [step2.md](modules/step2.md) |
| `step2-cropper.js` | 상세 이미지 드래그 자유 크롭 UI | [step2.md](modules/step2.md) |

---

## Step 3 — 결과 확인

| 파일 | 역할 | 상세 |
|------|------|------|
| `step3.js` | 라벨 이미지 + 상세페이지 이미지 생성 후 IDB 저장 | [step3.md](modules/step3.md) |

---

## Step 4 — 쿠팡 론칭

| 파일 | 역할 | 상세 |
|------|------|------|
| `step4.js` | 서플라이어 허브 Draft API 임시저장 (create → upload → update) | [step4.md](modules/step4.md) |

---

## 진입점

| 파일 | 역할 |
|------|------|
| `index.js` | 모듈 import + 콜백 주입 + DOMContentLoaded 이벤트 등록 |
| `index.html` | UI 레이아웃 (vendor 스크립트 전역 로드 + `index.js` type=module) |
