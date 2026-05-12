# 상품명 자동 정제 기능 (규칙 기반 + AI 하이브리드) 구현 계획서

본 계획서는 `autoSourcing` 크롬 익스텐션에서 1688 크롤링 시 수집된 번역된 상품명(`title_kr`)을 한국 쇼핑몰(예: 쿠팡)에 적합한 깔끔한 형태로 자동 정제하는 기능의 구현 지시서입니다. 
클로드 코드(Claude Code)에게 이 문서를 전달하여 구현을 요청하세요.

## 1. 목표
- 1688 특유의 길고 스팸성 키워드가 섞인 직역 상품명을 사용자 친화적으로 짧고 명확하게 정제.
- **하이브리드 방식 적용**: 
  1차: 정규식을 통한 불필요한 키워드 제거 (빠른 전처리)
  2차: Gemini API를 활용한 자연어 정제 (품질 향상)

## 2. 작업 대상 파일
- `extension/ui/index.js` (UI 로직 수정)
- `extension/background/service-worker.js` (Gemini API 호출 로직 추가 권장 - CORS 및 키 보안 목적)

## 3. 구현 단계별 지시사항 (Claude Code 전달용)

### 단계 1: Gemini API 호출 백그라운드 로직 구현
- **위치**: `extension/background/service-worker.js`
- **내용**:
  - `chrome.runtime.onMessage` 리스너에 `type: 'REFINE_PRODUCT_NAME'` 메시지 처리 핸들러 추가.
  - 루트의 `.env` 파일에 있는 `GOOGLE_API_KEY`를 활용할 수 있도록 설정 (번역 로직 등에 이미 설정되어 있다면 해당 설정 재사용).
  - Gemini API (예: `gemini-1.5-flash` 또는 `gemini-1.5-pro`) 엔드포인트로 fetch 요청.
  - **프롬프트 예시**:
    > "다음은 중국 쇼핑몰에서 수집된 상품명입니다. 한국의 쿠팡이나 네이버 스마트스토어에서 판매하기 좋은 깔끔하고 간결한 상품명으로 정제해주세요. 수식어나 도매 관련 용어는 제거하고 핵심 상품명만 1줄로 출력하세요. 원본: [상품명]"

### 단계 2: 규칙 기반 필터링 및 프론트엔드 유틸리티 함수 추가
- **위치**: `extension/ui/index.js` (또는 적절한 유틸 파일)
- **내용**:
  - `refineProductName(rawName)` 비동기 함수 생성.
  - **1차 정제 (Rule-based)**:
    - 정규식을 사용하여 불필요한 키워드 제거.
    - 예시 키워드: "국경 간", "공장 직접 판매", "공장 직판", "크로스 보더", "도매", "도매가", "직접 판매", "당일 발송" 등.
  - **2차 정제 (AI)**:
    - 1차 정제된 문자열을 백그라운드 워커에 메시지로 전달하여 Gemini 결과를 받아옴 (`chrome.runtime.sendMessage`).
  - 통신 실패나 에러 발생 시 1차 정제된 결과라도 반환하도록 `try-catch` 구현.

### 단계 3: UI 렌더링 로직 수정
- **위치**: `extension/ui/index.js` 내 `fillStep1(result)` 함수
- **내용**:
  - 기존 동기적 할당 로직을 비동기 정제 로직으로 변경.
  - **기존 코드**:
    ```javascript
    $('f-name').value = result.title_kr || '';
    ```
  - **수정 코드 (예시)**:
    ```javascript
    $('f-name').value = '상품명 정제 중...'; // 로딩 상태 표시
    
    // 정제 함수 호출
    const refinedName = await refineProductName(result.title_kr || '');
    
    $('f-name').value = refinedName;
    ```
  - `fillStep1`이 비동기 함수가 되므로, 이를 호출하는 쪽(`openDetailView` 등)의 비동기 처리 흐름에 문제가 없는지 확인 및 수정.

### 단계 4: 라벨 이미지 생성 시 빈 색상값 처리 (보너스 개선)
- **위치**: `extension/ui/index.js` 내 `genLabel()` 함수 또는 라벨 생성 렌더링 로직
- **내용**:
  - `option` (색상) 값이 비어있는 경우(예: `__default__` 이거나 빈 문자열), 라벨 표에 공란으로 두지 말고 `"상품 이미지 참조"` 또는 `"단일 옵션"` 등으로 표기되도록 예외 처리 추가.

### 단계 5: 재질(Material) 영문 표기 유지 (번역 예외 처리)
- **위치**: `extension/ui/index.js` 내 `fillStep1(result)` 함수 또는 번역 유틸리티
- **내용**:
  - 재질 항목을 채울 때 'EVA', 'PU', 'PVC' 등과 같은 영문 소재가 포함되어 있을 경우, 어색한 한글(예: '에바', '푸')로 변환되지 않도록 처리합니다.
  - `matAttr.value` (원본 중국어/영문)에서 정규식 `/[a-zA-Z]+/g` 등을 사용해 영문 약어를 추출하고, 번역된 `value_kr`의 해당 부분을 원본 영문으로 다시 복구(replace)하거나, 처음부터 해당 단어가 번역을 우회하도록 예외 처리 로직을 추가합니다.

## 4. 기대 결과
크롤링이 완료되고 `openDetailView`가 실행되어 모달이 열렸을 때:
1. `f-name` 인풋 필드에 정제된 상품명이 채워집니다.
2. 색상 정보가 비어있을 경우 적절한 기본 문구로 대체됩니다.
3. **재질 항목에 있는 'EVA' 등의 영문 약어가 어색한 한글로 변환되지 않고 유지됩니다.**
