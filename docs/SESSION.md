# 현재 작업 상태 (세션 노트)

> 이 파일은 Claude가 세션 중 자동으로 업데이트합니다.
> 새 대화 시작 시 "SESSION.md 읽고 이어서 작업해줘" 라고 하면 맥락이 복원됩니다.

---

## 마지막 업데이트: 2026-06-10 (모듈 문서 전체 업데이트 + CLAUDE.md 정오)

## 다음 할 일 (최상단)

### [완료] 모듈 문서 전체 업데이트 (2026-06-09)
- **업데이트**: `queue.md` (throttle/enqueueRescrape/addToQueueFromCandidate), `scrape.md` (Gemini/폴백/가격 재시도), `workspace.md` (쿠팡 참고 카드/yuan 저장), `state.md` (sourcingCandidates/skuThumbKeys)
- **신규 생성**: `candidates.md`, `mobile-sync.md`, `ledger.md`, `messages.md`, `idb.md`, `coupang_search.md`, `translator.md`, `html_renderer.md`, `price_calculator.md`, `utils.md`, `google_apps_script.md`
- **MODULES.md 업데이트**: 신규 docs 링크 추가, Content Scripts & 외부 연동 섹션 추가

### [완료] coupang_search.js 카테고리 ID 403 수정 (2026-06-09)
- `coupang_search.js` `fetchCategoryId`: `referrer: /vp/products/{productId}` + `credentials: include` + `accept` 헤더 추가
- 원인: Akamai 봇 차단이 referrer 없는 요청에 403 반환. 상품 페이지 URL을 referrer로 지정하면 통과.
- 동작 확인: 카테고리 ID 정상 표시

### [완료] 쿠팡 원본 참고 카드 + 원장 시트 개선 (2026-06-07)
- **카드 UI 컴팩트화**: 썸네일·상품명·가격·월판매량·링크 한 줄 레이아웃
- **상품명 수정**: `coupangName` 별도 저장 → 크롤링 후 1688 상품명으로 덮이지 않음
- **가격·월판매량 표시**: 카드에 쿠팡 판매가 + 월 N개 판매 표시
- **queue.js**: `price`, `estimatedMonthlySales` 큐 항목에 저장 (`coupangPrice`, `estimatedMonthlySales`)
- **옵션 추출 제거**: DOM 셀렉터 불안정 → coupangOptions 관련 코드 전면 제거
- **원장 월판매량 열 추가**: 시트 I열에 `월판매량` 추가, END ROAS J열로 이동. 기존 시트 자동 마이그레이션(열 삽입) 포함
- **원장 수식 자동화**: 공급가(`=CEILING(F*400+3000,100)`), 판매가(`=CEILING(G/0.6,100)`), END ROAS(`=IFERROR((H/(G-F*400))*1.1,"-")`) Apps Script에서 자동 기입
- **수동 작업 필요**: Apps Script 편집기에서 Code.gs 재배포

### [완료] 소싱 워크플로우 수정 5종 + 쿠팡 원본 참고 카드 (2026-06-07)
- ① `step1-form.js` `fillStep1` 첫 줄에 `$('f-qty').value = '1개'` → 소싱 갯수 누수 수정
- ② `scrape.js` `onScrapeDone`: 가격 0 감지 + 1회 자동 재크롤(`enqueueRescrape`) + 재시도 후에도 0이면 `priceMissing:true`
- ② `queue.js` `renderQueue`: `priceMissing` 카드에 "⚠ 가격 확인" 배지(주황), 재크롤 버튼 조건에도 포함
- ③ `queue.js` `crawlSettled`: `pumpCrawl()` → `setTimeout(pumpCrawl, 1800)` — 크롤 간 1.8초 텀
- ④ `step1-category.js` `fetchCategory`: fetch 최대 3회 재시도(1초·2초 텀)
- ⑤ `queue.js` `addToQueueFromCandidate`: `coupangUrl`, `coupangThumb`, `coupangName`, `coupangPrice`, `estimatedMonthlySales` 큐 항목에 복사
- ⑤ `index.html`: Step 1 상단에 `#coupang-ref-card` 한 줄 컴팩트 카드
- ⑤ `workspace.js` `openDetailView`: `item.coupangUrl` 있으면 카드 채움, 없으면 `hidden`
- ⑤ `index.css`: `.coupang-ref-*` 스타일 (하늘색 한 줄 카드)

