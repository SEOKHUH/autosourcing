# 헤오르 자동 소싱 프로젝트

## 프로젝트 목적
1688에서 소싱한 상품을 쿠팡 서플라이어 허브에 자동으로 등록하는 시스템.
사용자가 1688 URL을 입력하면, 데이터 수집/번역/가격계산/라벨생성/자동등록까지 처리.

## 기술 스택
- **플랫폼**: Chrome Extension (Manifest V3)
- **크롤링**: `background/service-worker.js` — 백그라운드 fetch로 1688 페이지의 `window.context` JSON을 추출·파싱 (DOM 스크래핑 아님). `scraper_1688.js`는 1688 페이지의 "소싱 후보 배너" UI만 담당하며 스크래핑 로직은 현재 미사용(죽은 코드)
- **브라우저 자동화**: `step4.js`에서 `executeScript(world: MAIN)`으로 직접 처리. `supplier_hub.js`(content script)와 `service-worker.js`의 `DRAFT_SAVE`/`handleDraftSave` 경로는 과거 메시지 기반 저장 방식의 잔재로, 현재 송신자가 없어 **미사용(죽은 코드)**
- **번역**: service-worker.js의 Gemini API (`gemini-3.1-flash-lite`) 우선 → 실패 시 `ui/modules/translator.js` (Google Translate 비공개 API) 폴백. Gemini API 키는 설정 모달에서 입력 후 `chrome.storage.local`의 `mobileSyncSettings.geminiApiKey`에 저장
- **가격 계산**: `ui/modules/price_calculator.js`
- **라벨/상세페이지 생성**: `ui/modules/html_renderer.js` + html2canvas
- **이미지 저장**: IndexedDB (`ui/modules/idb.js`)
- **UI**: 새 탭으로 여는 HTML 페이지 (`ui/index.html/css/js`) — ES 모듈 방식

## 파일 구조
```
extension/
  manifest.json              # MV3 설정 (권한, CSP)
  background/
    service-worker.js        # 스크래핑 본체: window.context JSON fetch+파싱, Gemini 번역, 탭 관리, 이미지 다운로드, 메시지 라우팅
  content_scripts/
    scraper_1688.js          # 1688 페이지 "소싱 후보 배너" UI 담당 (DOM 스크래핑 로직은 죽은 코드)
    coupang_search.js        # 쿠팡 상품 목록 페이지에 돋보기 버튼 오버레이 (월판매량·카테고리 ID 조회)
    supplier_hub.js          # 서플라이어 허브 DRAFT_SAVE 핸들러 (미사용 죽은 코드 — 실제 저장은 step4.js executeScript)
  ui/
    index.html               # 메인 UI (새 탭으로 열림)
    index.css                # 스타일
    index.js                 # 진입점 — 모듈 import + 이벤트 리스너 등록 (~55줄)
    modules/                 # 기능별 ES 모듈 (전체 목록: docs/MODULES.md)
      state.js               # 전역 상태 객체
      utils.js               # 순수 유틸 + DOM 헬퍼
      messages.js            # SW → UI 메시지 라우팅
      queue.js               # 대기열 관리 (크롤 스로틀 1.8초, priceMissing 배지)
      scrape.js              # 크롤링 완료 처리 (Gemini/Google Translate 번역, 가격 0 재시도)
      workspace.js           # 상세뷰·스텝 이동·진행상황 저장·쿠팡 참고 카드
      candidates.js          # 소싱 후보 카드 렌더링 (pending/linked/queued 상태)
      mobile-sync.js         # 구글 시트 → 쿠팡 데이터 추출 → 후보 등록 + 소싱 원장 전송
      ledger.js              # 소싱 원장 행 데이터 빌드 (buildLedgerRows)
      step1-form.js          # 상품명 정제, 가격 계산
      step1-category.js      # 카테고리 조회 + ZIP/XLSX 파싱
      step2-options.js       # 옵션 카드, 이미지 매칭 팝업
      step2-imagegrid.js     # 이미지 그리드
      step2-cropper.js       # 드래그 크롭 UI
      image-editor.js        # 통합 이미지 편집 모달 (크롭 1:1 + 텍스트 제거 순차)
      ocr-worker.js          # Tesseract.js 싱글톤 OCR 워커
      inpaint.js             # 텍스트 제거 적응형 인페인팅
      step3.js               # 라벨·상세페이지 생성
      step4.js               # 서플라이어 허브 임시저장 + 소싱 원장 전송
      idb.js                 # IndexedDB 래퍼
      price_calculator.js    # 가격 계산
      translator.js          # 중국어 → 한국어 번역 (Google Translate 폴백용)
      html_renderer.js       # 라벨/상세페이지 HTML → 이미지 변환
  vendor/                    # 서드파티 라이브러리 (ES 모듈 아님 → 전역 script 태그로 로드)
    html2canvas.min.js       # 로컬 번들 (CDN 사용 불가)
    jszip.min.js             # ZIP/XLSX 파싱
  static/
    label/                   # 라벨 HTML 템플릿
    detail_page/             # 상세페이지 HTML 템플릿
    globals.css              # 공통 스타일
docs/
  SESSION.md                 # 현재 작업 상태 — 새 대화 시작 시 반드시 읽을 것
  CHANGELOG.md               # 버전별 변경 이력
  MODULES.md                 # 전체 모듈 지도 (어디에 뭐가 있는지 한눈에)
  modules/                   # 모듈별 상세 문서 (역할·함수·상태의존·주의사항)
  work-plans/                # 기능별 작업 계획서
  google-apps-script/        # 구글 Apps Script 웹앱 소스 (Code.gs)
  figma_template/            # Figma 원본 템플릿 (라벨/상세페이지)
```

