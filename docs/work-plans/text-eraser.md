# 상세페이지 이미지 중국어 텍스트 제거 기능

> 작성일: 2026-05-28  
> 상태: 계획 승인됨, 구현 대기

## 배경

쿠팡 상품 등록 시 상세페이지 이미지에 중국어가 남아있으면 안 됨. 현재 Step 2에서 1688 상세이미지를 드래그 크롭한 뒤 Step 3에서 상세페이지 이미지로 합쳐지는데, 크롭된 이미지에 포함된 중국어 텍스트를 제거할 방법이 필요함.

## 채택 방식

**D안: OCR 자동 감지 + 박스 수정 + 자동 채우기**
- Tesseract.js로 중국어 텍스트 영역 자동 감지 → 사용자 확인/수정 → 적응형 인페인팅으로 채움
- 외부 API 비용 없음, 익스텐션 내부 처리 (Tesseract.js + WASM)
- 그라데이션 배경 대응 인페인팅

### 검토된 대안

| 안 | 방식 | 채택 여부 |
|----|------|-----------|
| A | 수동 지우개(브러시) | ✕ 수작업 부담 큼 |
| B | AI 외부 API (Cloud Vision + Inpainting) | ✕ 비용 발생, MV3 환경 복잡 |
| C | 박스 드래그 + 자동 채우기 | △ D안에 포함됨 |
| **D** | **OCR 자동 감지 + 박스 수정 + 자동 채우기** | **✓ 채택** |
| E | 번역 한국어 오버레이 | ✕ 구현 복잡, 향후 검토 |
| F | 누끼 따기 + 새 배경 | ✕ 정보성 컷 손실 |
| G | 1688 갤러리 이미지로 우회 | ✕ 정보성 컷 손실 |

---

## 사용자 흐름

1. **Step 2**: 기존처럼 상세이미지 드래그 크롭
2. 크롭된 카드(`#cropped-list`)에 **"텍스트 제거"** 고스트 버튼 추가
3. 버튼 클릭 → 텍스트 제거 모달(에디터) 오픈
4. 상단 툴바: `🔍 자동 감지` / `👁 미리보기 토글` / `↩ 되돌리기` / `✓ 적용` / `✕ 취소`
5. 캔버스 인터랙션 (No-Mode, ✕ 버튼 명시 방식)
   - **빈 공간 드래그** → 새 박스 생성 (최소 8x8 미만 무시)
   - **박스 호버** → 우상단에 ✕ 버튼 표시
   - **✕ 버튼 클릭만 박스 삭제** (박스 내부 클릭은 무시 — 오작동 방지)
6. "🔍 자동 감지" → Tesseract OCR → 감지된 단어 박스 → 줄 단위로 자동 병합
7. "👁 미리보기 토글" → 박스 상태 ↔ 인페인팅 적용 결과 비교
8. "✓ 적용" → 인페인팅 확정 → 새 dataURL로 `state.croppedImages` 교체 → IDB 갱신
9. Step 3 진입 시 텍스트 제거된 이미지로 상세페이지 생성

---

## 구현 항목

### 1. MV3 호환 — Tesseract.js + WASM 로컬 번들

**파일 배치** (5종 — `.wasm` 바이너리 누락 주의):
```
extension/vendor/
  tesseract.min.js                  # 메인 라이브러리
  tesseract-worker.min.js           # Web Worker 스크립트
  tesseract-core-lstm.wasm.js       # WASM 로더 (JS glue)
  tesseract-core-lstm.wasm          # ⭐ WASM 바이너리 본체 (누락 시 OCR 실패)
  tessdata/
    chi_sim.traineddata.gz          # 중국어 학습 데이터 (~7MB)
```

**manifest.json**:
- `content_security_policy.extension_pages`의 `script-src`에 `'wasm-unsafe-eval'` 추가
- `web_accessible_resources`에 `vendor/*`, `vendor/tessdata/*` 명시

