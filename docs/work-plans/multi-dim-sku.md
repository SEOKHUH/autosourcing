# 다차원 SKU 지원 작업 계획

## 배경 / 문제

현재 `scraper_1688.js`는 모든 옵션 차원(색상, 사양 등)을 하나의 flat 배열 `skus[]`로 합쳐버린다.
색상만 있는 상품은 문제없지만, 색상 + 사양처럼 **두 개 이상의 차원**이 있는 상품에서:

- 색상 12개 + 사양 2개 → 14개가 뒤섞인 flat 리스트로 표시됨
- 사양별 가격(¥3.4 / ¥4.5)이 색상 옵션과 섞여 가격 계산이 틀림
- 이미지(썸네일)는 색상에 붙는데, 사양에 없는 이미지가 빈칸으로 표시됨

## 목표

- 차원이 1개인 기존 상품 → 현재와 동일하게 동작 (하위 호환)
- 차원이 2개 이상인 상품 → 그룹별로 분리해서 표시
  - 이미지 없는 차원(사양/규격) → 가격 결정용 chips
  - 이미지 있는 차원(색상) → 기존 옵션 카드 (썸네일 + 이름)

---

## 변경 범위

### 1. `scraper_1688.js` — 차원별 분리 추출

**현재**: 모든 `expand-view-item`을 하나의 `skuMap`으로 병합  
**변경**: 차원 컨테이너를 먼저 찾고, 각 컨테이너 안의 아이템을 별도 그룹으로 수집

#### 반환 구조 변경

```js
// 기존
skus: [{ name, price, imageUrl }]

// 신규 추가 (skus는 하위호환용으로 유지)
sku_groups: [
  { dimension: "颜色", dimension_kr: "색상", items: [{ name, price, imageUrl }] },
  { dimension: "规格", dimension_kr: "사양", items: [{ name, price, imageUrl }] },
]
```

#### 핵심 로직 변경

```js
// 변경 전: expand-view-item 전체를 하나의 그룹으로 mergeGroup()
const expandItems = document.querySelectorAll('[class*="expand-view-item"]');
mergeGroup(Array.from(expandItems), 'sku-expand-view-item');

// 변경 후: 차원 컨테이너를 먼저 찾고, 각각 별도 그룹 추출
// 신형 1688 차원 컨테이너 후보:
//   [class*="expand-view-list"]  ← 각 차원이 하나씩
//   [class*="sku-prop"]          ← 구형
//   .J_Prop                      ← 구형
// 각 컨테이너에서:
//   - 차원명: 컨테이너 이전 형제 또는 부모의 title/label 요소
//   - 아이템: [class*="expand-view-item"] 또는 li[title]
```

> ⚠️ **셀렉터 주의**: 1688 DOM은 업데이트로 구조가 바뀔 수 있음.  
> 실제 페이지 HTML 구조를 확인 후 셀렉터 조정 필요.  
> 차원 컨테이너를 못 찾으면 기존 flat 방식으로 폴백.

#### 하위 호환 폴백

- `sku_groups` 추출 성공 → `skus`는 모든 그룹의 items를 flatten한 값으로 설정
- `sku_groups` 추출 실패 → 기존처럼 `skus` 하나로만 반환, `sku_groups`는 단일 그룹으로 래핑

---

### 2. `service-worker.js` 또는 번역 로직 — `sku_groups` 번역

**현재**: `skus[]`의 각 `name`을 번역 → `skus_translated[]`  
**변경**: `sku_groups[]`의 각 그룹도 번역

```js
// 번역 대상 추가
for (const group of result.sku_groups) {
  group.dimension_kr = await translate(group.dimension); // 차원명 번역
  for (const item of group.items) {
    item.name_kr = await translate(item.name); // 옵션명 번역 (기존과 동일)
  }
}
```

번역 완료 후 `sku_groups_translated`를 `scrape_result`에 추가.

---

### 3. `index.js` Step 1 UI — 그룹별 렌더링

#### 3-1. `renderOptionCards()` 시그니처 변경

```js
// 기존
async function renderOptionCards(skus) { ... }

// 변경
async function renderOptionCards(skuGroups) { ... }
// skuGroups = sku_groups_translated || sku_groups || [{ dimension_kr: '옵션', items: skus }]
```

