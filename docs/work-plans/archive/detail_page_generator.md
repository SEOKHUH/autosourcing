# [구버전] 상세페이지 이미지 자동 생성 구현 계획

**작성일**: 2026-04 추정  
**상태**: 구버전 — Python/Pillow 방식, html2canvas 방식으로 대체됨

> 이 계획은 Flask 웹앱 시절에 작성됨.  
> 현재는 크롬 익스텐션 + html2canvas로 구현됨 (`extension/ui/modules/step3.js`, `html_renderer.js`)

---

## Context (당시)
1688 크롤링 데이터 기반으로 쿠팡 상세페이지 이미지를 자동 합성.
Figma 템플릿(docs/figma_template/) 레이아웃을 Python(Pillow)으로 재현.

## 출력물
- `detail_{item_id}.png` — 상세페이지 본문 이미지
- `label_{item_id}.png` — 제품 필수 표시사항

## Figma 템플릿 구조 (API에서 추출한 좌표)
캔버스: 800x3300px

| 요소 | 상대좌표 (x, y) | 크기 |
|------|----------------|------|
| #name 텍스트 | (0, 37) | 800x147 |
| img1 슬롯 1 | (0, 214) | 800x800 |
| img1 슬롯 2 | (0, 1056) | 800x800 |
| img1 슬롯 3 | (0, 1897) | 800x800 |
| "제품 상세정보" 제목 | (226, 2785) | 331x58 |
| 테이블 영역 | (97, 2899) | 607x268 |

## 구현 방식 (당시 계획)
Python Pillow로 처음부터 그리기 (Figma 좌표 기반)

### Phase 1: 상세페이지 합성 + 이미지 선택 UI
- `modules/detail_page_generator.py` 신규
- `app.py` 엔드포인트 추가: `POST /api/queue/<item_id>/detail-page`
- `templates/index.html`: 상세 이미지 세로 나열 + 선택 UI

### Phase 2: 드래그 크롭 UI
### Phase 3: 중국어 제거 (EasyOCR / Gemini 등)

## 실제 구현 방식 (현재)
- `extension/ui/modules/html_renderer.js`: HTML 템플릿 → html2canvas → PNG
- `extension/ui/modules/step3.js`: 생성 흐름 관리
- `extension/static/detail_page/`, `extension/static/label/`: HTML 템플릿
