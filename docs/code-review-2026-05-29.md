# 전체 검토서 — 헤오르 AutoSourcing

> 작성일: 2026-05-29
> 범위: 프로그램 구조 / 코드 품질 / 데이터 관리 / 보안 / UI·UX / 동시성·안정성 / 운영
> 방법: 전체 모듈 정독 (UI 17모듈 + content scripts + service worker + manifest + 문서)

---

## 총평

전반적으로 **개인/소규모 운영용 익스텐션으로는 잘 짜인 코드베이스**다. ES 모듈 분리가 깔끔하고, 콜백 주입으로 순환 의존을 회피하는 패턴이 일관되며, 문서화(SESSION/CHANGELOG/MODULES/work-plans) 수준이 높다. 다만 **장기 운영 관점의 누수·보안·정합성 이슈** 몇 가지가 누적돼 있어 정리가 필요하다.

점수 감각(주관): 구조 B+ / 코드품질 B / 데이터관리 C+ / 보안 C / UI·UX B+ / 테스트 F

---

## 🔴 높은 우선순위

### 1. ✅ IndexedDB 이미지 누수 (저장공간 무한 증가) — 완료
- `deleteItem` / `clearDoneItems` / `clearAllItems` 호출 시 IDB 이미지 삭제 추가. prefix 매칭 버그(`itemId_` → `main_${itemId}_` 등 실제 prefix) 함께 수정.
- CHANGELOG: 2026-05-29

### 2. ✅ adCert 문서-코드 불일치 (법적 증빙 "있음" 오표시) — 완료
- `adCert: ''` 전송 제거 → 필드 자체 absent로 전송. 서플라이어 허브에서 "없음"으로 정상 표시 확인.
- CHANGELOG: step4.js `adCert: ''` 완전 제거

### 3. ✅ 하드코딩된 Gemini API 키 — 완료
- `service-worker.js`에서 평문 키 제거 → `chrome.storage`의 `geminiApiKey` 읽어오는 방식으로 전환. 설정 모달(⚙)에서 입력.

---

## 🟡 중간 우선순위

### 4. 전역 단일 상태 의존 (구조적 제약)
- `state.currentItemId` / `currentModalItemId` 등 전역 하나에 의존 ([state.js](../extension/ui/modules/state.js)).
- 이번 "동시 크롤링 시 데이터 섞임" 버그의 근본 원인이었고, `itemId` 스레딩 + 순차 처리로 크롤링은 해소됨. 다만 **워크스페이스(상세뷰)는 여전히 `currentModalItemId` 단일 기반**이라 한 번에 한 상품만 편집 가능 — 구조적 제약으로 남음.
- **권장**: 당장 바꿀 필요는 없으나, 향후 "여러 상품 동시 검수"가 필요해지면 상태를 itemId 키 기반 맵으로 재설계해야 함.

### 5. ✅ MutationObserver 성능 — 완료
- `_mutTimer` + `setTimeout(100ms)` 디바운스 이미 적용되어 있음 ([coupang_search.js:505-516](../extension/content_scripts/coupang_search.js#L505)).

### 6. 에러 처리 침묵
- 빈 `catch {}` 6곳. 번역 실패 → 원본 중국어 그대로, 이미지 다운로드 실패 → 빈 배열 폴백인데 **사용자에게 명확한 경고가 약함**.
- **영향**: 데이터 누락(번역 안 됨/이미지 빠짐)이 조용히 통과해 Step 4까지 갈 수 있음.
- **수정 방향**: 실패 건수를 집계해 글로벌 로그/토스트로 요약 표시.

### 7. ✅ 모바일 동기화 안정성 — 완료
- 데이터 추출 우선순위: JSON-LD 1순위 → dataLayer 폴백으로 개선.
- 실패 시 `candidates.js`에 "↺ 재시도" 버튼 구현 완료.

### 8. ✅ 가격 계산 정책 — 정상 동작 확인
- `calculateFromSkus`(최고가 기준)는 초기 로딩 시 전체 SKU 기본값 산정용.
- 옵션 선택 후엔 `step1-form.js`에서 선택된 옵션 가격 기준으로 재계산 — 의도대로 동작.

---

## 🟢 낮은 우선순위 / 운영

### 9. 테스트 전무
- 가격계산·상품명 정제(`cleanProductName`)·카테고리/XLSX 파싱 등 **순수 함수조차 단위테스트 없음**. 셀렉터·API 변경 회귀를 감지할 안전망이 없다.
- **권장**: 최소한 순수 함수(price_calculator, translator.cleanProductName)부터 가벼운 테스트 도입.

### 10. 매직 넘버 하드코딩
- [step4.js](../extension/ui/modules/step4.js)에 `version:164`, `productNoticeNum:38`, `totalSKUsInBox:30`, `skuUnitBoxWeight:'500'`, `skuUnitBoxDimension:'150*300*400'`, `daysToExpiration:365` 등이 흩어짐. 상단 상수 블록으로 모으면 유지보수↑.

### 11. DOM 셀렉터 취약성
- 1688/쿠팡 부분일치 셀렉터 다수. 사이트 개편 시 깨짐(알려진 제한). 폴백 체인은 있으나, 깨짐 감지 로그/알림이 있으면 대응이 빠름.

### 12. 디버그 로그 노출
- `service-worker.js`·`supplier_hub.js`에 `console.log` 잔존. `SCRAPE_LOG`의 `[Plan A]` 디버그 메시지가 사용자 글로벌 로그에 다수 노출됨 → 일반 사용 시 노이즈.

### 13. window.open/이동 동작 혼재
- 후보 카드 클릭은 같은 탭 이동으로 통일했으나, "1688 보기"·배너 등은 새 탭(`_blank`) 혼재. 의도 확인 후 정책 통일 권장.

---

## ✅ 강점 (유지할 것)

- **모듈 구조**: 17개 ES 모듈로 책임 분리, `init*({ ... })` 콜백 주입으로 순환 의존 회피 — 일관되고 읽기 쉬움.
- **CORS 우회 설계**: `executeScript(world:'MAIN')`로 쿠팡/1688 인증 컨텍스트 재사용 — 영리하고 일관적.
- **진행상황 저장/복원**: `queueData[id].progress` 자동 저장·디바운스·복원이 견고. 대용량 이미지는 IDB로 분리(스토리지 한도 회피) 적절.
- **문서화**: SESSION/CHANGELOG/MODULES/work-plans 체계가 잘 잡혀 있어 맥락 복원이 쉬움.
- **최근 동시성 수정**: itemId 파이프라인 + 순차 크롤링 + 고아 후보 정리로 정합성이 크게 개선됨.
- **UI 디테일**: 배너/카드 디자인 통일, 로그바 FAB 알림점, 트랙패드 가로스크롤 대응 등 사용성 배려.

---

## 권장 처리 순서

1. **#1 IDB 누수** (저장공간 폭발 방지 — 실사용 영향 가장 큼)
2. **#2 adCert 검증** (법적 표시 오류 — 등록 품질 직결)
3. **#3 API 키 분리** (보안)
4. #5 옵저버 디바운스, #6 에러 요약 (안정성·체감 품질)
5. #9 순수 함수 테스트, #10 상수화 (장기 유지보수)

> 본 검토서는 정적 분석 기반이다. #2(adCert)는 실제 서플라이어 허브 API 응답으로 검증 후 확정할 것.
