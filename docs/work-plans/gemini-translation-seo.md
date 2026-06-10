# Gemini 기반 번역·정제 + SEO 전환

> 작성일: 2026-05-29
> 상태: 워크플랜 작성 완료 — 구현 대기
> 재개 방법: 새 대화에서 "gemini-translation-seo.md 읽고 1번 service-worker부터 구현해줘"

## 배경

1688에서 긁어오는 텍스트(상품명·속성/재질·옵션명)의 한국어 품질이 나쁘다. 원인 두 가지:

1. **번역 경로가 Google Translate 비공개 API** (`client=gtx`, 무료지만 중국 이커머스 텍스트 품질 낮음). `translator.js`, `service-worker.js handleTranslate` 둘 다 이 엔드포인트 사용.
2. **`isKorean` 판정이 크롤링 방식 기반 추측** (`scrape.js`: `scrape_method === 'BackgroundFetch' || 'WindowContext'`). 1688 계정 언어가 중국어거나 쿠키 만료 시 중국어가 들어오는데도 `isKorean=true`로 번역을 건너뛰어 **중국어가 그대로 통과**한다. (실측 확인됨 — 캡처상 중국어 상품인데 isKorean=true)

추가로, 쿠팡 서플라이어 허브 `searchTags` 필드가 **빈 값으로 나가고 있어**(`step4.js`의 `searchTags: ''`) SEO 손실.

## 목표

1688 계정 언어를 중국어로 두고, **중국어 원문을 Gemini가 번역+정제+SEO를 한 번에** 처리한다. 원문을 직접 주므로 Google Translate가 의미를 뭉개던 문제가 사라진다. Gemini 키가 없거나 호출 실패 시 기존 Google Translate로 폴백.

## 결정 사항 (사용자 확정)

- **모델**: `gemini-3.1-flash-lite` (stable·경량, 무료 등급 1,500건/일이면 개인 소싱 규모 충분, 상품 1건당 1회 호출). ⚠️ 정확한 모델 ID 문자열은 구현 시 https://ai.google.dev/gemini-api/docs/models 에서 최종 확인.
- **SEO 범위**: 상품명 + 검색태그 **둘 다**.
- **검수 방식**: 생성된 상품명·태그는 Step 1에서 **사용자가 편집 가능** (자동 적용 X).
- **비용**: 무료 등급(1,500건/일)으로 개인 규모는 사실상 0원.

---

## 작업 항목

### 1. `service-worker.js` — Gemini 배치 번역+SEO 핸들러 추가
- 새 메시지 타입 `GEMINI_TRANSLATE_BATCH`.
- 입력: `{ title, attributes: [{name, value}], options: [string] }`
- **JSON 모드 사용** (`responseMimeType: 'application/json'` + `responseSchema`)로 파싱 안정성 확보.
- 응답 스키마:
  ```
  { productName: string,
    searchTags: [string],          // 5~10개, 연관성 높은 것만
    attributes: [{ name, value }], // 입력 순서 유지
    options: [string] }            // 입력 순서 유지
  ```
- **프롬프트 (확정)**:
  ```
  당신은 중국 1688 상품 데이터를 한국 쿠팡·스마트스토어용으로 번역·정제하는
  이커머스 전문가입니다. 입력 JSON의 각 필드를 한국어로 변환해
  동일 구조의 JSON으로만 출력하세요.

  [productName]
  - 핵심 상품명을 자연스러운 한국어로. 검색 노출을 위해 핵심 키워드(품목·용도·특징)를
    자연스럽게 포함하되, 과장 수식어(고품질/최신/다기능/인기 등)와 도매·공장·직판·홍보
    문구는 제거.
  - 브랜드명은 절대 넣지 말 것(브랜드는 별도로 붙음).
  - 50자 이내. 키워드 나열·반복(스터핑) 금지.

  [searchTags]
  - 이 상품을 찾을 만한 한국어 검색어 5~10개.
  - 상품명에 이미 들어간 단어와 겹치지 않는 보완 검색어 위주(연관어·동의어·용도·상황).
  - 정확하고 연관성 높은 것만. 부정확하거나 과장된 태그 금지.

  [attributes]
  - 각 항목의 name(속성명)과 value(값)를 정확히 한국어로 번역. 재질·사양 등 사실 정보
    누락 금지.
  - 숫자·단위·치수(예: 110*98mm, 41g)·영문 소재코드(예: PP, ABS, PET)·모델명은
    원본 그대로 유지(번역·변형 금지).

  [options]
  - 색상·사양 등 옵션명을 자연스러운 한국어로(색상은 통용되는 한국어 색상명).
  - 숫자·치수는 원본 유지.

  [공통 규칙]
  - 동일한 원문은 반드시 동일하게 번역(옵션·속성이 이름 기준으로 매칭되므로 일관성 필수).
  - 이미 한국어인 텍스트는 어색한 부분만 다듬기.
  - 입력 배열의 순서와 개수를 그대로 유지.
  - 설명·주석 없이 JSON만 출력.

  예시 productName: "新款厨房多功能不锈钢刀具套装批发" → "스테인리스 주방 칼 세트"

  입력:
  { "productName": ..., "attributes": [...], "options": [...] }
  ```
