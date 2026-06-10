// 진입점: 모듈 연결 + 이벤트 리스너 등록
import { $, toggleLogBar } from './modules/utils.js';
import { initMessageHandler }               from './modules/messages.js';
import { initQueue, addToQueue, loadQueue, retryItem, clearDoneItems, clearAllItems, updateQueueItemStatus } from './modules/queue.js';
import { initScrape, onScrapeDone }          from './modules/scrape.js';
import { initWorkspace, openDetailView, closeDetailView, goToStep } from './modules/workspace.js';
import { fetchCategory, restoreCategoryUI }  from './modules/step1-category.js';
import { onSkuChange, initYuanInput }         from './modules/step1-form.js';
import { fillStep1 }                         from './modules/step1-form.js';
import { initImageGrid, renderImageGrid, refreshImageGridItem } from './modules/step2-imagegrid.js';
import { renderOptionCards, showOptionPicker } from './modules/step2-options.js';
import { renderDetailImgList, renderCroppedItem } from './modules/step2-cropper.js';
import { genAllMedia }                        from './modules/step3.js';
import { startRegister }                      from './modules/step4.js';
import { state }                              from './modules/state.js';
import { initCandidates, onCandidateAdded, onCandidateLinked, onCandidateRemoved, clearAllCandidates } from './modules/candidates.js';
import { addToQueueFromCandidate }            from './modules/queue.js';
import { initMobileSync, syncFromSheet, saveMobileSyncSettings, loadMobileSyncSettings } from './modules/mobile-sync.js';

// 순환 의존 콜백 주입
initMessageHandler({ onScrapeDone, updateQueueItemStatus, onCandidateAdded, onCandidateLinked, onCandidateRemoved });
initMobileSync({ onCandidateAdded });
initQueue({ openDetailView, closeDetailView });
initCandidates({ addToQueueFromCandidate });
initScrape({ openDetailView });
initWorkspace({ renderOptionCards, renderImageGrid, renderDetailImgList, fillStep1, genAllMedia, refreshImageGridItem, renderCroppedItem, fetchCategory, restoreCategoryUI });
initImageGrid({ showOptionPicker });

function switchTab(name) {
  ['candidates', 'queue'].forEach(t => {
    $('tab-' + t).classList.toggle('active', t === name);
    $('panel-' + t).classList.toggle('hidden', t !== name);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // 탭 전환
  $('tab-candidates').addEventListener('click', () => switchTab('candidates'));
  $('tab-queue').addEventListener('click', () => switchTab('queue'));

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

  // 위안가 직접 수정 → 가격 재계산
  initYuanInput();

  // 워크스페이스 닫기 / 단독 재크롤링
  $('btn-modal-close').addEventListener('click', closeDetailView);
  $('btn-modal-retry').addEventListener('click', () => { if (state.currentModalItemId) retryItem(state.currentModalItemId); });

  // 대기열 관리
  $('btn-clear-done').addEventListener('click', clearDoneItems);
  $('btn-clear-all').addEventListener('click', clearAllItems);

  // 글로벌 로그 바
  $('log-fab').addEventListener('click', toggleLogBar);
  $('btn-log-close').addEventListener('click', toggleLogBar);

  $('btn-clear-candidates').addEventListener('click', clearAllCandidates);

  loadQueue();

  // 모바일 동기화 버튼
  $('btn-mobile-sync').addEventListener('click', syncFromSheet);

  // 설정 모달 열기/닫기
  $('btn-mobile-settings').addEventListener('click', async () => {
    const settings = await loadMobileSyncSettings();
    $('mobile-webhook-url').value = settings.webhookUrl || '';
    $('gemini-api-key').value = settings.geminiApiKey || '';
    $('mobile-settings-modal').classList.remove('hidden');
  });
  $('btn-mobile-settings-close').addEventListener('click', () => {
    $('mobile-settings-modal').classList.add('hidden');
  });
  $('mobile-settings-modal').addEventListener('click', (e) => {
    if (e.target === $('mobile-settings-modal')) $('mobile-settings-modal').classList.add('hidden');
  });
  $('btn-mobile-settings-save').addEventListener('click', async () => {
    const url = $('mobile-webhook-url').value.trim();
    const geminiApiKey = $('gemini-api-key').value.trim();
    await saveMobileSyncSettings(url, geminiApiKey);
    $('mobile-settings-modal').classList.add('hidden');
    if (url) syncFromSheet();
  });

});
