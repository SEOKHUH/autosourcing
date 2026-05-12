## 역할
크롤링 완료 처리 — SCRAPE_DONE 수신 후 번역·이미지 다운로드·대기열 업데이트·워크스페이스 열기

## 주요 함수
- `initScrape({openDetailView})` — 순환 의존 방지용 콜백 주입
- `onScrapeDone(result)` — SW에서 SCRAPE_DONE 수신 시 실행
  1. 상품명·속성 한국어 번역 (Translator)
  2. SKU 옵션명 번역 + `sku_groups_translated` 생성
  3. SKU 썸네일 + 메인 이미지 다운로드 (downloadImagesViaSwitch)
  4. `state.queueData[itemId]` 업데이트 + saveQueue
  5. `openDetailView(itemId)` 호출
- `downloadImagesViaSwitch(urls, keyPrefix)` — SW에 DOWNLOAD_IMAGE 메시지 전송해 IDB 저장

## 상태 의존 (state.js)
- 읽기: `currentItemId`
- 쓰기: `queueData`, `allImages`, `detailImages`, `skuThumbKeys`, `currentScrapeResult`

## 메시지
- 수신: SCRAPE_DONE (messages.js를 통해 콜백으로 전달)
- 송신: DOWNLOAD_IMAGE → service-worker.js

## 주의사항
- 번역은 Translator.translateBatch() 배치 호출 (Google Translate 비공개 API)
- 이미지 다운로드는 SW를 경유해 IDB에 저장 (content script CORS 우회)
