## 역할
Service Worker → UI 메시지 라우팅 — `chrome.runtime.onMessage` 리스너 등록 후 메시지 타입별 콜백 분기

---

## 수신 메시지 타입

| 메시지 타입 | 처리 모듈 | 설명 |
|-------------|-----------|------|
| `SCRAPE_DONE` | `scrape.js` | 크롤링 완료 → 번역·워크스페이스 열기 |
| `SCRAPE_ERROR` | `queue.js` | 크롤링 오류 → 대기열 카드 오류 상태 |
| `DOWNLOAD_DONE` | `scrape.js` | 이미지 다운로드 완료 → IDB 키 업데이트 |
| `CANDIDATE_ADDED` | `candidates.js` | 소싱 후보 추가 → 카드 렌더링 |
| `CANDIDATE_LINKED` | `candidates.js` | 후보↔대기열 연결 상태 업데이트 |
| `CANDIDATE_REMOVED` | `candidates.js` | 후보 카드 제거 |
| `DRAFT_LOG` | UI 로그 바 | Step 4 Draft API 진행 로그 표시 |
| `REGISTER_LOG` | UI 로그 바 | 서플라이어 허브 등록 로그 |

## 초기화

- `initMessages({ onScrapeDone, onScrapeError, onDownloadDone, onCandidateAdded, onCandidateLinked, onCandidateRemoved })` — index.js에서 호출, 콜백 주입

## 주의사항
- 모든 SW→UI 메시지는 이 모듈을 통해 일원화 (각 모듈이 직접 `chrome.runtime.onMessage` 등록하지 않음)
- `DRAFT_LOG` / `REGISTER_LOG`는 `appendGlobalLog` (utils.js)로 로그 바에 표시
- 순환 의존 방지: messages.js는 어떤 기능 모듈도 import하지 않음 (콜백만 보관)
