# 1688 스크래퍼 — window.context 기반 전환 계획

**작성일**: 2026-05-13  
**상태**: 구현 예정

---

## 배경

현재 `scraper_1688.js`는 순수 DOM 스크래핑 방식으로 동작. 문제점:
- 1688 DOM 구조 업데이트 시 셀렉터 깨짐
- 재질(소재) 등 속성 데이터 수집 정확도 낮음
- 탭을 열고 스크롤까지 기다려야 하는 느린 흐름

대안: 1688 SSR HTML에 `window.context`로 상품 데이터 전체가 포함되어 있음 → DOM 대신 이 데이터 파싱으로 전환.

---

## 확인된 데이터 구조

| 필드 | 경로 | 비고 |
|------|------|------|
| 상품명 | `window.context.result.data.gallery.fields.subject` | 한국어 설정 시 한국어 직접 수신 |
| 대표 이미지 | `Root.fields.dataJson.images[].fullPathImageURI` | |
| SKU 이름+가격 | `Root.fields.dataJson.skuModel.skuInfoMap` | 키=`"색상>사양"` (HTML 엔코딩), 값=`{discountPrice, skuId}` |
| SKU 이미지 | `skuModel.skuProps[i].value[j].imageUrl` | 색상 상품만 있음, 없으면 null |
| 상세이미지 URL | `description.fields.detailUrl` | 별도 fetch → img src 추출 |
| 속성 (재료·사양 등) | raw HTML `<td>키</td><td>값</td>` 테이블 파싱 | 재료·사양 확인, 무게는 상품마다 다름 |

### skuInfoMap 핵심 사항
- 키: `"하늘색&gt;120g 아동용"` → HTML decode → `"하늘색>120g 아동용"` → `>` split
- 값: `{ discountPrice: "5.50", skuId, specAttrs }` — `discountPrice`가 항상 존재, `price`는 없을 수 있음
- 단차원이면 키에 `>` 없음

### 언어 처리
1688 계정 언어를 한국어로 설정하면 서버가 한국어 HTML 반환 → 번역 불필요.  
SW가 쿠키(언어 설정 포함)와 함께 fetch하면 한국어 데이터 수신.

---

## 구현 방식

### Plan A — Background Fetch (탭 없이)
1. `chrome.cookies.getAll({ domain: '.1688.com' })` → 쿠키 문자열 조합
2. SW에서 직접 `fetch(url, { Cookie, Accept-Language: ko-KR })` → HTML 텍스트 수신
3. 정규식으로 `window.context` JSON 추출 → `mapContextData()` → 결과 생성
4. HTML 테이블 파싱 → `attributes[]` 추출 (재료, 사양, 무게 등)
5. `detailUrl` fetch → img src 추출 → `detail_images[]`
6. `SCRAPE_DONE` 브로드캐스트 → 탭 없이 완료
7. 실패 시 Plan B로 fall-through

### Plan B — 탭 방식 (fallback)
1. 1688 탭 열기 → 페이지 로드 완료
2. `executeScript(world: 'MAIN')` → `window.context` 읽기
3. `mapContextData()` → `preloadedData`로 content script에 전달
4. content script가 바로 `SCRAPE_DONE` relay → 탭 닫힘

---

## 수정 파일 목록

### 1. `extension/background/service-worker.js`
- `GLOBALS` 배열에 `'context'` 추가
- `mapContextData(ctx, htmlText)` 함수 신규 추가
- `tryBackgroundFetch(url)` 함수 신규 추가
- `handleScrapeRequest`에 Plan A 로직 추가 (탭 열기 전 시도)
- Plan B: `executeScript` 결과를 `mapContextData()` 거쳐 `preloadedData`에 담기

### 2. `extension/content_scripts/scraper_1688.js`
- `START_SCRAPE` 핸들러: `msg.preloadedData`가 있으면 DOM 스크래핑 없이 바로 `SCRAPE_DONE`
- DOM 스크래핑 함수 전체 제거 (`scrapeFromDOM`, `scrollToBottom`, `extractDetailImages`)
- 얇은 relay 파일로 단순화

### 3. `extension/ui/modules/scrape.js`
- `onScrapeDone`에서 `scrape_method: 'BackgroundFetch'` 또는 `'WindowContext'`이면 번역 스킵
- title, SKU, 재질 모두 이미 한국어

### 4. `extension/ui/modules/step4.js`
- `exposedAttributes`의 `사이즈: 'one size'` → 수집된 `attributes`에서 `사양` 값으로 교체
- 없으면 `'one size'` 폴백 유지

---

## 결과 스펙 (기존 동일)

```js
{
  title_cn,       // 상품명 (한국어)
  price_min,      // 최저가 (위안)
  images,         // 대표 이미지 URL[]
  detail_images,  // 상세 이미지 URL[]
  skus,           // [{ name, price, imageUrl, skuId }]
  sku_groups,     // 다차원 SKU 그룹
  attributes,     // [{ name, value }] — 재료, 사양, 무게 등
  scrape_method,  // 'BackgroundFetch' | 'WindowContext' | 'Pure-DOM'
}
```

---

## 검증 방법

1. 확장 새로고침 → 1688 URL 추가
2. 콘솔 로그에서 `scrape_method` 확인 (`BackgroundFetch` 또는 `WindowContext`)
3. Step 1: 상품명(한국어)·가격·SKU(이름+이미지) 정상 표시 확인
4. Step 1: 재료·사양 속성 표시 확인
5. Step 4: `사이즈` 필드에 실제 사양값 들어가는지 확인
6. Step 2 상세이미지 크롭 정상 동작 확인
