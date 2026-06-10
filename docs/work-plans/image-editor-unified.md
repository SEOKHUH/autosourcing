# 이미지 편집 통합 모달 (크롭 + 텍스트 제거)

> 작성일: 2026-05-28  
> 상태: 구현 중

## 배경

썸네일 편집 기능으로 "크롭" / "텍스트 제거" 두 개의 독립 모달을 구현했으나, 실사용 시나리오에서 두 작업을 모두 해야 하는 경우(1688 메인 이미지 여백 정리 + 중국어 워터마크 제거)가 많아, 한 번의 작업으로 처리할 수 없는 불편함이 있었다.

**목표**: 한 모달 안에서 크롭과 텍스트 제거를 순차적으로 수행하고, 최종 적용 시 두 작업을 모두 반영해 한 번에 저장.

- Step 3 이미지 그리드: `enableCrop: true` — 크롭 + 텍스트 제거 탭 모두 표시
- Step 2 크롭 카드(상세페이지): `enableCrop: false` — 텍스트 제거 탭만 표시

---

## UI 설계

```
┌──────────────────────────────────────────────────┐
│ 이미지 편집                       [✕ 취소] [✓ 적용] │
├──────────────────────────────────────────────────┤
│ [✂ 크롭] [🔤 텍스트 제거]   ← 탭 + 모드별 도구   │
├──────────────────────────────────────────────────┤
│                                                  │
│            (canvas — 현재 워킹 이미지)            │
│                                                  │
├──────────────────────────────────────────────────┤
│ 모드별 힌트 텍스트                                │
└──────────────────────────────────────────────────┘
```

- 좌측 탭: `✂ 크롭` / `🔤 텍스트 제거` (`enableCrop: false`일 때 크롭 탭 숨김)
- 우측 공통 액션: `✕ 취소` / `✓ 적용`
- 탭별 모드 도구는 탭 바 우측 컨텍스트 영역:
  - 크롭 탭: `↻ 초기화`
  - 텍스트 제거 탭: `🔍 자동 감지` / `👁 미리보기` / `↩ 되돌리기`

---

## 동작 흐름

1. 모달 오픈 → 원본 이미지 로드 → 기본 탭 = 크롭(`enableCrop: true`) 또는 텍스트 제거
2. **크롭 탭**: 드래그 1:1 정사각형 영역 선택 → `cropSelection` 저장 (예약 상태, 아직 적용 안 됨)
3. **탭 전환 (크롭 → 텍스트 제거)**:
   - `cropSelection`이 있으면 워킹 이미지를 그 영역으로 교체 (모달 내부 상태만, IDB 저장 X)
   - 캔버스 다시 그리기 + `displayScale` 재계산
4. **텍스트 제거 탭**: 워킹 이미지(원본 또는 크롭본) 위에서 박스 드래그 / OCR / 미리보기 / 되돌리기
5. **탭 전환 (텍스트 제거 → 크롭)**:
   - 기존 박스/히스토리 조용히 초기화 (좌표계 달라짐)
   - 캔버스를 원본 + cropSelection 오버레이로 복귀
6. **✓ 적용**:
   - 원본 해상도 출력 캔버스 생성
   - `cropSelection` 있으면 그 영역만 추출해 출력 캔버스에 그림
   - `boxes`를 `displayScale`로 역변환 → 출력 캔버스에 `fillBoxes` 인페인팅
   - `toDataURL('image/jpeg', 0.92)` → 콜백
7. **✕ 취소**: 변경 없이 모달 닫음

---

## 상태 모델

| 변수 | 의미 |
|------|------|
| `mode` | `'crop'` \| `'erase'` |
| `enableCrop` | 외부 옵션 — 크롭 탭 노출 여부 |
| `originalImg` | 원본 HTMLImageElement |
| `cropSelection` | `{x, y, w, h}` (원본 natural 좌표계) 또는 null |
| `workingImg` | cropSelection 있으면 잘라낸 in-memory 이미지, 없으면 originalImg |
| `displayScale` | workingImg natural → canvas 표시 비율 |
| `boxes` | 텍스트 제거 박스들 (canvas 표시 좌표계) |
| `history` | boxes 스냅샷 스택 |
| `cropBox` | 크롭 모드 드래그 중 임시 박스 (canvas 표시 좌표계) |
| `dragStart` | 드래그 시작 좌표 |
| `hoverIdx` | 호버 중인 텍스트 제거 박스 인덱스 |
| `tempBox` | 드래그 중 임시 텍스트 제거 박스 |
| `previewMode` | 인페인팅 미리보기 토글 |

---

## 좌표계 처리

세 좌표계 명확히 분리:
1. **client 좌표** (마우스 이벤트) → `clientToCanvas()`로 canvas 좌표로 변환
2. **canvas 표시 좌표** — `boxes`, `cropBox`가 이 좌표계
3. **natural 좌표** — `cropSelection`은 원본 이미지 natural 좌표

변환 규칙:
- 크롭 적용 시: `cropBox(canvas) × (originalImg.naturalSize / canvas.size) = cropSelection(natural)`
- 워킹 이미지 교체 후: `displayScale`이 `cropSelection.w/h` 기준으로 새로 계산됨
- 최종 적용 시: `boxes(canvas) ÷ displayScale = boxes(workingImg natural)` → 출력 캔버스에서 인페인팅

---

## 구현 항목

### 1. 신규: `extension/ui/modules/image-editor.js`
- `export function openImageEditorModal(dataUrl, callback, { enableCrop = true } = {})`
- 재사용: `getOcrWorker` / `fillBoxes` / `clientToCanvas` / `mergeNearbyBoxes` (이식)

### 2. `extension/ui/index.html`
- `#text-eraser-modal`, `#thumbnail-cropper-modal` 두 개 제거
- 신규 `#image-editor-modal` 추가

### 3. `extension/ui/modules/step2-imagegrid.js`
- "크롭" / "텍스트 제거" 두 버튼 → "편집" 한 버튼
- `openImageEditorModal(dataUrl, callback, { enableCrop: true })`

### 4. `extension/ui/modules/step2-cropper.js`
- `openTextEraserModal` 호출부 → `openImageEditorModal(dataUrl, callback, { enableCrop: false })`

### 5. `extension/ui/index.css`
- `.ie-tab-bar` / `.ie-tab` / `.ie-tab.active` 탭 스타일 추가

### 6. 삭제
- `extension/ui/modules/thumbnail-cropper.js`
- `extension/ui/modules/step2-text-eraser.js`

---

## 진행 상태

| 항목 | 상태 |
|------|------|
| `docs/work-plans/image-editor-unified.md` 작성 | ✅ 완료 |
| `image-editor.js` 신규 작성 | ⏳ 진행 중 |
| `index.html` 통합 모달 DOM | ⏳ 대기 |
| `step2-imagegrid.js` 편집 버튼 단일화 | ⏳ 대기 |
| `step2-cropper.js` import 변경 | ⏳ 대기 |
| `index.css` 탭 스타일 | ⏳ 대기 |
| 구 파일 삭제 | ⏳ 대기 |
| 문서 업데이트 (SESSION/CHANGELOG/MODULES) | ⏳ 대기 |