단일 차원인 경우 현재와 동일한 카드 UI.  
다차원인 경우 차원별로 섹션을 분리:

#### 3-2. 다차원 렌더링 UI 구조

```
┌─ 사양 (이미지 없는 차원) ──────────────────────┐
│  [120g ¥3.4]  [180g ¥4.5]                     │
│  → 클릭으로 사입 토글, 가격 재계산에 사용        │
└────────────────────────────────────────────────┘

┌─ 색상 (이미지 있는 차원) ──────────────────────┐
│  [🟦진한 파란색] [🔵하늘색] [🌹로즈레드] ...   │
│  → 현재와 동일한 옵션 카드 (썸네일 + 이름)      │
└────────────────────────────────────────────────┘
```

- **이미지 없는 차원**: `<div class="sku-dim-chips">` + `<button class="sku-chip">` (체크 토글)
- **이미지 있는 차원**: 기존 `<div class="option-cards">` (4열 그리드)
- 차원명 레이블 (`<div class="section-label">`) 각 섹션 위에 표시

#### 3-3. `selectedOptions[]` 구조

변경 없음. 차원에 관계없이 선택된 옵션명(번역명)을 모두 `selectedOptions`에 추가.

#### 3-4. 가격 재계산 `onSkuChange()`

```js
// 현재: selectedOptions 중 price가 있는 옵션의 max price 사용
// 변경 없음 — 사양 옵션에도 price가 붙어 있으므로 동일 로직 사용 가능
```

---

### 4. `index.js` — `openDetailView()` 연결

```js
// 변경
const skuGroups = currentScrapeResult?.sku_groups_translated
               || currentScrapeResult?.sku_groups
               || [{ dimension_kr: '옵션', items: skus }]; // 폴백
await renderOptionCards(skuGroups);
```

---

## 구현 순서

1. **scraper_1688.js** — `sku_groups` 추출 로직 추가 (차원 컨테이너 탐지)
2. **번역 로직** — `sku_groups` 차원명 + 아이템명 번역
3. **index.js** — `renderOptionCards()` 다차원 분기 처리
4. **index.css** — `.sku-dim-chips`, `.sku-chip` 스타일 추가
5. **테스트** — 단일 차원 / 다차원 상품 각각 확인

---

## 현재 구현 상태 (2026-05-04 기준)

### f-option 필드 처리 방식
- `selectedOptions`에는 색상 + 사양 옵션명이 모두 저장됨 (가격 계산에 함께 사용)
- `f-option` 표시에는 색상 차원 옵션명만 반영 (사양 제외)
- 색상 차원 판별 기준 (`step1-form.js → onSkuChange`):
  1. `isColorDim === true` (스크래퍼에서 설정: 이미지 있거나 차원명 `/颜色|色彩|color/`)
  2. 아이템 중 `imageUrl` 있는 경우
  3. 차원명(`dimension_kr` 또는 `dimension`)에 `색상|색|컬러|颜色|色彩|色系|color` 키워드 포함

### 알려진 한계 및 향후 개선 필요 사항
- `isColorDim` 플래그가 `false`여도 차원명 키워드로 보완하는 임시 방식 → 1688 차원명 변형이 많아 누락 가능
- 사양 선택이 Step 4 쿠팡 등록에 어떻게 반영될지 미결정 (현재는 색상 옵션만 SKU로 등록)
- 색상×사양 조합 SKU를 쿠팡에 등록하는 방식은 별도 검토 필요
- **추후 개선 방향**:
  - 차원 유형(색상 vs 사양)을 사용자가 직접 지정할 수 있는 UI 추가
  - 또는 스크래퍼에서 차원명 키워드 목록을 더 넓게 커버하도록 수정

## 미결정 사항 (사용자 확인 필요)

- **쿠팡 등록 시 사양 처리**: 사양×색상 조합을 어떻게 등록할지는 Step 4 작업 시 별도 검토

---

## 영향받는 파일

| 파일 | 변경 내용 |
|------|----------|
| `content_scripts/scraper_1688.js` | `sku_groups` 추출 로직 추가 |
| `background/service-worker.js` | `sku_groups` 번역 추가 |
| `ui/index.js` | `renderOptionCards()` 다차원 분기 |
| `ui/index.css` | `.sku-chip` 스타일 추가 |