### [완료] 소싱 원장 후속 수정 (2026-06-07)
- **f-yuan 미저장 버그**: `workspace.js` saveProgress에 `yuan` 필드 추가 + restoreProgress에 복원 추가 → 스텝 이동 시 위안가 유지, 원장 시트 가격 0 문제 해결
- **Step 4 느려짐**: `pushLedgerToSheet` 비동기(fire-and-forget) 처리 → UI 완료 메시지 즉시 표시
- **드롭다운 미상속**: `Code.gs` insertRowsAfter 후 data validation 재적용 → 새 행에도 드롭다운 정상 표시
- **현황 자동 입력**: 삽입 시 A열 값 `''` → `'제안중'` 자동 입력
- **scraper_1688.js 죽은 코드 되돌림**: 제가 추가했던 SKU 가격 폴백 블록 제거 (파일 자체가 스크래핑에 미사용)
- **CLAUDE.md 정정**: "순수 DOM 스크래핑" → "window.context JSON fetch+파싱" 방식으로 수정, service-worker.js/scraper_1688.js 역할 설명 정확히 반영

### [완료] 제안 완료 상품 → 구글 시트 소싱 원장 구현
- **시트 스키마(9열)**: 현황 / 1688링크 / 상품명 / 색상 / 수량 / 중국원가 / 공급가 / 판매가 / END ROAS
- **신규 파일**: `extension/ui/modules/ledger.js` — `buildLedgerRows(item)` (step4+queue 양쪽에서 사용, 순환 의존 방지)
- **변경 파일**: `Code.gs`, `mobile-sync.js`(pushLedgerToSheet), `step4.js`(done 시 자동 전송), `queue.js`(삭제 전 안전망)
- **안전망**: done 항목 삭제 시 미전송이면 재전송 → 실패 시 토스트 경고 + 항목 보존

### [완료 처리] 단일 상품 가격/옵션 스크래핑
- 코드 수정 완료, 검증용 상품 URL 소실로 실측 확인 불가 → 완료 처리
- 향후 가격이 안 들어오는 상품 발견 시 재확인

### [완료] 2026-06-01 작업
- **상세페이지 테이블 띄어쓰기**: html2canvas `letter-spacing: 0` 버그 → `word-spacing: 0.01px` + `foreignObjectRendering: true`로 해결
- **썸네일 크롭 미적용 버그**: `image-editor.js` `applyAndClose()` — crop 탭에서 바로 Apply 시 `cropBox`→`activeCrop` 변환 추가
- **재크롤링 버튼 UI**: 스카이블루 + `.q-card-meta` 컬럼(배지+버튼) 우측 배치, `review`/`error` 상태에서만 표시
- **가격 폴백 개선**: `scraper_1688.js` — ¥ 단독 span의 부모 textContent 파싱 추가 (split-span 구조 대응)
- **위안가 직접 수정**: `f-yuan` input으로 전환, 수정 시 원가·공급가·판매가 자동 재계산
- **유통기한**: `step4.js` `daysToExpiration` 365 → 0으로 변경

### [완료] 크롭 자동 스크롤 속도 조정
- `step2-cropper.js`: 드래그 크롭 시 화면 끝 자동 스크롤 속도 계수 `* 12` → `* 6` (절반)

### [완료] UI 버그 수정 및 폴리싱 (2026-05-29)
- 워크스페이스 트랜지션 전면 개선 (URL 섹션 collapse, position absolute 고정, margin-left 트랜지션, 닫기 순서 정리)
- 대기열/소싱 후보 버튼 중앙 정렬 통일
- 쿠팡 배너 카드 클릭 → `NAVIGATE_TAB` 메시지로 같은 탭 이동 (RET9999 해결, `service-worker.js`에 핸들러 추가)
- 큐 카드 `overflow: hidden` 제거 → 재크롤링 버튼/진행 표시 잘림 해결
- **코드리뷰 항목 1~8 해결 확인** (`docs/code-review-2026-05-29.md`에 완료 표시): IDB 누수/adCert/API키/옵저버 디바운스/모바일동기화 재시도/가격정책 모두 기존 구현으로 해결됨 확인. 미처리: #6 에러처리 침묵(보류), #9 테스트(보류), #10~13 운영(보류)

