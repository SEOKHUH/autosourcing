# 워크스페이스 열기/닫기 트랜지션 다듬기

## 목적
워크스페이스(디테일 뷰) 열고 닫을 때 트랜지션을 더 부드럽고 일관되게 다듬는다.
현재 기능은 정상 동작하며, 시각적 폴리싱 작업이다.

## 현재 동작 (분석)
- 열기 `openDetailView` ([workspace.js:81-87](../../extension/ui/modules/workspace.js)): `.split-layout`에 `has-workspace` → 사이드바 축소(0.4s), `#url-section`에 `hidden`(즉시 사라짐), 워크스페이스 `hidden` 제거 후 reflow → `show`로 슬라이드+페이드 인.
- 닫기 `closeDetailView` ([workspace.js:131-137](../../extension/ui/modules/workspace.js)): `show` 제거(슬라이드 아웃), `has-workspace` 제거(사이드바 복원), `url-section` 복원, 400ms 후 `hidden`.

## 발견된 어색한 점
1. **URL 섹션이 즉시 사라짐/나타남** — 사이드바는 0.4s로 부드럽게 줄어드는데 URL 막대만 `display:none`으로 톡 끊김. 박자 안 맞음.
2. **position absolute↔relative 순간 전환** — 워크스페이스가 열릴 때 relative, 닫힐 때 absolute로 즉시 전환되어 슬라이드 중 레이아웃이 들썩일 수 있음.
3. **`transition: all` 사용** — 의도치 않은 속성까지 애니메이션 가능. 예측성·성능 면에서 명시가 나음.

## 변경 계획

### 1. `transition: all` → 명시적 속성 (index.css)
- `.workspace` ([index.css:192](../../extension/ui/index.css)): `all` → `transform, opacity`
- `.sidebar` ([index.css:106](../../extension/ui/index.css)): `all` → `width, max-width, padding`

### 2. URL 섹션 collapse 애니메이션 (방식 a 채택)
- `display:none` 대신 `max-height` + `opacity` 트랜지션으로 흐려지며 접히는 한 동작으로.
- `.url-section-bar`에 `transition: max-height 0.3s, opacity 0.3s, padding 0.3s, border-width 0.3s; overflow: hidden;` 추가.
- 숨김 전용 클래스 `.url-section-collapsed` 신설: `max-height:0; opacity:0; padding-top:0; padding-bottom:0; border-bottom-width:0;`
- 표시 상태 `max-height`는 콘텐츠보다 넉넉한 고정값(예: 80px).
- JS([workspace.js](../../extension/ui/modules/workspace.js) 82-83, 134-135): `#url-section`에 대해 `hidden` 토글 → `url-section-collapsed` 토글로 변경.

### 3. workspace position 고정 (들썩임 제거)
- `.workspace`를 항상 `position:absolute`로 유지(`right:0; top:0; bottom:0; width:calc(100% - 300px)`).
- `.workspace.show`에서 `position:relative` 제거 (transform/opacity만 변경).
- 워크스페이스는 absolute라 사이드바 flex 흐름에 영향 없음 → 사이드바 축소/복원과 슬라이드가 독립적으로 부드럽게 진행.
- 높이는 `.split-layout`(flex:1) 기준 top0/bottom0로 채워지므로 relative 불필요. 내부 스크롤은 `.workspace-scroll-area`가 담당.

## 리스크
- 2번: `max-height` 고정값이 콘텐츠보다 작으면 잘림 → 넉넉히(80px) 설정.
- 3번: relative 제거 후 워크스페이스 높이/스크롤 정상인지 실제 확인 필요.

## 검증
- 확장 프로그램에서 워크스페이스 열기/닫기 반복하며: URL 막대가 부드럽게 접히는지, 슬라이드 중 들썩임 없는지, 내부 스크롤 정상인지 눈으로 확인.

## 영향 파일
- `extension/ui/index.css`
- `extension/ui/modules/workspace.js`
