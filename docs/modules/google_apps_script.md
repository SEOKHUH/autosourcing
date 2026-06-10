## 역할
구글 스프레드시트 Web App — 모바일 소싱 후보 동기화 + 소싱 원장 기록

파일 위치: `docs/google-apps-script/Code.gs`

---

## 배포 설정
- 실행 계정: 나 (스프레드시트 소유자)
- 액세스: Anyone (인증 없이 접근)

## 엔드포인트

| 메서드 | 파라미터 | 설명 |
|--------|----------|------|
| GET | `action=pending` | `sourcing` 시트에서 status=pending 행 목록 반환 |
| POST | `action=add` | `{ url, title }` — 새 소싱 후보 행 추가 (중복 URL skip) |
| POST | `action=done` | `{ rowIds: [...] }` — 해당 행들의 status를 `done`으로 마킹 |
| POST | `action=ledger` | `{ url1688, rows: [...] }` — `ledger` 시트에 소싱 원장 기록 |

## sourcing 시트 컬럼
`timestamp | url | title | status`
- status 값: `pending` / `done`

## ledger 시트 컬럼
`현황 | 1688링크 | 상품명 | 색상 | 수량 | 중국원가(위안) | 공급가(수식) | 판매가(수식) | 월판매량 | END ROAS(수식)`

- 현황 드롭다운: `제안중 | 통과 | 반려 | 수입완료`
- 신규 입력은 헤더 바로 아래(행 2)에 삽입 → 최신 항목이 맨 위
- 중복 url1688이면 skip

## 커스텀 메뉴 (스프레드시트 상단)
- "수입완료 보관" — 수입완료 행을 `완료(보관)` 시트로 이동
- "시트 서식 재적용" — ledger 시트 드롭다운·조건부서식 재생성

## 마이그레이션
- `handleLedger`에서 `월판매량` 컬럼이 없으면 END ROAS 열 앞에 자동 삽입

## 주의사항
- `action=done`은 GET으로도 처리 가능 (iOS 단축어 POST→GET 리다이렉트 대응)
- 공급가·판매가·END ROAS는 수식으로 저장 (중국원가 수정 시 자동 재계산)
- `insertRowsAfter(1, n)` 방식: 유효성 검사가 상속 안 됨 → 삽입 행에 드롭다운 재적용 코드 포함
