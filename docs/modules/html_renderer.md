## 역할
HTML 템플릿 + html2canvas 기반 라벨·상세페이지 이미지 생성

---

## 주요 함수

- `HtmlRenderer.renderLabel({ productName, color, material, quantity })` — 라벨 이미지 생성
  1. `static/label/index.html` 템플릿 fetch
  2. 숨겨진 iframe에 로드 후 필드 값 주입
  3. html2canvas로 캡처 → dataURL 반환
- `HtmlRenderer.renderDetailPage({ images, productName })` — 상세페이지 이미지 생성
  1. `static/detail_page/index.html` 템플릿 fetch
  2. 이미지 슬롯에 ArrayBuffer → base64 dataURL 변환 후 주입
  3. html2canvas로 캡처 → dataURL 반환

## 내부 헬퍼

- `createHiddenIframe()` — 화면 밖 1200px 너비 iframe 생성 (렌더링 전용)
- `loadIframe(iframe, html)` — srcdoc 주입 후 onload 대기
- `captureElement(iframeDoc, selector, options)` — html2canvas 캡처
  - `fonts.ready` + 400ms 딜레이 후 캡처 (폰트 로드 완료 보장)
  - `useCORS: false, allowTaint: true, foreignObjectRendering: true`
- `arrayBufferToDataUrl(buffer, mimeType)` — ArrayBuffer → base64 dataURL
- `injectImageSlot(doc, selector, buffer)` — iframe 내 이미지 슬롯에 이미지 주입

## 라벨 자동 입력 필드
| 필드 | 소스 |
|------|------|
| 상품명 | `f-name` |
| 색상(옵션) | 선택된 색상 옵션명 |
| 재질 | `f-material` |
| 수량 | `f-qty` |

## 고정 필드 (템플릿 하드코딩)
- 제조국: 중국 (Made in China)
- 소비자 상담실: 1577-7011
- 제조자: 헤오르 협력사
- 수입자: 헤오르

## 주의사항
- `html2canvas`는 `vendor/html2canvas.min.js`에서 전역 로드 → `window.html2canvas`로 접근 (ES 모듈 아님)
- iframe 렌더링 후 캡처 완료 시 iframe 제거 (`remove()`)
- MV3 CSP: 외부 CDN 스크립트 로드 불가 → html2canvas 로컬 번들 사용
- 상세페이지 이미지는 crop 결과 우선, 없으면 `getImagesForGeneration`으로 자동 선택 (step3.js)
