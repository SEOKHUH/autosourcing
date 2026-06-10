## 역할
크롤링 완료 처리 — SCRAPE_DONE 수신 후 번역·이미지 다운로드·대기열 업데이트·워크스페이스 열기

---

## 주요 함수

- `initScrape({openDetailView})` — 순환 의존 방지용 콜백 주입
- `onScrapeDone(result)` — SW에서 SCRAPE_DONE 수신 시 실행
  1. **Gemini API**로 상품명·SKU 옵션명 일괄 번역 (실패 시 Google Translate 폴백)
  2. `sku_groups_translated` 생성 (`isColorDim` 플래그 포함)
  3. 가격 0 감지 → `enqueueRescrape` 호출 (1회 재시도, `_priceRetried` 플래그 확인)
  4. SKU 썸네일 + 메인 이미지 다운로드 (`downloadImagesViaSwitch`)
  5. `state.queueData[itemId]` 업데이트 + `saveQueue`
  6. `openDetailView(itemId)` 호출
- `downloadImagesViaSwitch(urls, keyPrefix)` — SW에 DOWNLOAD_IMAGE 메시지 전송해 IDB 저장

## 번역 전략

| 우선순위 | 방법 | 비고 |
|----------|------|------|
| 1 | Gemini API | 한 번의 API 호출로 전체 번역 (속도·품질 우수) |
| 2 | Google Translate 비공개 API (`Translator`) | Gemini 실패 시 폴백, 항목별 개별 호출 |

## 가격 0 자동 감지
- `skus_translated` 전체 가격이 0 이하이거나 상품 기본 가격이 0이면 priceMissing 처리
- `item._priceRetried` false일 때만 `enqueueRescrape` 호출 → 재크롤 1회 한정
- 재시도 후에도 가격 0이면 대기열에 `⚠️ 가격 없음` 배지 유지

## 상태 의존 (state.js)
- 읽기: `currentItemId`
- 쓰기: `queueData`, `allImages`, `detailImages`, `skuThumbKeys`, `currentScrapeResult`

## 메시지
- 수신: SCRAPE_DONE (messages.js를 통해 콜백으로 전달)
- 송신: DOWNLOAD_IMAGE → service-worker.js

## 주의사항
- 번역 실패 시에도 크롤링 원본 데이터로 워크스페이스 열림 (번역만 누락)
- `sku_groups_translated`의 `isColorDim` 플래그는 Step 2 옵션 카드 렌더링·Step 4 색상 차원 판별에 사용
- 이미지 다운로드는 SW를 경유해 IDB에 저장 (content script CORS 우회)
