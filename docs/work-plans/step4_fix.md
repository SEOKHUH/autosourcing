# Step 4 (서플라이어 허브 임시저장) 수정 계획

**작성일**: 2026-05-04  
**최종 수정**: 2026-05-06  
**상태**: 코드 수정 완료, 실기기 테스트 대기 ⚠️

---

## 배경

`extension/ui/modules/step4.js`의 Draft API 호출 로직이 실제 서플라이어 허브 API 스펙과 달라, 임시저장 후 불러올 때 여러 필드가 비어있는 문제.

**중간저장 목적**: 개발 검증용 — 데이터가 파이프라인을 제대로 타고 서플라이어 허브까지 들어가는지 확인.

네트워크 로그 수집: 사용자가 직접 서플라이어 허브에서 상품 등록하며 기록 → `docs/api_update/` 저장.

---

## 발견된 버그 5가지

| # | 항목 | 현재 코드 | 실제 API |
|---|------|-----------|----------|
| 1 | version | `160` | `164` |
| 2 | productPage 구조 | 가격/속성을 productPage 직하에 | `commonAttributes` 안에 중첩 |
| 3 | brand | `'헤오르'` | `'브랜드 없음'` |
| 4 | manufacturer | `'헤오르'` | `'헤오르 협력사'` |
| 5 | 이미지 파일명 추출 | `j[0]`(객체 전체) | `j[0].imageName` (문자열) |

추가: 다중 옵션(SKU)마다 jsonDocument 항목 하나씩 생성 필요 (현재 단일 항목만)

---

## 수정 상세

### 버그 2 — productPage 구조

```json
// 현재 (잘못됨)
"productPage": {
  "brand": "헤오르",
  "coupangSalePrice": 8900,
  "purchasePrice": 5000,
  "exposedAttributes": [...]
}

// 수정 후
"productPage": {
  "brand": "브랜드 없음",
  "commonAttributes": {
    "exposedAttributes": [...],
    "purchasePrice": 5000,
    "coupangSalePrice": 8900,
    "productBarcode": "바코드 없음(쿠팡 바코드 생성 요청)"
  },
  "manufacturer": "헤오르 협력사",
  "businessType": "기타 도소매업자",
  "taxationSchema": "과세",
  "importType": "수입상품",
  "searchTags": "",
  "unexposedAttributes": []
}
```

### 버그 5 — 이미지 파일명 추출

```js
// 현재 (잘못됨) — j[0]이 객체 전체가 됨
j.imageFilename || j.filename || (Array.isArray(j) ? j[0] : null) || null

// 수정 후
Array.isArray(j) ? (j[0]?.imageName || null) : (j?.imageName || null)
```

### 다중 SKU 지원

- `state.selectedOptions` 배열 순회 → 옵션마다 jsonDocument 항목 하나 생성
- 각 항목: 해당 옵션의 SKU 썸네일(`state.optionImageMap`)을 mainImage로 업로드
- 라벨, 상세 이미지는 모든 SKU 공유
- `__default__` 또는 옵션 없는 상품: 단일 항목, 첫 번째 대표 이미지 사용

---

## 이미지 업로드 순서

```
LABEL 업로드 (공통)
DETAIL 업로드 (공통)
SKU별 MAIN 업로드 (옵션마다)
→ jsonDocument 구성
→ /sr/draft/api/update 호출
```

---

## 수정 대상 파일

- `extension/ui/modules/step4.js` (전체 재작성)

---

## 검증 방법

1. `chrome://extensions` 에서 확장 리로드
2. 1688 URL 추가 → 크롤링 → Step 1 옵션 선택 → Step 3 라벨/상세 생성
3. Step 4 "서플라이어 허브 임시저장" 클릭
4. 로그 패널: 에러 없이 "🎉 임시저장 완료" 확인
5. 서플라이어 허브 → "중간 저장 불러오기" → 상품명, 가격, 브랜드, 이미지 정상 확인

---

## 추가 수정 이력 (2026-05-06)

### 문제
서플라이어 허브에서 불러왔을 때 모델명·수량·사이즈가 비어 있고, 사양(spec) 차원 옵션이 색상과 동일하게 별도 행으로 생성됨.

### 수정 내용 (`extension/ui/modules/step4.js`)

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 모델명 | 미전송 | `productPage.modelNumber = productName` |
| SKU 행 구성 | selectedOptions 전체 (색상+사양) | 색상 옵션만 행 생성, 사양은 행 X |
| exposedAttributes | 색상만 | 색상 + 수량(`f-qty`) + 사이즈(`one size` 고정) |

