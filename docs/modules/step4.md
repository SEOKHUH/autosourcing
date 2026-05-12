## 역할
Step 4 — 서플라이어 허브 Draft API 4단계 호출로 임시저장

## 주요 함수
- `startRegister()` — "서플라이어 허브 임시저장" 버튼 클릭 시 실행
  1. IDB에서 라벨·상세·옵션별 대표 이미지 읽기 → base64 변환
  2. supplier.coupang.com 탭 확보 (없으면 새로 열기)
  3. `executeScript MAIN world`로 4단계 Draft API 호출:
     - `POST /sr/draft/api/create` → docId 확보
     - `POST /sr/draft/api/update` (pre-update) → 빈 imagePage 포함 전체 구조 선행 저장
     - `POST /sr/draft/api/upload-images/{docId}?imageType=LABEL|DETAIL|MAIN` — 이미지 업로드
     - `POST /sr/draft/api/update` (final) → 실제 파일명 포함 jsonDocument 전송
  4. docId를 `item.draftDocId`에 저장

## API 호출 구조 (jsonDocument 항목 1개 = SKU 1개)
- `startPage`: 상품명, 카테고리 경로
- `productPage`: 브랜드(브랜드 없음), 모델명(상품명), 거래타입, 과세여부, 수입여부, commonAttributes(가격/속성)
- `imagePage`: 메인이미지, 라벨이미지, 상세이미지 파일명
- `legalPage`: KC인증(해당사항없음), certificates(4종), notices(카테고리별 항목 또는 공통 5개)
  - `adCert` 필드 전송하지 않음 (전송하면 "있음"으로 표시됨)
- `logisticsPage` / `sourcingPage`: 빈값

## 색상 옵션 구분 로직
`sku_groups_translated`의 `isColorDim` 플래그 + `imageUrl` 유무 + 색상 키워드 매칭으로 색상/사양 차원 구분:
- 색상 차원 옵션만 jsonDocument 행 생성 (사양 차원은 행 미생성)
- `sku_groups_translated` 없거나 필터 결과 빈 배열 → 선택된 전체 옵션을 색상으로 처리 (폴백)

## 상태 의존 (state.js)
- 읽기: `currentScrapeResult`, `queueData`, `currentModalItemId`, `allImages`, `selectedOptions`, `optionImageMap`, `skuThumbKeys`
- 읽기 (queueData 항목): `categoryId`, `categoryPath`, `displayCategoryCode`, `productNoticeNumber`, `productNoticeItems`

## 주의사항
- CORS 우회: `executeScript world: 'MAIN'` on supplier.coupang.com 탭
- 이미지는 ArrayBuffer → base64 변환 후 executeScript args로 전달 (Blob은 직렬화 불가)
- pre-update가 없으면 업로드 API에서 imagePage 노드 null → 서버 Jackson NPE(500) 발생
- `adCert: ''` 전송 = "있음"으로 표시 → 필드 자체를 전송하지 않아야 "없음"
- 사이즈: 현재 `one size` 고정 (1688 API 전환 후 실제 규격값으로 교체 예정)