### [완료] 워크스페이스 열기/닫기 트랜지션 폴리싱
- **워크플랜**: `docs/work-plans/workspace-transition-polish.md`
- **변경 파일**: `extension/ui/index.css`, `extension/ui/modules/workspace.js`
- URL 섹션 max-height+opacity collapse 트랜지션, transition:all → 명시적 속성, position:relative 제거(absolute 고정)
- 닫기: 워크스페이스 슬라이드 아웃 + 사이드바 동시 복원, margin-left 트랜지션으로 중앙 이동 부드럽게

### [완료] Gemini 기반 번역·정제 + SEO 전환
- **워크플랜**: `docs/work-plans/gemini-translation-seo.md`
- **동작 확인**: 상품명·재질·사양·무게·검색태그·옵션명 모두 한국어 정상 출력
- **추가 수정**: `responseSchema` 제거(배열/중첩 객체 반환 버그), 크롤링 완료 시 워크스페이스 자동 열림 제거, `pieceWeightScaleInfo`에서 사양(치수) 자동 추출

---


## 현재 상태
**전체 기능 동작 확인 ✅ / 쿠팡 상세 페이지 소싱 추가 + 모바일 동기화 완료**

- 통합 이미지 편집 모달 (`image-editor.js`) — 크롭 + 텍스트 제거 순차 작업, 동작 확인
- Step 2 크롭 영역 색상 → 파란색(`#0ea5e9`) 통일
- 크롭 박스 이동 (기존 영역 안쪽 클릭+드래그) 동작 확인
- 전체 소싱 플로우 (크롤링 → Step 1~4) 정상 동작

---

## 다음 할 일

### [구현 대기] 모바일 → 데스크탑 소싱 후보 동기화 (C안: 구글 시트)
- **워크플랜 완성**: `docs/work-plans/mobile-sourcing-sync.md` (상세 설계 + 작업 순서 + 검증 방법 모두 정리됨)
- **목표**: iOS Safari 비공개 탭에서 쿠팡 상품 공유 → 단축어 → 구글 시트 → 집 데스크탑 익스텐션 열면 소싱 후보 큐에 자동 추가
- **채택안 C 확정 이유**: 백엔드 불필요(구글 무료), iOS 단축어 1탭 캡처, 시트가 백업/이력 역할. (D 노션과 막판까지 고민했으나 사용자 iPhone + 단축어 1탭 매력으로 C 선택)
- **인증**: 1차에선 webhook URL 자체가 비밀번호 (토큰 검증은 후속 옵션)
- **다음 작업 순서** (워크플랜 기준):
  1. ✅ Apps Script `Code.gs` 배포 완료
  2. ✅ iOS 단축어 "소싱 추가" 셋업 완료 → 구글 시트 동기화 확인
  3. ✅ 익스텐션 구현 완료: `mobile-sync.js`, 설정 모달(⚙), 헤더 "📲 가져오기" 버튼, 자동 동기화, `manifest.json` host_permissions
  4. ⏳ 통합 테스트 + 소싱 후보 UX 보강 (다음 할 일 참조)

### [완료] 소싱 후보 UX 보강 + 모바일 동기화 데이터 추출 개선
- **워크플랜**: `docs/work-plans/sourcing-candidate-ux.md`
- **A. 모바일 동기화 재작성**: ✅ `mobile-sync.js` — fetch(403) 버리고 백그라운드 탭 방식으로 전환 완료. dataLayer(상품명·가격) + og:image(썸네일) + review/batch API(카테고리ID) + 리뷰 API(월판매량)
- **B. 후보 큐 → 쿠팡 이동**: ✅ 썸네일·상품명 클릭 → `window.open(coupangUrl)`
- **C. 월판매량 표시**: ✅ 후보 큐 카드 `cand-sales` + 배너 카드 하단
- **D. 쿠팡 배너 가격 표시**: ✅ 배너 카드에 판매가 추가
- **재개 방법**: 새 대화에서 "sourcing-candidate-ux.md 읽고 A부터 구현해줘"
- **재개 방법**: 새 대화에서 "mobile-sourcing-sync.md 읽고 1단계 Apps Script부터 진행해줘"



---

## 2026-05-15 완료된 수정 이력

### 쿠팡 소싱 배너 + 1688 배너 디자인 통일
| 항목 | 내용 |
|------|------|
| 쿠팡 배너 | "+ 소싱 추가" 클릭 시 상단 배너에 카드 누적 표시 (`coupang_search.js`) |
| 1688 배너 배경 | `#1a1a2e` → `#fff` + 흰색 border-bottom |
| 1688 배너 버튼 | `#e94560` → `#0ea5e9` (UI 규칙: 빨강은 삭제 전용) |
| 1688 카드 선택색 | 빨강 → 스카이블루 (`#0ea5e9`) |