**index.html**:
- `<script src="vendor/tesseract.min.js"></script>` 추가

### 2. 싱글톤 OCR 워커

**파일**: `extension/ui/modules/ocr-worker.js` (신규)
- `getOcrWorker()` — 최초 호출 시 1회만 워커 생성, 이후 캐싱 인스턴스 반환
- 모달 첫 진입 시점에 lazy 초기화
- 워커 옵션: `workerPath`, `corePath`, `langPath` 모두 `chrome.runtime.getURL` 사용
- ⭐ **`workerBlobURL: false`** 필수 — MV3 CSP가 blob: URL 차단하므로 직접 워커 파일 사용

### 3. 텍스트 제거 모달 + 캔버스 인터랙션

**파일**: `extension/ui/modules/step2-text-eraser.js` (신규)
- `openTextEraserModal(croppedIndex)` — 이미지를 캔버스에 그리고 모달 표시
- 상태: `boxes`, `history`(undo 스택), `hoverIdx`, `dragStart`, `previewMode`

**핵심 디테일**:
- **좌표 보정 (Scale Ratio)**: CSS 크기와 캔버스 내부 해상도가 다를 때 마우스 좌표 어긋남 방지
  ```js
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  ```
- **박스 병합 `mergeNearbyBoxes(boxes)`**: Tesseract가 단어 단위로 잘게 쪼개서 반환하므로 한 줄로 자동 병합
  - 병합 조건: y축 중심 차이 ≤ 평균 높이 × 0.5, x축 간격 ≤ 평균 높이 × 1.5
  - 더 이상 병합할 박스가 없을 때까지 반복
- **Undo 스택**: 박스 추가/삭제 직전 `history.push(JSON.parse(JSON.stringify(boxes)))`

### 4. 적응형 인페인팅

**파일**: `extension/ui/modules/inpaint.js` (신규)
- `fillBox(ctx, box, sampleWidth=2)`

**알고리즘**:
1. 박스 외곽 1~2px 경계에서 상/하/좌/우 픽셀 샘플링
2. **경계 Clamping 필수**: 박스가 이미지 가장자리에 있을 때 좌표가 0 미만 / 캔버스 초과 시 클램핑
3. 상하 색상 차이(`diffV`) vs 좌우 색상 차이(`diffH`) 계산
4. 분기:
   - `max(diffV, diffH) < 임계값(~20)` → 단색 평균색 채우기
   - `diffV ≥ diffH` → 세로 그라데이션 (top→bottom)
   - 그 외 → 가로 그라데이션 (left→right)

### 5. Step 2 크롭 카드 연동

**파일**: `extension/ui/modules/step2-cropper.js` (수정)
- `addCroppedImage(dataUrl)` 내 카드 DOM 생성 시 "텍스트 제거" 고스트 버튼 추가
- 모달 콜백 →
  - `state.croppedImages[index]` 교체
  - IDB 갱신 (`crop_*` 키)
  - 카드 썸네일 새로고침
  - `saveProgress()` 호출

### 6. 프리미엄 모달 디자인

**파일**: `extension/ui/index.html`, `extension/ui/index.css` (수정)
- `.text-eraser-backdrop`: `rgba(0,0,0,0.4)` + `backdrop-filter: blur(4px)` (글래스모피즘)
- `.text-eraser-modal`: 흰 배경, `border-radius: 12px`, 부드러운 그림자
- `.text-eraser-canvas-wrap`: 다크 그레이 배경(`#2a2d35`) — 이미지 경계 강조
- `.text-eraser-toolbar`: 상단 고정 툴바, 기존 `btn-ghost` 재사용
- 박스 표시: 빨간 실선 1.5px(`#ef4444`), 호버 시 점선 + 우상단 ✕ 버튼

