# [구버전] 서플라이어 허브 자동 등록 재설계 계획 (v3)

**작성일**: 2026-04 추정  
**상태**: 구버전 — `step4_fix.md`로 대체됨

> 이 계획은 step4.js 초기 설계 단계에서 작성됨.
> version: 160 사용 등 실제 API 스펙과 다른 부분이 있어 `step4_fix.md`로 업데이트됨.

---

## Context
기존 계획(DOM 자동화, Cloudflare R2) 모두 폐기.
- **이미지**: 생성 즉시 IDB에 저장 → 브라우저/PC 재시작 후에도 유지
- **임시저장**: 익스텐션에서 서플라이어 허브 Draft API 직접 호출 (상품명 + 이미지 포함)
- **사용자 작업**: 서플라이어 허브 → "중간 저장 불러오기" → 나머지 항목 확인 후 등록

## 발견한 API (Network 탭 분석)

| API | 방식 | 설명 |
|-----|------|------|
| `POST /sr/draft/api/create` | JSON | 임시저장 초안 생성 → docId 반환 |
| `GET /sr/draft/api/drafts` | GET | 임시저장 목록 조회 |
| `GET /sr/draft/api/get-by-id/{docId}` | GET | 특정 초안 불러오기 |
| `POST /sr/draft/api/upload-images/{docId}?imageType=MAIN` | multipart/form-data | 대표이미지 업로드 |
| `POST /sr/draft/api/upload-images/{docId}?imageType=LABEL` | multipart/form-data | 라벨이미지 업로드 |
| `POST /sr/draft/api/upload-images/{docId}?imageType=DETAIL` | multipart/form-data | 상세페이지이미지 업로드 |
| `POST /sr/draft/api/update` | JSON | 초안 페이지 데이터 업데이트 |

## 전체 흐름

```
[Step 3 — 결과확인]
  → genLabel() → IDB에 label_${itemId} 저장
  → genDetailPage() → IDB에 detail_${itemId} 저장

[Step 4 — 쿠팡 론칭] "임시저장" 버튼 클릭
  → POST /sr/draft/api/create → docId 확보
  → IDB에서 label/detail 로드 → Blob 변환
  → POST upload-images LABEL / DETAIL
  → "임시저장 완료!" 표시
```

## 수정할 파일

| 파일 | 작업 |
|------|------|
| `extension/ui/index.js` | 이미지 IDB 저장, fetchCategory 강화, startRegister 교체 |
| `extension/ui/index.html` | Step 4 버튼 텍스트, 완료 메시지 |
| `extension/manifest.json` | supplier.coupang.com host_permissions 확인 |

## 미결 사항 (당시 기준)

1. imagePage 자동 연결 여부 → 테스트로 확인 필요
2. MAIN 이미지 업로드 포함 여부
3. credentials: 'include' 쿠키 전달 여부
4. productNoticeNumber 자동 추출 여부