## 주요 비즈니스 로직

### 가격 계산 (`ui/modules/price_calculator.js`)
- 원가     = 위안가 × 400
- 공급가   = ceil((원가 + 3000) / 100) × 100   → 공급마진 최소 3,000원, 100원 단위 올림
- 판매가   = ceil(공급가 / 0.6 / 100) × 100    → 쿠팡마진 40% 적용, 100원 단위 올림
- 예시: ¥5.5 → 원가 2,200원 → 공급가 5,200원 → 판매가 8,700원
- **가격은 SKU 옵션별로 다를 수 있음** → Step 1에서 사입 옵션 선택 후 해당 가격 기준 계산
- 공급가·판매가는 가격 표에서 직접 인라인 수정 가능

### SKU 옵션 구조 (`background/service-worker.js`)
- **방식**: service-worker.js가 1688 페이지를 fetch → `window.context` JSON 파싱 (DOM 스크래핑 아님)
- 각 옵션: `{ name, price, imageUrl }` 형태
- 번역 후 `skus_translated`: `{ name_kr, name, price, imageUrl }` 형태
- 다차원 SKU는 `sku_groups_translated`로 차원별 그룹화: `{ dimension, dimension_kr, isColorDim, items[] }`
  - `isColorDim`: 색상 차원 여부 플래그 (Step 2 카드 렌더링·Step 4 색상 차원 판별에 사용)
- SKU 썸네일은 `skuthumb_${itemId}_NN` 키로 IDB 별도 저장 (`skuThumbKeys` 배열)
- **UI Step 1**에서 사용자가 사입할 옵션 카드 클릭(토글) + 이미지 매칭

### 크롤링 핵심 사항 (`background/service-worker.js`)
- **실행 방식**: UI → `SCRAPE_REQUEST` 메시지 → SW의 `tryBackgroundFetch` → 1688 URL fetch + `window.context` JSON 파싱 → `SCRAPE_DONE`
- **로그인 필요 시**: fetch 결과 null → `SCRAPE_ERROR` + 로그인 탭 자동 열기
- **상품명**: `window.context.subject` 또는 유사 필드에서 추출
- **대표 이미지**: `window.context.mainImages` 배열
- **상세 이미지**: `window.context.detailImages` 또는 description HTML 파싱
- **가격**: `window.context.skus[].price` (SKU별)
- **속성**: `window.context.attributes[]` (재질·사양·무게 등)
- `scraper_1688.js`는 스크래핑에 관여하지 않음 (배너 UI 전용)

