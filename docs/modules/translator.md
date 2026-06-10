## 역할
중국어 → 한국어 번역 (Google Translate 비공개 Web API) + 상품명 정제

---

## 주요 함수

- `Translator.translateToKorean(text)` — 단일 텍스트 번역 (3회 재시도, 500ms 간격)
  - 엔드포인트: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=ko&dt=t`
  - API 키 불필요 (비공개 Web API)
- `Translator.translateBatch(texts)` — 텍스트 배열 병렬 번역 (`Promise.all`)
- `Translator.cleanProductName(name)` — 번역된 상품명 정제
  - 앞부분 영문/숫자 브랜드명 제거
  - FILLER_WORDS 제거 (새로운·최신·고품질·패션·인기 등 20여 개)
  - 중복 단어 제거
  - 40자 초과 시 마지막 공백 기준으로 자름

## FILLER_WORDS 목록 (일부)
`새로운`, `최신`, `고품질`, `패션`, `인기`, `다기능`, `핫 세일`, `무료 배송`, `고급`, `업그레이드`, `트렌디`, `실용적인`, `편리한`, `경량`, `내구성` 등

## 주의사항
- `scrape.js`에서 Gemini API 실패 시 폴백으로 사용
- `step1-form.js`의 `refineProductName`은 Gemini API 기반 정제 (별도 로직)
- API 키 불필요하지만 비공개 API이므로 Google 정책 변경 시 동작 중단 가능
- 번역 실패(3회 재시도 후)시 원본 텍스트 그대로 반환
