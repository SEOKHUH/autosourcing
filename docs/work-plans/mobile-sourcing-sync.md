# 모바일 → 데스크탑 소싱 후보 동기화 (구글 시트 경유)

> 작성일: 2026-05-28  
> 상태: 워크플랜 작성 — 사용자 승인 대기

## 배경

출퇴근 등 모바일 사용 시점에 발견한 쿠팡 상품을 위시리스트로 모아두고, 집에서 데스크탑 익스텐션에서 일괄 처리하고 싶다는 요구. 모바일 크롬은 익스텐션 미지원 + 사용자가 iOS Safari 비공개 탭으로 소싱하기 때문에, 모바일과 데스크탑을 잇는 가벼운 동기화 채널 필요.

## 채택안: C — 구글 시트 + Apps Script + iOS 단축어

선택 이유:
- 백엔드/계정 인프라 추가 불필요 (구글 무료 한도 내)
- iOS 단축어 지원이 강력함 (1탭 캡처 가능)
- 시트가 동시에 위시리스트 백업/이력 역할

다른 안 (D 노션, F Cloudflare Workers 등)은 [이전 논의 참조].

---

## 사용자 흐름

### 모바일 (출퇴근 중)
1. Safari 비공개 탭에서 쿠팡 상품 발견
2. 하단 **공유 버튼** → 단축어 목록의 **"쿠팡 소싱 추가"** 탭
3. 단축어가 백그라운드로 Apps Script 호출 → 시트에 row 추가 → 성공 알림 표시
4. 다음 상품도 같은 방식으로 반복

### 데스크탑 (집)
1. 익스텐션 UI 열기
2. 헤더의 **📲 가져오기** 버튼 클릭 → 시트의 미처리 URL을 가져와 소싱 후보 큐에 추가 → 시트에 done 마킹
3. 이후 기존 흐름 그대로 — 후보 카드에서 1688 URL 연결 → 크롤링 시작

---

## 구성 요소

### 1. 구글 시트 + Apps Script (백엔드)

**시트 구조** (단일 시트, 컬럼 4개):

| timestamp | url | title | status |
|---|---|---|---|
| 2026-05-28T08:12:00Z | https://www.coupang.com/vp/products/... | 마이크로 USB 케이블 1m | pending |
| ... | ... | ... | done |

**Apps Script Web App — 엔드포인트 3개:**

| 메서드 | path | 입력 | 출력 |
|---|---|---|---|
| POST | `?action=add` | `{ url, title }` | `{ ok: true }` |
| GET  | `?action=pending` | — | `[{ rowId, url, title, timestamp }, ...]` |
| POST | `?action=done` | `{ rowIds: [..] }` | `{ ok: true, count }` |

**보안 모델**: 배포 시 `Anyone, even anonymous`로 공개하되, webhook URL 자체가 비밀번호 역할. URL 노출되지 않으면 본인만 접근 가능. (필요 시 후속 단계에서 `Authorization: Bearer <token>` 헤더 검증 추가 가능)

**구현 산출물**:
- `docs/work-plans/google-apps-script/Code.gs` — Apps Script 전체 코드 (사용자가 복붙)
- 배포 단계별 가이드 (스크린샷 형식 텍스트 가이드)

### 2. iOS 단축어 (모바일)

**이름**: "쿠팡 소싱 추가"

**구성 액션**:
1. **공유 시트 입력 받기** — URL 타입만 허용
2. **사전 작업** — URL을 `m.coupang.com` → `www.coupang.com`으로 정규화 (정규식)
3. **URL의 콘텐츠 가져오기 (옵션)** — 페이지 `<title>` 추출 (실패해도 무관)
4. **URL 사전 만들기** — `{ url: ..., title: ... }`
5. **사전을 JSON으로 변환**
6. **URL의 콘텐츠 가져오기 (POST)** — Apps Script `?action=add` 엔드포인트로 POST
7. **알림 보내기** — "위시리스트에 추가됨: [title]" 또는 실패 시 "추가 실패"

**구현 산출물**:
- 단축어 셋업 단계별 가이드 (각 액션 스크린샷 설명)
- 단축어 다운로드 링크는 제공 불가 (사용자가 본인 webhook URL 직접 입력해야 하므로) — 텍스트 가이드로 수동 생성

### 3. 익스텐션 (데스크탑)

#### 3-1. 설정 UI (신규)
- 위치: 좌측 사이드바 하단 또는 헤더에 ⚙ 버튼 → 모달
- 입력 필드:
  - `webhookUrl` — Apps Script Web App URL
  - `enabled` — 활성/비활성 토글
- `chrome.storage.local`에 저장 (`mobileSyncSettings`)

#### 3-2. 동기화 로직 (신규 모듈: `mobile-sync.js`)
- `syncFromSheet()` 함수
  1. 설정에서 webhookUrl 읽기 (없으면 즉시 return)
  2. `fetch(webhookUrl + '?action=pending')` 호출
  3. 응답 배열 순회 — 각 항목을 후보로 등록:
     - 기존 `state.sourcingCandidates`에 같은 URL 있으면 스킵 (중복 방지)
     - 없으면 `{ id, url, productName: title || url, status: 'pending', source: 'mobile' }` 형태로 추가
     - 서비스 워커의 기존 `ADD_SOURCING_CANDIDATE` 메시지 재사용
  4. 모두 처리되면 `rowIds`를 모아 `POST ?action=done` 호출
  5. 결과 로그를 글로벌 로그 바에 표시 (`📲 모바일 후보 3개 가져옴`)

