// 진입점: 모듈 연결 + 이벤트 리스너 등록
import { $, toggleLogBar } from './modules/utils.js';
import { initMessageHandler }               from './modules/messages.js';
import { initQueue, addToQueue, loadQueue, retryItem, clearDoneItems, clearAllItems, updateQueueItemStatus } from './modules/queue.js';
import { initScrape, onScrapeDone }          from './modules/scrape.js';
import { initWorkspace, openDetailView, closeDetailView, goToStep } from './modules/workspace.js';
import { fetchCategory }                     from './modules/step1-category.js';
import { onSkuChange }                       from './modules/step1-form.js';
import { fillStep1 }                         from './modules/step1-form.js';
import { initImageGrid, renderImageGrid, refreshImageGridItem } from './modules/step2-imagegrid.js';
import { renderOptionCards, showOptionPicker } from './modules/step2-options.js';
import { renderDetailImgList, renderCroppedItem } from './modules/step2-cropper.js';
import { genAllMedia }                        from './modules/step3.js';
import { startRegister }                      from './modules/step4.js';
import { state }                              from './modules/state.js';

// 순환 의존 콜백 주입
initMessageHandler({ onScrapeDone, updateQueueItemStatus });
initQueue({ openDetailView, closeDetailView });
initScrape({ openDetailView });
initWorkspace({ renderOptionCards, renderImageGrid, renderDetailImgList, fillStep1, genAllMedia, refreshImageGridItem, renderCroppedItem });
initImageGrid({ showOptionPicker });

document.addEventListener('DOMContentLoaded', () => {
  // URL 입력
  $('queue-url').addEventListener('keydown', e => { if (e.key === 'Enter') addToQueue(); });
  $('btn-add').addEventListener('click', addToQueue);

  // 카테고리 조회
  $('btn-fetch-category').addEventListener('click', fetchCategory);

  // 결과 확인 (Step 3) — 재렌더링/다운로드 버튼 제거됨, auto-generate on step entry

  // 서플라이어 허브 임시저장 (Step 4)
  $('btn-start-register').addEventListener('click', startRegister);

  // 스텝 스테퍼 & 이전/다음
  document.querySelectorAll('.stepper-item').forEach(item => {
    item.addEventListener('click', () => goToStep(parseInt(item.dataset.step)));
  });
  $('btn-step-prev').addEventListener('click', () => goToStep(state.currentStep - 1));
  $('btn-step-next').addEventListener('click', () => goToStep(state.currentStep + 1));

  // 수량 변경 → 가격 재계산
  $('f-qty').addEventListener('input', onSkuChange);

  // 워크스페이스 닫기 / 단독 재크롤링
  $('btn-modal-close').addEventListener('click', closeDetailView);
  $('btn-modal-retry').addEventListener('click', () => { if (state.currentModalItemId) retryItem(state.currentModalItemId); });

  // 대기열 관리
  $('btn-clear-done').addEventListener('click', clearDoneItems);
  $('btn-clear-all').addEventListener('click', clearAllItems);

  // 글로벌 로그 바
  $('log-bar-header').addEventListener('click', toggleLogBar);

  loadQueue();
});
