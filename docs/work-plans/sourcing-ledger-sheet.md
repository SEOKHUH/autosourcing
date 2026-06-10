# 제안 완료 상품 → 구글 시트 소싱 원장 (Ledger)

> 작성일: 2026-06-05
> 상태: 워크플랜 작성 완료 — 구현 대기 (새 대화에서 진행)
> 재개 방법: 새 대화에서 "sourcing-ledger-sheet.md 읽고 구현 시작해줘"

---

## 배경 (왜 하는가)

사용자(사장님)는 소싱 작업을 **다른 작업자**에게 시킨다. 작업자가 1688 상품을 크롤링 → Step 4에서 쿠팡 서플라이어 허브에 **제안(임시저장)** 하면 항목이 `done`이 된다. 쿠팡 검수 **통과** 시 사장님이 그 상품을 **1688에서 수입**해야 하는데:

1. 1688 URL 등 정보가 **작업자 PC의 대기열/IndexedDB에만** 있어 사장님이 볼 수 없다.
2. `완료 삭제`·`전체 삭제`([queue.js:195](../../extension/ui/modules/queue.js#L195), [queue.js:213](../../extension/ui/modules/queue.js#L213))로 지우면 URL이 소실된다.
3. 사장님은 예전에 **수동 소싱 원장 스프레드시트**(카테고리·상품명·색상·수량·재질·중국원가·한국원가·공급가·판매가·마진 등)를 직접 작성해왔다.

이 데이터는 **Step 4 시점에 익스텐션이 전부 보유**(검증 완료) → 자동 기록 시 수동 이중작업이 사라진다.

**목표:** 제안 완료(`done`) 시 옵션(색상)별 1행으로 **전체 소싱 원장**을 구글 시트에 자동 기록. 모바일 동기화가 쓰는 동일 Apps Script 웹훅 재사용. 사장님은 공유 시트에서 전체 내역 + 1688 주소 확인 → 통과건 수입.

### 사용자 결정사항 (확정)
- **구글 시트만** (작업자 PC 로컬 보관함/탭 안 만듦)
- **전체 원장** 기록 (수동 시트 완전 대체)
- 작업자 구분 열 **불필요**
- 구매수량 열 **제외**
- 현황 열 = **빈칸**(사장님 수동 관리), END ROAS = **수식**
- 기록 시점: 제안 완료(`done`) **즉시 자동**
- 시트 정리: **4가지 모두** (최신순 삽입 / 현황 드롭다운+색상 / 필터보기 가이드 / 수입완료 별도시트 이동)

---

## 시트 스키마 (`ledger` 시트, 옵션별 1행, 1행=헤더 고정)

| 열 | 채우는 방법 |
|---|---|
| 현황 | **빈칸** (사장님 수동: 제안중/통과/반려/수입완료 드롭다운) |
| 1688링크 | `item.url` |
| 상품명 | `f-name` 값 |
| 색상 | 옵션명(색상 차원) |
| 수량 | `f-qty` |
| 중국원가 | 옵션별 `skus_translated[].price` (없으면 `scrape_result.price` 폴백) |
| 공급가 | `price_calculator` |
| 판매가 | `price_calculator` |
| END ROAS | **수식** — 삽입 블록 바로 아래(직전 최신) 행 수식 복사 (사장님이 2행에 1회 정의) |

> 가격은 **옵션별 중국원가 → `PriceCalculator.calculatePrices(yuan, qty)`** 로 행마다 재계산. UI의 f-supply/f-selling 단일값에 의존하지 않음.

---

## 동작

1. Step 4 임시저장 성공([step4.js:317-321](../../extension/ui/modules/step4.js#L317)) `item.status='done'` 직후, 선택 옵션별 행 배열을 만들어 웹훅 `?action=ledger` POST.
2. 옵션 없는 상품(`__default__`): 색상 빈칸 단일 행.
3. **Best-effort + 안전망**: 결과를 `item.submittedToSheet=true/false` 저장. 첫 전송 실패 시 `완료/전체/개별 삭제` 직전 done 항목이 미전송이면 재전송 시도 → 성공해야 삭제, 실패 시 토스트 경고 + 항목 보존(URL 소실 방지).
4. 시트 중복 방지: 같은 `url1688`이 이미 있으면 해당 상품 전체 skip.

---

## 시트 정리/소팅 (리스트 대규모 대비 — 4가지 모두)

1. **최신 제안 맨 위로**: **1행은 헤더(열 제목) 고정**(`setFrozenRows(1)`). `handleLedger`가 append 대신 **헤더 바로 아래 2행에 삽입**(`insertRowsAfter(1, n)` → row 2부터 setValues). 헤더 유지, 최신 데이터만 위로. 같은 상품 옵션 행은 함께 삽입돼 묶임.
2. **현황 드롭다운 + 상태별 색상**: 현황 열 데이터 검증(제안중/통과/반려/수입완료) + 조건부 서식(통과=초록, 반려=빨강, 수입완료=회색 등). `ledger` 시트 생성 시 자동 적용 + 메뉴로 재적용.
3. **필터 보기**: "통과만"/"제안중만" 필터 보기는 구글 시트 기본 기능 → 코드 없이 DEPLOY_GUIDE에 설정법 안내.
4. **수입완료 별도 시트 이동**: 커스텀 메뉴 `소싱 원장 ▸ 수입완료 보관` 실행 시 현황='수입완료' 행을 `완료(보관)` 시트로 이동 → 활성 `ledger` 시트 가볍게 유지.

---

## 변경 파일

### 1. `docs/google-apps-script/Code.gs`
- `getSheetByNameOrCreate(name, headers)` 헬퍼로 일반화(기존 `sourcing` 동작 보존).
- `doPost`에 `action === 'ledger'` 분기 → `handleLedger(body)`.
- `handleLedger(body)`: `body.url1688` 필수 검증 → `ledger` 시트 url1688 중복 체크 후 **2행에 삽입**(최신순). END ROAS 셀은 삽입 블록 바로 아래(직전 최신) 데이터 행의 수식 복사(없으면 빈칸). 현황 빈칸 유지. `handleAdd`([Code.gs:92](../google-apps-script/Code.gs#L92)) 패턴 참고.
- `ensureLedgerSheet()`: `ledger` 시트 생성/초기화 시 헤더·헤더고정(`setFrozenRows(1)`)·현황 데이터검증 드롭다운·조건부 서식 적용.
- `onOpen()`: 커스텀 메뉴 `소싱 원장` 추가 — `[수입완료 보관]`(`moveCompletedRows`), `[시트 서식 재적용]`(`ensureLedgerSheet`).
- `moveCompletedRows()`: ledger에서 현황='수입완료' 행을 `완료(보관)` 시트로 이동(append 후 원본 삭제, 아래→위 순회로 인덱스 안전).

### 2. `extension/ui/modules/mobile-sync.js`
- 신규 export `pushLedgerToSheet({ url1688, rows })`:
  - `mobileSyncSettings.webhookUrl` 없으면 `{ok:false, noWebhook:true}`.
  - `fetch(webhookUrl?action=ledger, {method:'POST', body: JSON.stringify({url1688, rows})})`, 짧은 재시도(translator 패턴 참고), `appendGlobalLog`로 결과 표시, `{ok}` 반환.

### 3. `extension/ui/modules/step4.js`
- `import { PriceCalculator } from './price_calculator.js'`, `import { pushLedgerToSheet } from './mobile-sync.js'` 추가.
- **행 빌더** `export function buildLedgerRows(item)`: `colorOptions`(없으면 단일) 순회하며 위 스키마대로 행 객체 배열 생성. 옵션별 중국원가는 `skus_translated`에서 매칭, 폴백 `scrape_result.price`. 각 행 `PriceCalculator.calculatePrices(yuan, qtyNum)`로 공급가/판매가 산출. 공통값(상품명·수량)은 `item.progress`에서, 데이터는 `item.scrape_result`에서 재사용.
  - ⚠️ `colorOptions` 판별 로직은 기존 [step4.js:30-42](../../extension/ui/modules/step4.js#L30) 재사용.
- `done` 직후([step4.js:319](../../extension/ui/modules/step4.js#L319)) `buildLedgerRows(item)` → `pushLedgerToSheet({ url1688: item.url, rows })` → `item.submittedToSheet = res.ok`, `saveQueue()`.

### 4. `extension/ui/modules/queue.js`
- 안전망: `deleteItem`/`clearDoneItems`/`clearAllItems`에서 done 항목 제거 직전 `submittedToSheet!==true`면 `buildLedgerRows`+`pushLedgerToSheet` 재전송(await). 성공 시 삭제, 실패 시 `showToast` 경고 + 삭제 스킵.
  - import: `buildLedgerRows`(step4.js), `pushLedgerToSheet`(mobile-sync.js). 순환 의존 주의 — 필요 시 빌더를 별도 모듈로 분리 검토.

### 5. 문서
- `docs/google-apps-script/DEPLOY_GUIDE.md`: ① Apps Script **새 버전 재배포**(웹훅 URL 유지), ② 사장님 셋업 — `ledger` 시트 2행 END ROAS에 본인 수식 1회 입력, ③ **필터 보기** 설정법, ④ 메뉴 사용법(`소싱 원장 ▸ 수입완료 보관`), ⑤ 사용 흐름(헤더 1행 고정·최신순·현황 색상으로 통과건 찾아 url1688로 수입).
- 구현 완료 후 `docs/SESSION.md`, `docs/CHANGELOG.md` 갱신.

---

## 검증 방법

1. `Code.gs`에 `handleLedger` 추가 후 **새 버전 재배포**(같은 웹훅 URL 확인). `ledger` 시트 1행=헤더 고정, 현황 드롭다운·조건부 서식 적용 확인. 2행 END ROAS에 본인 수식 입력.
2. 익스텐션 리로드 → 색상 여러 개인 1688 상품 크롤링 → Step 1~4 → 임시저장 성공.
3. `ledger` 시트 **헤더 아래 2행부터 최신순**으로 선택 색상 수만큼 행 추가 + 각 행 데이터(카테고리·상품명·색상·수량·재질·중국원가·한국원가·공급가·판매가·마진) 정확, END ROAS 수식 자동 채움 확인. 전역 로그 전송 성공.
4. 두 번째 상품 제안 → 이전 상품보다 위(2행)에 삽입(최신순) 확인.
5. 옵션 없는 상품 → 색상 빈칸 단일 행 확인.
6. 같은 상품 재제안 → 중복 행 안 생김(skip) 확인.
7. 현황 '수입완료' 변경 후 `소싱 원장 ▸ 수입완료 보관` 실행 → 행이 `완료(보관)` 시트로 이동, ledger에서 사라짐 확인.
8. 대기열 `완료 삭제` → 작업자 PC에선 사라지되 시트엔 남아있음 확인.
9. (안전망) 웹훅 URL 비운 채 done → 삭제 시도 → "시트 전송 실패, 항목 보존" 경고 + 항목 유지 확인.

---

## 미포함 (추후)
- 작업자 구분 열, 쿠팡 검수 상태 자동화(현재 현황 열 수동).

---

## 참고: Step 4에서 보유한 데이터 (검증 완료)

| 시트 열 | 데이터 출처 |
|---|---|
| 1688링크 | `item.url` |
| 상품명 | `item.progress.name` |
| 색상/옵션 | `colorOptions`/`selectedOptions` ([step4.js:30-42](../../extension/ui/modules/step4.js#L30)) |
| 수량 | `item.progress.qty` |
| 중국원가(위안) | `item.scrape_result.skus_translated[].price` (옵션별), 폴백 `item.scrape_result.price` |
| 공급가·판매가 | `PriceCalculator.calculatePrices` ([price_calculator.js](../../extension/ui/modules/price_calculator.js)) |
