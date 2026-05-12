# [완료] 세부 카테고리 조회 구현 계획

**작성일**: 2026-04 추정  
**상태**: 완료 ✅ — ZIP/XLSX 파싱 방식으로 구현됨 (`extension/ui/modules/step1-category.js`)

> 원래 계획: Python/Flask 백엔드에서 Wing 카테고리 검색 API 프로빙 방식  
> 실제 구현: 크롬 익스텐션에서 `/qvt/v3/kan-categories/download-quotation` ZIP 다운로드 → JSZip 파싱 → displayCategoryCode 추출

---

## Context (당시)
- KAN categoryId → QVT API → 상위 경로만 반환 (등록용 세부 카테고리 아님)
- 목표: kan categoryId → 세부 등록 카테고리 후보 목록을 API로 동적 조회

## 핵심 아이디어 (당시)
상품 등록 폼의 카테고리 검색 모달이 내부적으로 Wing 카테고리 검색 API를 호출함 → 이 API를 찾아서 키워드로 조회.

시도할 엔드포인트:
```
GET  /wing/v3/categories/search?keyword={kw}
GET  /wing/categories/search?keyword={kw}
GET  /qvt/kan-categories/710/product-categories
GET  /qvt/quotation/categories?kanCategoryId=710
...
```

## 실제 구현 방식 (현재)
`extension/ui/modules/step1-category.js`:
1. `/qvt/v3/kan-categories/download-quotation` → ZIP 다운로드
2. JSZip으로 외부 ZIP → XLSX 내부 ZIP → `xl/sharedStrings.xml` 파싱
3. 정규식 `/<t[^>]*>([^<]*\((\d{4,6})\))\s*<\/t>/g` 으로 displayCategoryCode 추출
4. 후보 복수 시 라디오 버튼 UI로 선택

## 수정 파일 (당시 계획)
| 파일 | 작업 |
|------|------|
| `modules/supplier_hub.py` | probe 함수 → API 발견 후 resolve_category()에 통합 |
| `app.py` | 임시 디버그 엔드포인트 |