### UI 구조 (`ui/modules/workspace.js` 외)
- **Master-Detail 스플릿 레이아웃**: 좌측 패널(소싱 후보 탭 + 대기열 탭) / 우측 워크스페이스
- **워크스페이스**: 헤더(버튼) → 스텝 스테퍼(이전·다음 버튼 포함) → 스크롤 영역
- **Step 1 — 정보 검수**: 상품명·재질·사양·무게 확인/편집, 가격 표(인라인 수정), 옵션 카드 4열 그리드
  - 옵션 카드 클릭 → 이름 입력 팝업 (기본값: 번역된 한국어 이름) → 확인 시 선택 완료
  - 이미 선택된 카드 클릭 → 즉시 해제
  - SKU 없는 상품: `__default__` 가상 옵션으로 이미지 선택 모드
  - 쿠팡 참고 카드: `addToQueueFromCandidate`로 추가된 아이템에 쿠팡 상품 정보 카드 표시
  - 상태 변수: `selectedOptions[]`, `optionCustomNames{}`, `optionImageMap{}`, `skuThumbKeys[]`
- **Step 2 — 이미지 크롭**: 상세이미지 드래그 크롭 + 이미지 편집 모달 (크롭 1:1 + 텍스트 제거)
- **Step 3 — 결과 확인**: 대표 이미지 매칭 + 라벨·상세페이지 이미지 미리보기 (Step 3 진입 시 자동 렌더링)
  - 이미지 그리드에서 이미지 클릭 → 팝업에서 옵션 선택 후 매칭 (Step 4 대표이미지 지정용)
- **Step 4 — 쿠팡 론칭**: 서플라이어 허브 Draft API 임시저장 + 소싱 원장 구글 시트 자동 전송
- **진행상황 저장**: 스텝/옵션/매핑/가격/위안가/사양/무게 → `queueData[id].progress` 자동 저장·복원

### 라벨 이미지 (`ui/modules/html_renderer.js`)
"제품 필수 표시사항" 테이블 형태. 자동 입력 필드:
- 상품명, 옵션(색상), 수량, 재질(소재)

고정 필드:
- 제조국: 중국 (Made in China)
- 소비자 상담실: 1577-7011
- 제조자: 헤오르 협력사
- 수입자: 헤오르
- 반품 및 교환: 판매처를 통해서 진행 부탁 드립니다.

### 서플라이어 허브 고정값
- 브랜드: 브랜드 없음
- 거래타입: 기타 도소매업자
- 과세여부: 과세
- 수입여부: 수입상품
- KC 인증: 해당사항없음 (`kcMarkType: '해당사항없음'`, 인증번호 4종 모두 `'해당사항없음'`)
- 법적 근거 증빙 서류: 없음 (`adCert` 필드 자체를 전송하지 않음 = "없음". `adCert: ''` 전송 시 "있음"으로 표시됨 — 실측 확인)
- 상품정보제공고시: 전 항목 상세페이지 참조 (`noticeItemValue: '컨텐츠 참조'`)
  - 카테고리 선택 시 `fetchNoticeSchema`로 항목 목록 자동 수집 → `productNoticeItems` 저장
  - Step 4에서 해당 목록 전체 전송, 수집 실패 시 5개 공통 항목 폴백
- 모델명: 상품명과 동일 (`modelNumber: productName`)
- 사이즈: Step 1 `f-spec` 입력값(사양 속성) 사용, 없으면 `'one size'` 폴백