**사이즈 처리 방침**: 현재 1688에서 규격 정보를 수집하지 않으므로 `one size`로 고정. 추후 1688 API 전환 후 실제 규격값으로 교체 예정.

**색상/사양 구분 로직**: `sku_groups_translated`의 `isColorDim` 플래그 및 `imageUrl` 유무로 판별 (step1-form.js의 `onSkuChange`와 동일한 로직 사용).

---

## 추가 수정 이력 (2026-05-06 #2)

### 문제 1: 이미지 업로드 500 오류 (`INTERNAL_SERVER_ERROR`)
- **원인 A**: 이미지 업로드 전 draft의 `jsonDocument`에 `imagePage` 구조가 없어 서버 측 NPE 발생
  - **수정**: create 직후, 업로드 전에 pre-update 호출 (빈 `imagePage` 포함한 전체 구조 저장)
- **원인 B**: 1688 CDN이 `fetch()` 기본 Accept 헤더로 WebP 이미지를 내려줄 수 있고, Java ImageIO가 WebP 미지원
  - **수정**: `service-worker.js` 이미지 다운로드 시 `Accept: image/jpeg,image/png,image/*;q=0.8` 헤더 추가

### 문제 2: 옵션 여러 개 선택해도 1행만 생성
- **원인**: `sku_groups_translated`가 없거나 단일 차원일 때 `colorOptions` 필터링 결과가 빈 배열 → 단일 기본 항목 폴백
- **수정**: `colorOptions`가 비면 선택된 전체 옵션을 색상으로 처리하는 폴백 추가

---

## 추가 수정 이력 (2026-05-06 #3)

### 문제 1: 법적 근거 증빙 서류가 "있음"으로 표시
- **원인**: `adCert: ''` (빈 문자열)을 전송하면 UI에서 "있음"으로 표시됨
- **수정**: `legalPage`에서 `adCert` 필드 자체를 제거 → 필드 absent = "없음"

### 문제 2: 상품정보제공고시가 카테고리별 전체 항목을 체크하지 못함
- **수정**: `step1-category.js`의 `fetchNoticeNumber` → `fetchNoticeSchema`로 확장
  - 스키마 API: `/sr/schema/api/get-default-schemaform?internalDisplayCode=${code}` 응답에서 notice 항목 이름 목록 추출
  - 응답 필드 시도 순서: `j.notices → j.noticeItems → j.productNoticeItems`
  - 카테고리 선택 시 `queueData[id].productNoticeItems` 배열 저장
- `step4.js`: `p.noticeItems` 배열로 notices 동적 구성 (없으면 5개 공통 항목 폴백)

---

## 서플라이어 허브 legalPage 고정값

### 법적 근거 증빙 서류 (`adCert`)
- 항상 **없음** = 현재 조사 중
- `""`, `null`, 필드 없음 모두 시도했으나 로드 시 "있음"으로 표시됨
- 정확한 "없음" 값 미확정, 추가 조사 필요

### KC 인증 (`kcMarkType`)
- 항상 `'해당사항없음'`

### KC 인증번호 (`certificates`)
```js
[
  { certificateName: '전기용품 및 생활용품, 어린이 (KC) 인증번호', certificateValue: '해당사항없음' },
  { certificateName: '방송통신 기자재 (EMC) 인증 번호', certificateValue: '해당사항없음' },
  { certificateName: '안전기준적합확인 신고번호', certificateValue: '해당사항없음' },
  { certificateName: 'KCS 인증번호', certificateValue: '해당사항없음' },
]
```

### 상품정보제공고시 (`notices`)
- 모든 항목 "상세페이지 참조" 체크 = `noticeItemValue: '컨텐츠 참조'`
- **현재 구현**: 카테고리 선택 시 스키마 API에서 항목 목록 자동 수집 (`fetchNoticeSchema`)
  - 수집된 항목 → `queueData[id].productNoticeItems` 배열 저장
  - Step 4에서 해당 배열 전체를 `'컨텐츠 참조'`로 전송
  - 항목 수집 실패 시 5개 공통 항목으로 폴백
- **미확인**: 스키마 API 응답의 실제 필드명 (`j.notices | j.noticeItems | j.productNoticeItems`) — 테스트 후 확정 필요