#### 3-3. 트리거
- **수동만**: 헤더 "📲 가져오기" 버튼 클릭 시 `syncFromSheet()` 호출 (자동 동기화 제거)

#### 3-4. 쿠팡 URL 정규화 유틸
- 정규식: `m.coupang.com` → `www.coupang.com`
- 단축 URL (`link.coupang.com`)은 1차 범위 외 (단축어 측에서 거부하거나 그대로 저장)

#### 3-5. 후보 데이터 추출 (`sourcing-candidate-ux.md` A항목으로 완료)
- `chrome.windows.create({ state: 'minimized' })` 로 쿠팡 페이지를 현재 탭바에 보이지 않게 열기
- `executeScript(world: MAIN)` → dataLayer(상품명·가격) + og:image(썸네일) + review/batch(카테고리ID) + review 페이지네이션(월판매량)
- 여러 URL은 `Promise.allSettled`로 병렬 처리

---

## 파일 변경 요약

| 파일 | 변경 |
|------|------|
| `docs/work-plans/google-apps-script/Code.gs` | 신규 — Apps Script 코드 |
| `docs/work-plans/mobile-sourcing-sync.md` | 본 워크플랜 |
| `extension/ui/modules/mobile-sync.js` | 신규 — 동기화 모듈 |
| `extension/ui/modules/candidates.js` | 카드 레이아웃 개선 (배지 제거, 가격·월판매량 단일 행) |
| `extension/ui/index.html` | 설정 모달 + 헤더 버튼 추가 |
| `extension/ui/index.css` | 설정 모달 + 카드 스타일 |
| `extension/ui/index.js` | 수동 트리거 버튼만 유지 (자동 호출 제거) |
| `extension/manifest.json` | Apps Script 도메인(`script.google.com`, `script.googleusercontent.com`) `host_permissions`에 추가 |
| `docs/MODULES.md` | `mobile-sync.js` 등록 |
| `docs/SESSION.md` / `docs/CHANGELOG.md` | 작업 로그 갱신 |

---

## 작업 순서

1. **Apps Script 코드 작성** (`Code.gs`) — 사용자가 복붙해서 배포
2. **사용자 배포 작업**:
   - 빈 구글 시트 생성 → 메뉴 → 확장 → Apps Script → `Code.gs` 붙여넣기
   - 배포 → Web App → "Anyone" 액세스 → URL 복사
3. **iOS 단축어 가이드 작성** — 사용자가 webhook URL 넣고 직접 셋업
4. **익스텐션 구현**:
   - `mobile-sync.js` 모듈
   - 설정 모달 UI
   - 헤더 버튼 + 자동 트리거
   - manifest host_permissions 추가
5. **모바일 → 시트 → 데스크탑 1-cycle 통합 테스트**
6. 문서 업데이트 (MODULES, SESSION, CHANGELOG)

---

## 검증 방법

1. **백엔드 단독 테스트**:
   - Apps Script 배포 후 브라우저에서 `?action=pending` 호출 → 빈 배열 응답 확인
   - Postman/curl로 `?action=add` POST → 시트에 row 추가됨 확인
   - `?action=done` POST → status 컬럼이 done으로 바뀜 확인

2. **모바일 → 시트 단독 테스트**:
   - 단축어 실행 → Apps Script가 받았는지 시트에서 확인
   - 단축어가 알림 정상 표시하는지 확인

3. **시트 → 익스텐션 단독 테스트**:
   - 시트에 수동으로 pending row 1개 입력
   - 익스텐션 UI 열기 → 자동 동기화 실행 → 소싱 후보 큐에 카드 표시 확인
   - 시트에서 해당 row status가 done으로 갱신됐는지 확인

4. **전체 흐름 테스트**:
   - 모바일 Safari 비공개 탭 → 쿠팡 상품 → 공유 → 단축어 → 알림 확인
   - 집 컴퓨터에서 익스텐션 열기 → 후보 자동 추가 확인 → 1688 연결 → 크롤링까지

5. **중복 방지 테스트**:
   - 같은 URL 두 번 추가 후 동기화 → 후보에는 1개만 추가되는지 확인

---

## 진행 상태

| 항목 | 상태 |
|------|------|
| 워크플랜 작성 | ✅ |
| Apps Script `Code.gs` | ✅ (`docs/work-plans/google-apps-script/Code.gs`) |
| Apps Script 배포 가이드 | ✅ (`docs/work-plans/google-apps-script/DEPLOY_GUIDE.md`) |
| iOS 단축어 셋업 가이드 | ✅ (`docs/work-plans/google-apps-script/SHORTCUT_GUIDE.md`) |
| `mobile-sync.js` 구현 | ✅ |
| 설정 모달 + 헤더 버튼 | ✅ |
| `manifest.json` host_permissions | ✅ |
| 통합 테스트 | ⏳ |
| 문서 갱신 (MODULES/SESSION/CHANGELOG) | ✅ |
