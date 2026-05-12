# 옵션명 직접 수정 + 이미지 매칭 Step 3 이동

**작성일**: 2026-05-07  
**상태**: 구현 중

---

## 배경

현재 문제 두 가지:
1. 옵션 카드 클릭 시 이름 수정 불가 → 서플라이어 허브에 1688 원본 이름이 그대로 들어감
2. 이미지 매칭이 Step 1에 있어 흐름이 복잡함 → 옵션 확정 후 Step 3에서 매칭하는 게 자연스러움

---

## 수정 대상 파일

- `extension/ui/modules/state.js`
- `extension/ui/modules/step2-options.js`
- `extension/ui/modules/step1-form.js`
- `extension/ui/modules/step3.js`
- `extension/ui/modules/workspace.js`
- `extension/ui/modules/step4.js`
- `extension/ui/index.html`

---

## 변경 내용

### 1. state.js — `optionCustomNames` 추가

```js
optionCustomNames: {},  // { 원본옵션명: 사용자수정명 }
```

원본 이름은 내부 이미지 매칭 키로 유지, 수정된 이름은 서플라이어 허브 전송 및 라벨 생성에 사용.

---

### 2. step2-options.js — 옵션 카드 클릭 시 이름 입력 팝업

**현재**: 클릭 → 즉시 selectedOptions에 추가  
**변경 후**: 클릭 → 이름 입력 팝업 표시 → 확인 시 선택 완료

팝업 구조 (카드 위 오버레이):
- input (기본값: 번역된 한국어 이름 — 예: "회색 1리터")
- "확인" / "취소" 버튼

확인 클릭 시:
- `state.optionCustomNames[originalName] = customName` 저장
- `state.selectedOptions`에 originalName 추가 (기존과 동일)
- `onSkuChange()` 호출

이미 선택된 카드 클릭(토글 해제): 즉시 해제, optionCustomNames에서도 제거.

팝업/배지에도 수정명 표시:
- `showOptionPicker()` 버튼: `optionCustomNames[name] || name`
- `refreshImageGridItem()` 배지: `optionCustomNames[name] || name`

---

### 3. step1-form.js — onSkuChange()에서 f-option 수정명 표시

```js
$('f-option').value = state.selectedOptions
  .map(n => state.optionCustomNames[n] || n).join(', ');
```

---

### 4. index.html — Step 1 이미지 그리드 제거, Step 3에 매칭 UI 추가

**Step 1**: `.image-grid-zone` 제거, 옵션 카드만 남김

**Step 3**:
```
[이미지 매칭 섹션]    ← #img-grid 이동
[라벨 미리보기]       ← 자동 생성 (현재와 동일)
[상세페이지 미리보기] ← 자동 생성 (현재와 동일)
```

---

### 5. workspace.js — Step 3 진입 시 renderImageGrid() 추가 호출

`goToStep(3)` 시 기존 `_genAllMedia()` 유지 + `initStep3()` 추가 호출.  
`saveProgress()` / `restoreProgress()`에 `optionCustomNames` 추가.

---

### 6. step3.js — initStep3() 함수 추가

```js
export function initStep3() {
  renderImageGrid();  // 이미지 그리드 표시 + 매칭 뱃지
}
```

라벨 생성 시 수정명 반영:
```js
// genLabel() 내 옵션명 조합
state.optionCustomNames[name] || name
```

---

### 7. step4.js — optionCustomNames 전달 및 적용

args에 `optionCustomNames` 추가, makeSkuEntry에서:
```js
attributeValue: p.optionCustomNames[sku.optionName] || sku.optionName
```

---

## 동작 흐름

```
Step 1: 옵션 카드 클릭
  → 이름 입력 팝업 (기본값: 번역된 한국어 이름)
  → 수정 후 확인
  → selectedOptions에 원본명, optionCustomNames에 수정명 저장
  → f-option 필드에 수정명 표시

Step 3 진입:
  → 라벨 + 상세페이지 자동 생성
  → 이미지 그리드 표시 (Step 4 대표이미지 지정용)

Step 4:
  → optionCustomNames 기반으로 색상 attributeValue 전송
```

---

## 검증

1. 옵션 카드 클릭 → 팝업 + 기본값 pre-fill 확인
2. 이름 수정 후 확인 → f-option에 수정명 표시 확인
3. Step 1에 이미지 그리드 없는 것 확인
4. Step 3 진입 → 라벨/상세 자동 생성 + 이미지 그리드 표시 확인
5. 팝업/배지에 수정명 표시 확인
6. Step 4 임시저장 → 서플라이어 허브에서 수정된 옵션명 확인
7. progress 저장/복원 시 optionCustomNames 정상 복원 확인