## 역할
전역 상태 단일 객체 — 모든 모듈이 이 파일에서 `state`를 import해 읽고 씀

---

## 주요 속성

| 속성 | 타입 | 설명 |
|------|------|------|
| `currentItemId` | string | 현재 선택된 대기열 아이템 ID |
| `queueData` | `{ [id]: item }` | 전체 대기열 맵 (chrome.storage와 동기화) |
| `currentScrapeResult` | object | 현재 아이템의 번역된 크롤링 결과 원본 |
| `allImages` | string[] | 메인 갤러리 IDB 키 목록 (`main_{itemId}_NN`) |
| `detailImages` | string[] | 상세 이미지 IDB 키 목록 (`detail_{itemId}_NN`) |
| `skuThumbKeys` | string[] | SKU 썸네일 IDB 키 목록 (`skuthumb_{itemId}_NN`) |
| `croppedImages` | string[] | Step 2에서 크롭된 이미지 dataURL 배열 (최대 3개) |
| `currentStep` | number | 현재 스텝 번호 (1~4) |
| `isModalOpen` | boolean | 워크스페이스 열림 여부 |
| `currentModalItemId` | string | 현재 워크스페이스에 열린 아이템 ID |
| `activeOptionName` | string | 이미지 그리드에서 현재 활성 옵션 |
| `selectedOptions` | string[] | 사입 선택된 옵션 이름 배열 |
| `optionCustomNames` | object | `{ 옵션명: 사용자지정이름 }` |
| `optionImageMap` | object | `{ 옵션명: [imgKey, ...] }` 이미지 매칭 맵 |
| `sourcingCandidates` | object[] | 소싱 후보 카드 데이터 배열 (candidates.js 렌더링) |

## 주의사항
- setter 없음 — 각 모듈이 `state.xxx = ...` 직접 변경
- 페이지 리로드 시 초기화됨 (영속화는 `queue.js`의 `saveQueue` + chrome.storage 담당)
- `skuThumbKeys`: 크롤 완료 후 IDB에 저장된 SKU 썸네일 키 목록 → Step 2 이미지 그리드에서 메인 이미지와 함께 표시
- `sourcingCandidates`: 모바일 싱크 또는 쿠팡 검색 배너에서 추가된 후보 목록
