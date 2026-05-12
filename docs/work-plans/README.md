# Work Plans (작업 계획서)

## 역할 분담

| 역할 | 담당 |
|------|------|
| 🗓️ **계획 수립** | Claude Code (Plan 모드) → 사용자 검토 후 확정 |
| 💻 **코드 구현** | Claude Code |
| 📝 **문서 업데이트** | Claude Code (SESSION.md, CHANGELOG.md) |

---

## 작업 흐름

```
사용자 요청
    ↓
Claude Code → Plan 모드에서 계획 수립
    ↓
사용자 검토·승인
    ↓
Claude Code → 코드 구현
    ↓
Claude Code → SESSION.md / CHANGELOG.md 업데이트
```

**Claude Code에게 요청하는 방법:**
- 새 기능: "SESSION.md 읽고 [기능명] 개발해줘"
- 특정 파일 수정: "step4.js에서 [문제] 수정해줘"
- 문서 업데이트: "SESSION.md / CHANGELOG.md 업데이트해줘"

---

## 파일 목록

| 파일 | 내용 | 상태 |
|------|------|------|
| `step4_fix.md` | Step 4 서플라이어 허브 임시저장 버그 수정 | 코드 완료, 테스트 대기 ⚠️ |
| `multi-dim-sku.md` | 다차원 SKU (색상 × 사양) 지원 | 완료 ✅ |
| `product_name_refinement.md` | 상품명 자동 정제 기능 | 완료 ✅ |
| `product_name_fix.md` | 상품명 추출 오류 수정 (scraper) | 완료 ✅ |
| `category_lookup.md` | 세부 카테고리 조회 구현 | 완료 ✅ |

### archive/ (구버전 — 참고용)
| 파일 | 내용 |
|------|------|
| `archive/step4_v3_draft_api.md` | 서플라이어 허브 자동 등록 재설계 v3 (step4_fix.md로 대체) |
| `archive/detail_page_generator.md` | 상세페이지 이미지 생성 Python/Pillow 방식 (html2canvas로 대체) |
