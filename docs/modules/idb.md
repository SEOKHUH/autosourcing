## 역할
IndexedDB 래퍼 — 이미지(ArrayBuffer) 저장·조회·삭제·ObjectURL 변환

---

## 주요 함수

- `IDB.put(key, value)` — 키-값 저장 (value는 `{ buffer: ArrayBuffer, mimeType }` 또는 blob)
- `IDB.get(key)` — 키로 단일 레코드 조회 (없으면 null)
- `IDB.getAll(prefix)` — 특정 prefix로 시작하는 모든 키 목록 반환
- `IDB.remove(key)` — 단일 키 삭제
- `IDB.clearItem(itemId)` — 아이템 관련 모든 이미지 삭제
  - 삭제 prefix: `main_{itemId}_`, `detail_{itemId}_`, `skuthumb_{itemId}_`, `crop_{itemId}_`, `label_{itemId}`, `detail_page_{itemId}`
- `IDB.toObjectUrl(key)` — IDB에서 읽어 `URL.createObjectURL` 반환 (이미지 표시용)
- `IDB.base64ToArrayBuffer(base64)` — base64 문자열 → ArrayBuffer 변환 (Step 4 executeScript 데이터 수신용)

## IDB 키 규칙

| prefix | 설명 | 예시 |
|--------|------|------|
| `main_{itemId}_NN` | 메인 갤러리 이미지 | `main_abc123_00` |
| `detail_{itemId}_NN` | 상세 이미지 | `detail_abc123_01` |
| `skuthumb_{itemId}_NN` | SKU 옵션 썸네일 | `skuthumb_abc123_02` |
| `crop_{itemId}_NN` | Step 2 크롭 결과 | `crop_abc123_00` |
| `label_{itemId}` | 라벨 이미지 (Step 3 생성) | `label_abc123` |
| `detail_page_{itemId}` | 상세페이지 이미지 (Step 3 생성) | `detail_page_abc123` |

## 주의사항
- DB 이름: `heaor-sourcing-idb`, 스토어 이름: `images`
- ObjectURL은 사용 후 `URL.revokeObjectURL` 호출 권장 (메모리 누수 방지)
- `base64ToArrayBuffer`는 Step 4 executeScript args에서 전달받은 이미지를 ArrayBuffer로 복원할 때 사용
- `clearItem`은 아이템 삭제 시 queue.js `deleteItem`에서 호출