### 소싱 원장 (`ui/modules/ledger.js` + `docs/google-apps-script/Code.gs`)
- Step 4 완료 시 `pushLedgerToSheet`로 구글 Apps Script 웹앱에 자동 전송
- 컬럼: 현황 / 1688링크 / 상품명 / 색상 / 수량 / 중국원가 / 공급가(수식) / 판매가(수식) / 월판매량 / END ROAS(수식)
- 현황 드롭다운: 제안중 / 통과 / 반려 / 수입완료
- 웹앱 URL은 설정 모달에서 입력, `mobileSyncSettings.sheetUrl`에 저장

## 사용 흐름

### A. 1688 URL 직접 입력
1. 크롬 확장 프로그램 아이콘 클릭 → 새 탭으로 UI 열기
2. 1688 URL 입력 → "추가" 클릭
3. service-worker.js가 1688 페이지 fetch → `window.context` JSON 파싱 (로그인 필요시 로그인 탭 열림)
4. 우측 워크스페이스 자동 열림 → Step 1: 상품 정보 확인/수정
5. Step 2: 상세이미지 드래그 크롭 + 이미지 편집 (선택사항)
6. Step 3: 라벨·상세페이지 이미지 자동 생성 → 미리보기 확인
7. Step 4: "서플라이어 허브 임시저장" → 서플라이어 허브 "중간 저장 불러오기"에서 불러와 등록

### B. 쿠팡 상품 목록에서 소싱 후보 추가
1. 쿠팡 상품 목록 페이지 접속 → 각 상품 카드의 돋보기(🔍) 버튼 클릭
2. 오버레이에서 월판매량·카테고리 ID 확인 → "소싱 후보에 추가" 클릭
3. UI 좌측 "소싱 후보" 탭에 카드 추가
4. 카드에서 1688 URL 입력 후 "크롤링 시작" → 이후 A의 4~7단계

### C. 모바일(iOS) → 데스크탑 소싱 후보 동기화
1. iOS Safari에서 쿠팡 상품 공유 → 단축어 "소싱 추가" → 구글 시트에 URL 기록
2. 데스크탑 UI 상단 "📲 가져오기" 클릭 → 구글 시트 pending 항목 일괄 가져오기
3. 각 URL에서 쿠팡 데이터(상품명·가격·월판매량·썸네일) 추출 → 소싱 후보 카드 등록
4. 카드에서 1688 URL 입력 후 "크롤링 시작" → 이후 A의 4~7단계

## 알려진 제한사항 및 주의사항
- 1688 `window.context` JSON 구조는 업데이트 시 필드명이 바뀔 수 있음
  → `service-worker.js`의 `tryBackgroundFetch` 파싱 로직 수정으로 대응
- 서플라이어 허브 Draft API 구조는 업데이트 시 변경될 수 있음
  → `step4.js`의 API 호출 구조 수정
- 카테고리는 자동 선택이 어려울 수 있어 수동 확인 필요
- MV3 제약: 외부 CDN 스크립트 로드 불가 → html2canvas 로컬 번들 사용
- Gemini API 키 미설정 시 번역이 Google Translate 폴백으로 실행됨 (품질 저하 가능)
- 쿠팡 돋보기 오버레이 셀렉터는 쿠팡 UI 업데이트 시 깨질 수 있음
  → `coupang_search.js` 셀렉터 수정으로 대응

## 작업 로그
- `docs/CHANGELOG.md` 참조 (버전별 변경 이력)
- `docs/SESSION.md` 참조 (현재 진행 중인 작업 상태 — 새 대화 시작 시 반드시 읽을 것)
- `docs/MODULES.md` 참조 (전체 모듈 지도 — 어느 파일에 어떤 기능이 있는지)
- `docs/work-plans/` 참조 (기능별 작업 계획서)

## 작업 규칙 (필수)
- 코드 수정, 파일 생성/삭제 등 **모든 변경 작업 전에** 무엇을 어떻게 할 것인지 설명하고 사용자 승인을 받은 후 진행
- 승인 없이 임의로 파일을 수정하거나 생성하지 않음
- 구현 완료 후 `SESSION.md`, `CHANGELOG.md` 업데이트
- 컨텍스트 소진 시 Antigravity가 이어서 작업 가능 (MODULES.md + SESSION.md 참조)
