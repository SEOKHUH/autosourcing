// 전역 상태 — 모든 모듈이 이 객체를 import해서 읽고 씀
export const state = {
  // 소싱 후보
  sourcingCandidates: [],

  // 대기열 & 스크래핑
  currentItemId: null,
  currentScrapeResult: null,
  allImages: [],   // 대표 이미지 IDB 키 목록
  detailImages: [],   // 상세 이미지 IDB 키 목록
  skuThumbKeys: [],   // SKU 썸네일 IDB 키 목록
  croppedImages: [],     // 크롭된 상세 이미지 dataURL (최대 3장)
  croppedImageKeys: [], // IDB 키 목록 (crop_${itemId}_${ts})
  queueData: {},   // id → item

  // 스텝 & 워크스페이스
  currentStep: 1,
  isModalOpen: false,
  currentModalItemId: null,

  // Step 2 옵션 매칭
  activeOptionName: null,
  selectedOptions: [],  // 사입 체크된 옵션 이름 배열 (원본명)
  optionCustomNames: {},  // { 원본옵션명: 사용자수정명 }
  optionImageMap: {},  // { 옵션이름: [imgKey, ...] }
  optionAssignedRowEls: {},  // 옵션이름 → 할당 미니어처 row DOM
};
