## 역할
순수 유틸 함수 + DOM 헬퍼 — 모든 모듈에서 공통으로 사용

---

## 주요 함수

| 함수 | 설명 |
|------|------|
| `$(id)` | `document.getElementById(id)` 단축 |
| `esc(str)` | HTML 특수문자 이스케이프 (`&`, `<`, `>`, `"`) |
| `statusLabel(s)` | 상태 코드 → 한국어 레이블 변환 |
| `statusIcon(s)` | 상태 코드 → 이모지 아이콘 변환 |
| `getCoupangCookies()` | `.coupang.com` 도메인 쿠키 전체 조회 (Promise) |
| `downloadDataUrl(dataUrl, filename)` | dataURL을 파일로 다운로드 |
| `dataUrlToArrayBuffer(dataUrl)` | dataURL → ArrayBuffer 변환 |
| `showToast(msg)` | 하단 중앙 토스트 메시지 표시 (2초 후 자동 제거) |
| `appendGlobalLog(text)` | 하단 로그 바에 텍스트 추가 + FAB 알림 점 표시 |

## 상태 코드 매핑

| 코드 | 레이블 | 아이콘 |
|------|--------|--------|
| `waiting` | 대기 | ⏳ |
| `scraping` | 크롤링 | 🔍 |
| `review` | 검토 | ✏️ |
| `registering` | 등록중 | ⬆️ |
| `done` | 완료 | ✅ |
| `error` | 오류 | ❌ |

## 주의사항
- `getCoupangCookies`는 step1-category.js에서 KAN API 쿠키 인증용으로 사용
- `appendGlobalLog`는 로그 바가 닫혀있으면 FAB(`log-fab-dot`) 알림 점을 함께 표시
- 이 파일은 state.js를 import하지 않음 (순수 유틸)
