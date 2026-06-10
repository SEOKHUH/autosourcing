# 이미지 그리드 썸네일 편집 기능 (크롭 + 텍스트 제거)

> 작성일: 2026-05-28  
> 상태: 구현 완료 ✅

## 배경

1차 작업으로 Step 2 크롭 이미지(상세페이지용)에 텍스트 제거 기능을 구현함 (완료).

Step 3 이미지 그리드(`#img-grid`)의 썸네일(메인이미지 + SKU 썸네일 + 크롭된 이미지)에도 동일한 편집 기능이 필요함:
- 1688 메인 이미지에 중국어 워터마크/라벨이 자주 포함됨
- 불필요한 여백/배경을 단일 사각형 크롭으로 정리 필요 (1:1 정방형 옵션)

## 채택안: 옵션 B — 썸네일 hover 시 "크롭" + "텍스트 제거" 두 버튼 노출

- 두 모달 독립. 텍스트 제거는 기존 `openTextEraserModal` 재사용. 크롭은 신규 단일 이미지 사각형 크롭 모달.
- 이미지 본체 클릭은 기존 동작(옵션 매칭 팝업) 유지.

---

## 사용자 흐름

1. Step 3 진입 → 이미지 그리드 렌더링
2. 썸네일에 마우스 호버 → 하단 오버레이에 두 버튼 표시: `크롭` / `텍스트 제거`
3. **"크롭" 클릭** → 새 크롭 모달:
   - 캔버스에 원본 이미지 전체 표시
   - 드래그로 사각형 영역 지정 (외부 어두운 마스크 + 3등분선 가이드)
   - `☐ 1:1` 토글로 정사각형 비율 고정 가능
   - `↻ 초기화` / `✕ 취소` / `✓ 적용`
   - 적용 시 잘린 영역만 새 dataURL로 반환 → IDB 같은 키에 덮어쓰기 → `img.src` 갱신
4. **"텍스트 제거" 클릭** → 기존 `openTextEraserModal` 재사용
5. 이미지 본체 클릭 → 기존 옵션 매칭 팝업 (변경 없음)

---

## 구현 항목

### 1. 신규 모듈: `extension/ui/modules/thumbnail-cropper.js`
- `openThumbnailCropperModal(dataUrl, callback)`
- 단일 이미지 캔버스 + 드래그 사각 영역
- **항상 1:1 정사각형 비율 강제** (토글 없음 — 썸네일은 무조건 정사각형)
- 외부 어두운 마스크 + 3등분선 가이드
- 캔버스 좌표 보정: `clientToCanvas` (utils.js 공용 함수 사용)
- 캔버스 경계 클램핑
- 적용 시 잘린 부분만 새 캔버스에 그려 `toDataURL('image/jpeg', 0.92)` 반환

### 2. `extension/ui/index.html` — 크롭 모달 DOM 추가
- `#thumbnail-cropper-modal` (기존 `text-eraser-backdrop` 스타일 재사용)
- 툴바 버튼: `tc-btn-reset` / `tc-btn-cancel` / `tc-btn-apply` (1:1 토글 버튼 없음)

### 3. `extension/ui/modules/step2-imagegrid.js` — 편집 버튼 부착
- `attachEditButtons(item, img, key)` 헬퍼 신규
  - 호버 오버레이 div 생성 (`.img-edit-overlay`)
  - "크롭" / "텍스트 제거" 버튼 2개
  - 각 클릭 핸들러: `e.stopPropagation()` → IDB buffer → dataURL 변환 → 모달 열기 → 콜백에서 IDB 덮어쓰기 + `img.src` 갱신
- `renderImageGrid()`에서 모든 그리드 아이템에 `attachEditButtons` 호출 (메인이미지 / SKU 썸네일 / 크롭 이미지)
- `dataUrlFromBuffer(buffer, mimeType)` 헬퍼 — IDB buffer → dataURL (FileReader)

### 4. `extension/ui/index.css` — 스타일 추가
- `.img-edit-overlay`: `position: absolute; left/right/bottom: 0; display: flex; gap: 1px; opacity: 0; transition: opacity 0.15s;`
- `.img-grid-item:hover .img-edit-overlay { opacity: 1; }`
- `.img-edit-btn`: `flex: 1; padding: 3px 0; background: rgba(14, 165, 233, 0.92); color: #fff; font-size: 10px; font-weight: 600;`

### 5. 모듈 리팩토링: `clientToCanvas` → `utils.js`로 추출
- `utils.js`에 `export function clientToCanvas(e, canvas)` 추가
- `step2-text-eraser.js`: 로컬 함수 삭제 → import로 교체
- `thumbnail-cropper.js`: 동일 처리

---

## 진행 상태

| 항목 | 상태 |
|------|------|
| `thumbnail-cropper.js` 신규 작성 | ✅ 완료 |
| `index.html` 크롭 모달 DOM 추가 | ✅ 완료 |
| `step2-imagegrid.js` 편집 버튼 부착 | ✅ 완료 |
| `index.css` hover 오버레이 + 크롭 모달 스타일 | ✅ 완료 |
| `clientToCanvas` → `utils.js` 추출 | ✅ 완료 |
| `MODULES.md` / `SESSION.md` / `CHANGELOG.md` 업데이트 | ✅ 완료 |

---

## 채택하지 않은 리팩토링 (참고)

| 항목 | 이유 |
|------|------|
| `dataUrlFromBuffer` → utils.js | 현재 한 곳에서만 사용 |
| `mergeNearbyBoxes` 별도 모듈 | 현재 한 곳에서만 사용 |
| `step2-text-eraser.js` 분할 | 모달 내부 상태 결합도 높음, 분할 시 복잡도 증가 |

---

## 검증 방법

1. 익스텐션 리로드 → 1688 상품 크롤링
2. Step 3 진입 → 이미지 그리드에 메인이미지 + SKU 썸네일 표시
3. 썸네일에 마우스 호버 → 하단에 "크롭" / "텍스트 제거" 버튼 표시
4. **크롭 테스트**:
   - "크롭" 클릭 → 크롭 모달 표시
   - 드래그로 영역 선택 → 외부 어두운 마스크 + 3등분선 표시 확인
   - "☐ 1:1" 토글 → 드래그 시 정사각형 비율 고정 확인
   - "↻ 초기화" → 크롭 영역 사라지는지 확인
   - "✓ 적용" → 모달 닫히고 썸네일이 잘린 영역으로 갱신되는지 확인
5. **텍스트 제거 테스트**: 기존 모달 재사용 확인
6. 이미지 본체 클릭 → 기존 옵션 매칭 팝업 동작 확인 (편집 버튼 클릭 시 트리거 안 됨)
7. 편집된 이미지를 옵션에 매칭한 뒤 Step 4 → 서플라이어 허브 임시저장에서 편집본이 업로드되는지 확인
8. 워크스페이스 재오픈 → 편집된 이미지 유지 확인 (IDB 영속성)