---

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `extension/manifest.json` | CSP `'wasm-unsafe-eval'`, `web_accessible_resources`에 `vendor/tessdata/*` 추가 |
| `extension/vendor/tesseract.min.js` | 신규 |
| `extension/vendor/tesseract-worker.min.js` | 신규 |
| `extension/vendor/tesseract-core-lstm.wasm.js` | 신규 |
| `extension/vendor/tesseract-core-lstm.wasm` | 신규 ⭐ |
| `extension/vendor/tessdata/chi_sim.traineddata.gz` | 신규 (~7MB) |
| `extension/ui/modules/ocr-worker.js` | 신규 |
| `extension/ui/modules/step2-text-eraser.js` | 신규 |
| `extension/ui/modules/inpaint.js` | 신규 |
| `extension/ui/modules/step2-cropper.js` | "텍스트 제거" 버튼 + 결과 반영 |
| `extension/ui/index.html` | 모달 DOM, vendor script 태그 |
| `extension/ui/index.css` | 모달/캔버스/툴바/박스 스타일 |

---

## 성능 예상치 (추측)

- 첫 OCR 호출(워커 초기화 + 모델 로드): 5~10초
- 2번째 이후 OCR: 1~3초/장 (워커 캐싱)
- 박스 인페인팅: < 0.1초
- 단어 박스 병합: < 0.01초
- 상세페이지 3~5장 처리: 첫 사용 ~30초, 이후 ~10초

---

## 구현 함정 체크리스트

- [ ] `tesseract-core-lstm.wasm` 바이너리 — `.wasm.js`만 받지 말고 `.wasm`도 함께
- [ ] `workerBlobURL: false` — MV3 CSP에서 blob: URL 금지
- [ ] CSP `'wasm-unsafe-eval'` 추가 — WASM 컴파일 필수
- [ ] `web_accessible_resources`에 `vendor/tessdata/*` 명시
- [ ] 캔버스 좌표 보정 (Scale Ratio)
- [ ] 단어 박스 → 줄 단위 자동 병합
- [ ] 픽셀 샘플링 Clamping (이미지 가장자리)
- [ ] history 스택 push (undo)
- [ ] dataURL 교체 시 IDB 동기화
- [ ] `saveProgress()` 호출 (새로고침 시 결과 유지)

---

## 검증 방법

1. 익스텐션 리로드 → 1688 상품 크롤링
2. Step 2에서 중국어 텍스트가 포함된 영역 크롭
3. 크롭 카드의 "텍스트 제거" 버튼 클릭 → 모달 표시 확인
4. "자동 감지" → 한 줄 텍스트가 1개 박스로 병합되어 표시되는지 확인
5. 빈 공간 드래그로 박스 추가, 호버 시 ✕ 버튼 노출 → ✕ 클릭으로만 삭제되는지 확인
6. 박스 내부 클릭해도 박스가 생성/삭제되지 않는지 확인 (오작동 방지)
7. "되돌리기" → 직전 상태로 복원되는지 확인
8. "미리보기 토글" → 박스 표시 ↔ 인페인팅 결과 비교 동작 확인
9. "적용" 결과 확인:
   - 흰 배경: 단색 모드 — 깔끔
   - 그라데이션 배경: 자연스럽게 이어짐
   - 이미지 가장자리에 닿은 박스도 에러 없이 채워짐
10. 모달 닫은 뒤 크롭 카드 썸네일 갱신 확인
11. Step 3 → 상세페이지 이미지에서 중국어 사라졌는지 확인
12. 워크스페이스 재오픈 → 결과 유지 확인 (`saveProgress`)
13. 두 번째 모달 진입 시 OCR 속도 향상 (싱글톤 워커) 확인
14. DevTools Console에서 CSP / WASM 에러 없음 확인

---

## 향후 개선 (현 작업 범위 밖)

- 더 정교한 인페인팅 (Content-Aware Fill, Patch Match)
- 한국어 텍스트 오버레이 (번역본 덮어쓰기)
- 다국어 OCR (영어, 일본어)
- OCR 결과 캐싱 (이미지 해시 기반)
- 박스 이동/리사이즈 (현재는 추가/삭제만)