### 소싱 후보 UX 개선
| 항목 | 내용 |
|------|------|
| URL 연결/크롤링 분리 | `onCandidateLinked`에서 자동 크롤링 제거 → 후보 카드에 "크롤링 시작" 버튼 수동 트리거 |
| 배너 텍스트 변경 | "소싱 시작 →" → "URL 연결 →" (`scraper_1688.js`) |
| 버튼 우측 정렬 | 크롤링 시작 / 직접입력 버튼을 `.cand-actions` div로 분리 → 우측 정렬 |
| opacity 제거 | `.cand-card.cand-linked { opacity: 0.65 }` 제거 — 연결된 카드가 희미하게 보이던 문제 |

### categoryId 자동 입력 + 카테고리 복원
| 항목 | 내용 |
|------|------|
| categoryId 자동 입력 | 워크스페이스 열릴 때 `item.categoryId` → `f-category-id` 자동 세팅 |
| categoryPath 자동 표시 | `item.categoryPath` 있으면 `f-category` 경로 텍스트 자동 표시 |
| 드롭다운 복원 | `item.categoryCodeCandidates` 있으면 재조회 없이 드롭다운 복원 |
| 선택값 복원 | `item.displayCategoryCode`를 `savedCode`로 드롭다운에서 선택 복원 |
| fetchCategory 수정 | `credentials: 'include'` 폐기 → Cookie header 수동 주입 방식 복원 + `Accept: application/json` 추가 |
| CSP 추가 | `manifest.json` connect-src에 `https://xauth.coupang.com` 추가 |

### UI 개선 논의 + 목업
- 방향 결정: 모노톤 베이스 + 스카이블루 액션컬러 (`#0ea5e9`) + 빨강은 에러 전용
- 탭 구조 (소싱 후보 / 대기열) B안으로 결정
- `docs/ui-mockup.html` 생성 (현재 / A안 / B안 나란히 비교)

---

## Step 4 완료된 수정 이력

### 2026-05-04 (1차 — 구조 버그 5개 수정)
| # | 항목 | 변경 전 | 변경 후 |
|---|------|---------|---------|
| 1 | version | `160` | `164` |
| 2 | productPage 구조 | 가격/속성 직접 | `commonAttributes` 안에 중첩 |
| 3 | brand | `'헤오르'` | `'브랜드 없음'` |
| 4 | manufacturer | `'헤오르'` | `'헤오르 협력사'` |
| 5 | 이미지 파일명 | `j[0]`(객체) | `j[0]?.imageName` |
| 6 | 다중 SKU | 단일 항목만 | 옵션별 jsonDocument 행 개별 생성 |

### 2026-05-06 (2차 — 필드 누락 수정)
- 모델명: `productPage.modelNumber = productName` 추가
- SKU 행: 색상 옵션만 행 생성, 사양(spec)은 행 생성 안 함
- exposedAttributes: 색상 + 수량(`f-qty`) + 사이즈(`one size` 고정) 포함

### 2026-05-06 (3차 — 이미지 업로드 500 수정)
- **Pre-update 추가**: create 직후 업로드 전에 빈 imagePage 포함한 전체 구조 먼저 저장 → Jackson NPE 해소
- **WebP 방지**: `service-worker.js` 이미지 다운로드 시 `Accept: image/jpeg,image/png,image/*;q=0.8` 헤더 추가
- **colorOptions 폴백**: `sku_groups_translated` 없거나 단일 차원일 때 선택된 전체 옵션 색상으로 처리

### 2026-05-06 (4차 — legalPage 수정 + notices 동적화)
- **adCert 제거**: `adCert: ''`(있음으로 표시됨) → 필드 자체 전송하지 않음(없음)
- **notices 동적화**: `fetchNoticeNumber` → `fetchNoticeSchema`로 확장
  - 스키마 API 응답에서 notice 항목 이름 목록 추출
  - 카테고리 선택 시 `queueData[id].productNoticeItems` 배열 저장
  - Step 4에서 해당 배열로 notices 구성 (없으면 5개 공통 항목 폴백)

---

## 현재 동작 상태

