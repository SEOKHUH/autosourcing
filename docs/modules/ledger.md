## 역할
소싱 원장 행 데이터 빌드 — Step 4 완료 후 구글 시트 `ledger` 탭에 전송할 행 배열 생성

---

## 주요 함수

- `buildLedgerRows(item)` — queueData 아이템으로 원장 행 배열 생성
  - 색상 차원 옵션별로 1행씩 생성 (색상 없으면 단일 행)
  - `monthlySales`: `item.estimatedMonthlySales` (모바일 싱크로 수집된 값)

## 행 구조

| 필드 | 소스 | 비고 |
|------|------|------|
| `url1688` | `item.url` | 1688 원본 URL |
| `productName` | `f-name` 입력값 | Step 1에서 사용자가 확인/편집한 상품명 |
| `color` | 색상 옵션명 | 옵션 없으면 빈 문자열 |
| `qty` | `f-qty` 입력값 | 주문 수량 |
| `yuan` | SKU 가격 (위안) | 해당 옵션의 위안가 |
| `monthlySales` | `item.estimatedMonthlySales` | 쿠팡 예상 월판매량 |

## 색상 차원 판별 로직
- `sku_groups_translated`의 `isColorDim` 플래그 우선
- 없으면 이미지 유무 + 색상 키워드(`색상|색|컬러|颜色|color`) 매칭
- 색상 옵션 없으면 선택된 전체 옵션을 단일 행으로 처리

## 구글 시트 컬럼 구조 (ledger 탭)
`현황 | 1688링크 | 상품명 | 색상 | 수량 | 중국원가(위안) | 공급가(수식) | 판매가(수식) | 월판매량 | END ROAS(수식)`

- 공급가 수식: `=CEILING(F*400+3000, 100)`
- 판매가 수식: `=CEILING(G/0.6, 100)`
- END ROAS 수식: `=IFERROR((H/(G-F*400))*1.1, "-")`
- 현황 드롭다운: `제안중 | 통과 | 반려 | 수입완료`

## 상태 의존 (state.js)
- 읽기: `currentScrapeResult`, `queueData`, `selectedOptions`

## 주의사항
- `buildLedgerRows`는 순수 함수 (DOM 조작 없음) → mobile-sync.js의 `pushLedgerToSheet`에서 호출
- 월판매량 열은 Apps Script에서 기존 시트에 없으면 자동 삽입 마이그레이션 로직 포함