- 모델 `gemini-3.1-flash-lite`, 키는 `mobileSyncSettings.geminiApiKey`에서 읽음 (이미 구현됨).
- 기존 `handleRefineProductName`(REFINE_PRODUCT_NAME)은 배치에 흡수되어 불필요 → 제거.

### 2. `scrape.js` `onScrapeDone` — 번역 블록 재작성
- `isKorean`(scrape_method 기반) 분기 **제거**.
- 항상 원문(`title_cn`, `attributes[].value`, `skus[].name`, `sku_groups` items)을 모아 `GEMINI_TRANSLATE_BATCH` 호출.
- 성공 → `titleKr`/`attrs`/`skus`/`sku_groups_translated` 매핑 + `searchTags`를 `fullResult`·`queueData`에 저장.
- **실패/키없음 → 기존 `Translator.translateBatch` + `cleanProductName` 폴백** (searchTags 없음).
- 진단 로그(이미 추가됨) 유지해 전후 비교.

### 3. `step1-form.js` `fillStep1` — 상품명 2차 호출 제거 + 태그 채움
- `refineProductName` 재호출 제거(배치에서 정제 완료). `f-name`에 `title_kr` 그대로 표시.
- `f-tags`(신규)에 `searchTags.join(', ')` 채움.
- 폴백(Gemini 미사용) 시엔 기존 규칙 필터만 적용.

### 4. `index.html` — 검색태그 입력칸 추가
- Step 1 폼(`sec-step1`)의 무게 줄 근처에 전체폭 `<input id="f-tags">` + 라벨 "검색태그 (SEO)" 추가. 기존 `f-spec`/`f-weight` 필드 패턴 그대로.

### 5. `workspace.js` — 진행상황 저장/복원에 태그 포함
- `saveProgress`/`restoreProgress`에 `tags` 추가.
- 입력 리스너 목록(`['f-name', 'f-supply', ...]`)에 `f-tags` 추가.

### 6. `step4.js` — searchTags 전송
- 현재 `searchTags: ''` → `searchTags: (document.getElementById('f-tags')?.value || '')`로 채워 전송.

### 폴백 정책
```
중국어 원문
 ├ Gemini 키 있음 → GEMINI_TRANSLATE_BATCH (번역+정제+SEO 1회)   ← 메인
 └ 키 없음/실패   → Translator(Google Translate) + cleanProductName  ← 폴백(태그 없음)
```

---

## 파일 변경 요약

| 파일 | 변경 |
|------|------|
| `extension/background/service-worker.js` | `GEMINI_TRANSLATE_BATCH` 핸들러 추가, `handleRefineProductName` 제거 |
| `extension/ui/modules/scrape.js` | `isKorean` 분기 제거, 배치 호출 + 폴백, searchTags 저장 |
| `extension/ui/modules/step1-form.js` | 2차 정제 호출 제거, `f-tags` 채움 |
| `extension/ui/index.html` | Step 1에 `f-tags` 검색태그 입력칸 추가 |
| `extension/ui/modules/workspace.js` | progress에 `tags` 저장/복원 |
| `extension/ui/modules/step4.js` | `searchTags` 전송 |
| `docs/SESSION.md`, `docs/CHANGELOG.md`, `CLAUDE.md` | 작업 로그 + 번역 설명 갱신 |

**재사용 자산**: `mobileSyncSettings.geminiApiKey`(구현됨), `Translator.translateBatch`/`cleanProductName`(폴백), SW `onMessage` switch 패턴, `f-material`/`f-spec` 폼 필드 패턴.

---

## 작업 순서
1. `service-worker.js` 배치 핸들러 (핵심)
2. `scrape.js` 호출+폴백 연결
3. `index.html` + `step1-form.js` + `workspace.js` 태그 UI/저장
4. `step4.js` searchTags 전송
5. 통합 테스트 + 문서 갱신

---

## 검증 방법

| 항목 | 확인 |
|------|------|
| 번역 품질 | 1688 계정 언어 중국어로 둔 채 크롤링 → 콘솔(F12) 진단 로그에서 중국어 원문 → 자연스러운 한국어 확인, 속성·옵션 테이블도 한국어 |
| 상품명 SEO | Step 1 상품명이 키워드 포함 자연스러운 이름인지 |
| 검색태그 | `검색태그` 칸에 연관 태그 5~10개 채워지고 편집 가능한지 |
| 폴백 | 키 비우고 재크롤링 → Google Translate 폴백 동작(중국어 안 통과) |
| 전송 | Step 4 임시저장 → 서플라이어 허브에서 `searchTags` 반영 확인 |
| 회귀 | Step 1~4 전체 흐름 정상 동작 |

---

## 진행 상태

| 항목 | 상태 |
|------|------|
| 워크플랜 작성 | ✅ |
| 1. SW 배치 핸들러 | ✅ |
| 2. scrape.js 연결 | ✅ |
| 3. 태그 UI/저장 | ✅ |
| 4. step4 전송 | ✅ |
| 5. 통합 테스트 + 문서 | ✅ |