| 기능 | 상태 |
|------|------|
| URL 추가 + 크롤링 시작 | ✅ 동작 |
| 1688 window.context 스크래핑 (BackgroundFetch) | ✅ 동작 |
| SKU 옵션 추출 (이름+가격+썸네일) | ✅ 동작 |
| SKU 썸네일 IDB 저장 및 표시 | ✅ 동작 |
| 이미지 그리드 중복 제거 | ✅ 동작 |
| 옵션 카드 4열 그리드 UI | ✅ 동작 |
| 이미지 클릭 → 옵션 팝업 매칭 | ✅ 동작 |
| 4단계 스텝 UI | ✅ 동작 |
| 진행상황 저장/복원 | ✅ 동작 |
| 상품명 퍼시스턴스 (리로드 후 유지) | ✅ 동작 |
| 크롭 이미지 퍼시스턴스 (IDB 저장/복원) | ✅ 동작 |
| 옵션 카드 클릭 → 이름 입력 팝업 | ✅ 동작 |
| 이미지 매칭 Step 3 이동 | ✅ 동작 |
| 이미지 매칭 저장/복원 | ✅ 동작 |
| 가격 인라인 수정 (수량 반영) | ✅ 동작 |
| 다차원 SKU (색상 × 사양) | ✅ 동작 |
| 상품명 자동 정제 (룰 기반 + Gemini) | ✅ 동작 |
| Step 2 — 상세이미지 자유 크롭 | ✅ 동작 |
| Step 3 — 라벨 이미지 생성 | ✅ 동작 |
| Step 3 — 상세페이지 이미지 생성 | ✅ 동작 |
| Step 4 — LABEL/DETAIL 이미지 업로드 | ✅ 동작 |
| Step 4 — MAIN 이미지 업로드 (WebP → JPEG 변환) | ✅ 동작 |
| Step 4 — 서플라이어 허브 임시저장 | ✅ 동작 |
| Step 4 — notices 동적화 | ✅ 동작 |
| Step 4 — 색상 속성명 동적화 (카테고리별 색상/색상/항 자동 감지) | ✅ 동작 |
| Step 2 — 상세이미지 크롭 후 Step 3 그리드에 contain으로 표시 | ✅ 동작 |
| index.js 모듈화 (17개 ES 모듈) | ✅ 완료 |
| 쿠팡 검색 카드 오버레이 (월 판매량 + 소싱 버튼) | ✅ 구현 |
| 소싱 후보 큐 (좌측 패널 + storage 영속) | ✅ 구현 |
| 1688 페이지 배너 (후보 연결 UI) | ✅ 구현 |
| 후보 → 큐 자동 진입 + 크롤링 시작 | ✅ 구현 |

---

## 아키텍처 현황

### 파일 구조
- `extension/ui/index.js` — 진입점 (~55줄), 모듈 import + 이벤트 리스너만
- `extension/ui/modules/` — 17개 ES 모듈 (전체 목록: `docs/MODULES.md`)
- `extension/vendor/` — html2canvas.min.js, jszip.min.js (전역 script 태그로 로드)

### Step 4 — 서플라이어 허브 임시저장
- `extension/ui/modules/step4.js`
- CORS 우회: `executeScript world: 'MAIN'` on supplier.coupang.com 탭
- Draft API 4단계: `POST /sr/draft/api/create` → **pre-update** → `upload-images` → `update`
- 이미지: IDB ArrayBuffer → base64 → executeScript args로 전달
- colorOptions: `isColorDim` / `imageUrl` / 색상 키워드로 색상 차원 판별, 폴백 포함

### Step 1 카테고리 — displayCategoryCode 추출
- KAN ID로 `/qvt/v3/kan-categories/download-quotation` ZIP 다운로드
- JSZip 두 번 파싱: 외부 ZIP → XLSX 내부 ZIP → `xl/sharedStrings.xml`
- 정규식으로 `(숫자코드)` 추출 → `displayCategoryCode` 저장
- `fetchNoticeSchema(displayCode, tabId)`: 스키마 API에서 noticeNumber + noticeItems 동시 추출
  - `queueData[id].productNoticeNumber`, `queueData[id].productNoticeItems` 저장

---

## 팁: 셀렉터 깨질 때
1688 크롤링 안 되면 해당 페이지 **HTML 저장(Ctrl+S) → 공유** → 추측 없이 바로 수정 가능
