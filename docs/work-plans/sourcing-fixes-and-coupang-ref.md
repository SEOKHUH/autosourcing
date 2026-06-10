# 소싱 워크플로우 수정 3종 + 쿠팡 원본 참고 카드

> 작성: 2026-06-07 / 상태: **구현 대기** (새 대화에서 시작)
> 재개 방법: 새 대화에서 "sourcing-fixes-and-coupang-ref.md 읽고 구현 시작해줘"

## 배경 (사용자 요청 원문 요약)
- 크롤링 버튼을 여러 개 눌러두고 완료된 것부터 순차 작업하는데, 이때 **가격을 0으로 못 잡아오는** 경우가 있음. 단독 테스트하면 잘 됨.
- 순차 작업 시 **카테고리 조회 오류**가 자주 발생.
- 이전 상품에서 입력한 **소싱 갯수가 다음 상품에 그대로 남아있음** (기본값은 1개여야 함).
- 사용자의 소싱 방식 = **쿠팡에서 실제 판매 중인 상품의 옵션·갯수 구성을 그대로 모방**. 그런데 1688 크롤링이 끝나면 모방 대상(쿠팡 원본)이 화면에 안 보여서 번거로움.

## 사전 조사로 확정된 사실 (구현 전 반드시 인지)
1. **크롤러는 이미 순차 처리.** `queue.js`의 `pumpCrawl`이 `_activeItemId` 가드로 한 번에 하나씩만 `SCRAPE_REQUEST` 전송. → "동시 실행" 때문이 아님. 연속 요청에 대한 1688 서버측 레이트리밋/봇 의심이 더 유력한 가설(서버측이라 확정 불가).
2. 이전 가격=0의 직접 원인이었던 **f-yuan 미저장 버그는 이미 수정됨**(2026-06-07). 이번 작업은 "그래도 0이 들어오면 방어"하는 안전장치.
3. **쿠팡 원본 정보는 후보 객체(`state.sourcingCandidates`)에만 있고 큐 항목으로 복사되지 않음.** `addToQueueFromCandidate`([queue.js:133-148])가 `coupangUrl`을 큐 항목에 안 넘김. 게다가 `done` 시 후보가 삭제되므로(`releaseCandidate(... remove:true)`), 워크스페이스에서 계속 보이려면 **큐 항목에 직접 복사**해둬야 함.
4. **쿠팡 옵션은 상품 상세 페이지에서만 안정적으로 추출 가능.** 모바일 동기화/재시도는 `extractCoupangData`가 백그라운드 탭으로 상세페이지를 열기 때문에 거기서 추출 가능. 쿠팡 **검색 결과 배너**로 추가한 후보는 상세페이지를 안 열어 옵션이 없을 수 있음 → 그 경우 링크만 표시(1단계로 자연 강등).

---

## 작업 항목

### ① [수정] 소싱 갯수 누수 — 가장 간단, 리스크 0
**증상:** 이전 상품의 `f-qty` 값이 다음 상품에 남음.
**원인:** `fillStep1`([step1-form.js:9-50])이 `f-qty`를 건드리지 않음. `restoreProgress`([workspace.js:229])는 `p.qty`가 있을 때만 채움. → 진행 이력 없는 새 상품은 이전 DOM 값 유지.
**수정:**
- `extension/ui/modules/step1-form.js` `fillStep1` 시작부에 `$('f-qty').value = '1개';` 추가.
- 저장된 진행이 있으면 이후 `restoreProgress`가 덮어쓰므로 정상 동작.
- 기본값 `'1개'`는 [index.html:170]에서 확인됨.

### ② [수정] 가격 0 자동 감지 + 1회 자동 재시도 + 배지
**목표:** 가격이 0인 채로 시트에 기록되는 일을 원천 차단.
**수정:**
- `extension/ui/modules/scrape.js` `onScrapeDone`:
  - 스크랩 결과 가격 존재 여부 판정: `(result.skus||[])` 중 `price>0`가 하나라도 있거나 `parseFloat(result.price_min)>0` 이면 "가격 있음".
  - **가격 없음 + 아직 재시도 안 함**(`item._priceRetried` 미설정): `item._priceRetried = true` 세팅, 상태 `scraping` 복귀, **자동 1회 재크롤** 트리거.
  - **가격 없음 + 이미 재시도함**: 상태는 정상대로 `review`, 단 `item.priceMissing = true` 플래그 설정.
  - 가격 있으면 `item.priceMissing` 해제.
- `extension/ui/modules/queue.js`:
  - 자동 재크롤 진입용 함수 추가 (예: `rescrapeForPrice(itemId, url)`) — `_crawlQueue`에 push + `pumpCrawl()`. ※ 기존 `scheduleCrawl`의 `_activeItemId===itemId` 중복가드 때문에 재진입이 막히므로, 이 함수는 가드를 우회하거나 `crawlSettled`(finally) 이후 실행되도록 설계. (가장 안전한 방식: `onScrapeDone`에서 push만 하고, finally의 `crawlSettled`→`pumpCrawl`이 집어가게 함.)
  - `renderQueue`: `item.priceMissing`이면 카드에 **"⚠️ 가격 확인" 배지** 표시(빨강 아님 — 경고색). 클릭 시 재크롤 가능하도록 기존 재크롤 버튼 노출 조건에 포함.
