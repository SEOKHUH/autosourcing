## 역할
위안가 → 원가·공급가·판매가 계산 (순수 함수)

---

## 주요 함수

- `PriceCalculator.calculatePrices(yuanPrice, qty = 1)` — 단일 위안가로 가격 계산
  - 반환: `{ cost_price, supply_price, selling_price, margin }`
- `PriceCalculator.calculateFromSkus(skus)` — SKU 배열에서 **최고가** 기준 계산
  - 가격이 0보다 큰 SKU 중 최대값 사용

## 계산 공식

| 단계 | 공식 | 예시 (¥5.5, qty=1) |
|------|------|---------------------|
| 원가 | `floor(위안가 × 400 × 수량)` | 2,200원 |
| 공급가 | `ceil((원가 + 3000) / 100) × 100` | 5,200원 |
| 판매가 | `ceil(공급가 / 0.6 / 100) × 100` | 8,700원 |
| 마진 | `판매가 - 공급가` | 3,500원 |

## 주의사항
- `calculateFromSkus`는 SKU별 가격이 다를 때 최고가 기준으로 일괄 적용 (보수적 계산)
- 가격 표에서 공급가·판매가는 인라인 수정 가능 → 수정 시 `saveProgress`로 저장
- `f-yuan` 직접 수정 시 `step1-form.js`의 `initYuanInput`이 실시간 재계산 트리거
