# 헤오르 자동 소싱 프로젝트

## 프로젝트 목적
1688에서 소싱한 상품을 쿠팡 서플라이어 허브에 자동으로 등록하는 시스템.
사용자가 1688 URL을 입력하면, 데이터 수집/번역/가격계산/라벨생성/자동등록까지 처리.

## 기술 스택
- **플랫폼**: Chrome Extension (Manifest V3)
- **크롤링**: Content Script (`scraper_1688.js`) — 순수 DOM 스크래핑 방식
- **브라우저 자동화**: `step4.js`에서 `executeScript(world: MAIN)`으로 직접 처리 (`supplier_hub.js`는 현재 미사용 스텁)
- **번역**: `ui/modules/translator.js` (Google Translate 비공개 API, 키 불필요)
- **가격 계산**: `ui/modules/price_calculator.js`
- **라벨/상세페이지 생성**: `ui/modules/html_renderer.js` + html2canvas
- **이미지 저장**: IndexedDB (`ui/modules/idb.js`)
- **UI**: 새 탭으로 여는 HTML 페이지 (`ui/index.html/css/js`) — ES 모듈 방식

## 파일 구조
```
extension/
  manifest.json              # MV3 설정 (권한, CSP)
  background/
    service-worker.js        # 탭 관리, 이미지 다운로드, 메시지 라우팅
  content_scripts/
    scraper_1688.js          # 1688 DOM 스크래핑 (START_SCRAPE → SCRAPE_DONE)
    supplier_hub.js          # 서플라이어 허브 (현재 스텁)
  ui/
    index.html               # 메인 UI (새 탭으로 열림)
    index.css                # 스타일
    index.js                 # 진입점 — 모듈 import + 이벤트 리스너 등록 (~55줄)
    modules/                 # 기능별 ES 모듈 (전체 목록: docs/MODULES.md)
      state.js               # 전역 상태 객체
      utils.js               # 순수 유틸 + DOM 헬퍼
      messages.js            # SW → UI 메시지 라우팅
      queue.js               # 대기열 관리
      scrape.js              # 크롤링 완료 처리
      workspace.js           # 상세뷰·스텝 이동·진행상황 저장
      step1-form.js          # 상품명 정제, 가격 계산
      step1-category.js      # 카테고리 조회 + ZIP/XLSX 파싱
      step2-options.js       # 옵션 카드, 이미지 매칭 팝업
      step2-imagegrid.js     # 이미지 그리드
      step2-cropper.js       # 드래그 크롭 UI
      step3.js               # 라벨·상세페이지 생성
      step4.js               # 서플라이어 허브 임시저장
      idb.js                 # IndexedDB 래퍼
      price_calculator.js    # 가격 계산
      translator.js          # 중국어 → 한국어 번역
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

### SKU 옵션 구조 (`scraper_1688.js`)
- **방식**: 순수 DOM 스크래핑 (API 인터셉터 없음)
- 신형 1688 구조: `div.expand-view-item > img.ant-image-img(src) + span.item-label + span.item-price-stock`
- 각 옵션: `{ name, price, imageUrl }` 형태
- 번역 후 `skus_translated`: `{ name_kr, name, price, imageUrl }` 형태
- SKU 썸네일은 `skuthumb_${itemId}_NN` 키로 IDB 별도 저장 (`skuThumbKeys` 배열)
- **UI Step 1**에서 사용자가 사입할 옵션 카드 클릭(토글) + 이미지 매칭

### 크롤링 핵심 사항 (`content_scripts/scraper_1688.js`)
- **실행 방식**: service-worker → `START_SCRAPE` 메시지 → content script 실행 → `SCRAPE_DONE`
- **상품명**: DOM 셀렉터 → `document.title` 파싱 → H1 태그 순서로 폴백
- **대표 이미지**: 슬라이더/갤러리 DOM 셀렉터
- **상세 이미지**: Shadow DOM (`[class*="html-description"]`) — 페이지 끝까지 스크롤 후 추출
- **가격**: 가격 DOM 셀렉터 → ¥ 기호 텍스트 파싱 순서로 폴백
- **속성(재질)**: DOM 셀렉터 → 페이지 텍스트 키워드 순서로 폴백
- **완료 후**: `CLOSE_TAB` 메시지로 탭 자동 닫기

### UI 구조 (`ui/modules/workspace.js` 외)
- **Master-Detail 스플릿 레이아웃**: 좌측 대기열 큐 / 우측 워크스페이스
- **워크스페이스**: 헤더(버튼) → 스텝 스테퍼(이전·다음 버튼 포함) → 스크롤 영역
- **Step 1 — 정보 검수**: 상품명·재질 확인, 가격 표(인라인 수정), 옵션 카드 4열 그리드
  - 옵션 카드 클릭 → 이름 입력 팝업 (기본값: 번역된 한국어 이름) → 확인 시 선택 완료
  - 이미 선택된 카드 클릭 → 즉시 해제
  - SKU 없는 상품: `__default__` 가상 옵션으로 이미지 선택 모드
  - 상태 변수: `selectedOptions[]`, `optionCustomNames{}`, `optionImageMap{}`, `skuThumbKeys[]`
- **Step 2 — 이미지 크롭**: 상세이미지 드래그 크롭
- **Step 3 — 결과 확인**: 대표 이미지 매칭 + 라벨·상세페이지 이미지 미리보기 (Step 3 진입 시 자동 렌더링)
  - 이미지 그리드에서 이미지 클릭 → 팝업에서 옵션 선택 후 매칭 (Step 4 대표이미지 지정용)
- **Step 4 — 쿠팡 론칭**: 서플라이어 허브 Draft API 임시저장
- **진행상황 저장**: 스텝/옵션/매핑/가격 → `queueData[id].progress` 자동 저장·복원

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
- 법적 근거 증빙 서류: 없음 (`adCert` 필드 미전송 — 빈 문자열/null 전송 시 "있음"으로 표시되므로 필드 자체를 보내지 않음)
- 상품정보제공고시: 전 항목 상세페이지 참조 (`noticeItemValue: '컨텐츠 참조'`)
  - 카테고리 선택 시 `fetchNoticeSchema`로 항목 목록 자동 수집 → `productNoticeItems` 저장
  - Step 4에서 해당 목록 전체 전송, 수집 실패 시 5개 공통 항목 폴백
- 모델명: 상품명과 동일 (`modelNumber: productName`)
- 사이즈: `one size` 고정 (1688 API 전환 후 실제 규격값으로 교체 예정)

## 사용 흐름
1. 크롬 확장 프로그램 아이콘 클릭 → 새 탭으로 UI 열기
2. 1688 URL 입력 → "추가" 클릭
3. 1688 탭 자동 열림 → 크롤링 후 자동 닫힘 (로그인 필요시 수동)
4. 우측 워크스페이스 자동 열림 → Step 1: 상품 정보 확인/수정
5. Step 2: 상세이미지 드래그 크롭 (선택사항)
6. Step 3: 라벨·상세페이지 이미지 자동 생성 → 미리보기 확인
7. Step 4: "서플라이어 허브 임시저장" → 서플라이어 허브 "중간 저장 불러오기"에서 불러와 등록

## 알려진 제한사항 및 주의사항
- 1688 DOM 구조는 업데이트 시 셀렉터가 깨질 수 있음
  → `scraper_1688.js`의 셀렉터 목록 수정으로 대응
- Shadow DOM 요소명(`html-description`)은 1688 업데이트 시 변경될 수 있음
  → `[class*="html-description"]` 셀렉터로 대응 중
- 서플라이어 허브 CSS selector는 사이트 업데이트 시 수정 필요
  → `content_scripts/supplier_hub.js`의 selector 수정
- 카테고리는 자동 선택이 어려울 수 있어 수동 확인 필요
- MV3 제약: 외부 CDN 스크립트 로드 불가 → html2canvas 로컬 번들 사용

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