**주의:** 무한 재시도 방지를 위해 `_priceRetried`로 정확히 1회만.

### ③ [수정] 크롤 간 텀(throttle) — ②의 보조
**목표:** 연속 크롤로 인한 1688 레이트리밋 완화.
**수정:**
- `extension/ui/modules/queue.js` `crawlSettled`: 마지막 `pumpCrawl()` 호출을 `setTimeout(pumpCrawl, 1800)`으로 변경(약 1.8초 텀). 상수로 빼두면 조정 쉬움.
- ②의 자동 재시도와 결합되면 재시도 간에도 자연스럽게 텀이 생김.

### ④ [수정] 카테고리 조회 자동 재시도
**목표:** 일시적 실패(레이트리밋/네트워크) 자동 흡수.
**수정:**
- `extension/ui/modules/step1-category.js` `fetchCategory`: `fetch` 호출을 최대 2회 재시도(1초 텀)로 감쌈. `fetchCategory`는 수동 조회 + 워크스페이스 자동 조회(`_fetchCategory()`) 양쪽에서 쓰이므로 한 곳 수정으로 둘 다 커버.
**미해결/주의:**
- **근본 원인은 실제 alert 문구 확보 후 확정 권장.** [step1-category.js:42] `alert('카테고리 조회 오류: ' + e.message)`:
  - `서버 응답 오류: 401/403` → 쿠팡 세션 만료
  - `서버 응답 오류: 429` → 레이트리밋(②③과 동일 원인)
  - 그 외 → 네트워크/탭 문제
- 다음에 오류 발생 시 그 문구를 받아 추가 처방.

### ⑤ [보완] 쿠팡 원본 옵션·갯수 참고 카드 (2단계 깊이)
**목표:** 워크스페이스에서 모방 대상 쿠팡 원본(썸네일·상품명·옵션명·링크)을 항상 볼 수 있게.
**수정:**
- `extension/ui/modules/mobile-sync.js` `extractCoupangData`의 MAIN-world 함수:
  - **쿠팡 옵션명 추출 추가** → `coupangOptions: [...]` 반환. 셀렉터 기반 best-effort(브리틀할 수 있음). 추출 실패 시 빈 배열(=링크만 표시, 1단계로 자연 강등).
  - 추출 위치 후보: 옵션 버튼/드롭다운 DOM, 또는 페이지 내 구조화 데이터(JSON). 1688 셀렉터처럼 깨질 수 있음을 주석으로 명시.
- 후보 객체에 `coupangOptions` 저장:
  - `mobile-sync.js` `syncFromSheet`의 candidate 생성부([:173-184])
  - `candidates.js` 재시도 버튼 핸들러([:70-78])
  - (선택) `coupang_search.js` 상세페이지 배너 후보([:563-571])에도 옵션 추출 추가 가능. 검색결과 배너([:395-403])는 상세페이지 미오픈이라 생략.
- `extension/ui/modules/queue.js` `addToQueueFromCandidate`([:133-148]): 큐 항목에 `coupangUrl`, `coupangOptions` 복사. (done 후 후보 삭제돼도 워크스페이스에서 유지)
- `extension/ui/index.html`: Step 1(`#sec-step1`) 상단에 **"📌 쿠팡 원본" 참고 카드** DOM 추가 — 썸네일 + 상품명 + 옵션명 나열 + "쿠팡에서 보기" 링크(`target=_blank`).
- `extension/ui/modules/workspace.js` `openDetailView`: 카드를 `item`의 `coupangUrl`/`coupangOptions`/`thumb`/`title_kr`로 채움. 데이터 없으면 카드 숨김(`hidden`).
- `extension/ui/index.css`: 참고 카드 스타일(1688 링크 버튼/기존 카드 톤과 통일, 스카이블루 액션컬러).

---

## 권장 작업 순서
1. ① 갯수 누수 (1줄, 즉시 검증 가능)
2. ② 가격 0 감지/재시도 + ③ throttle (같이 queue.js·scrape.js 건드리므로 묶어서)
3. ④ 카테고리 재시도
4. ⑤ 쿠팡 원본 카드 (가장 큼, 여러 파일)

## 검증 방법
- ①: 상품 A에서 갯수 "3개"로 바꾸고 → 상품 B 열기 → "1개"로 떠야 함.
- ②: 가격 안 잡히던 상품 재현 → 자동 1회 재크롤 후에도 0이면 "⚠️ 가격 확인" 배지 확인. 0이 시트에 안 들어가는지 확인.
- ③: 여러 개 동시에 크롤 걸고 사이에 텀이 생기는지 로그로 확인.
- ④: 카테고리 조회 일시 실패 시 자동 재시도되는지. (실제 오류 문구도 함께 수집)
- ⑤: 모바일/배너 후보로 추가 → 워크스페이스 열면 쿠팡 원본 카드(썸네일·상품명·옵션·링크) 표시. URL 직접추가 항목은 카드 숨김.

## 완료 후
- `docs/SESSION.md`, `docs/CHANGELOG.md` 업데이트.
- 익스텐션 리로드 필요(작업자 배포) 안내.
