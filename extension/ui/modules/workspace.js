// 상세뷰 열기/닫기 + 스텝 이동 + 진행상황 저장·복원

import { state } from './state.js';
import { $ } from './utils.js';
import { saveQueue, renderQueue } from './queue.js';
import { IDB } from './idb.js';

// step2, step3는 순환 방지를 위해 콜백으로 주입
let _renderOptionCards    = null;
let _renderImageGrid      = null;
let _renderDetailImgList  = null;
let _fillStep1            = null;
let _genAllMedia          = null;
let _refreshImageGridItem = null;
let _renderCroppedItem    = null;

export function initWorkspace({ renderOptionCards, renderImageGrid, renderDetailImgList, fillStep1, genAllMedia, refreshImageGridItem, renderCroppedItem }) {
  _renderOptionCards    = renderOptionCards;
  _renderImageGrid      = renderImageGrid;
  _renderDetailImgList  = renderDetailImgList;
  _fillStep1            = fillStep1;
  _genAllMedia          = genAllMedia;
  _refreshImageGridItem = refreshImageGridItem;
  _renderCroppedItem    = renderCroppedItem;
}

export async function openDetailView(itemId) {
  const item = state.queueData[itemId];
  if (!item) return;

  state.currentModalItemId = itemId;
  state.isModalOpen        = true;

  if (item.scrape_result) {
    state.currentScrapeResult = item.scrape_result;
    state.allImages    = item.scrape_result.main_img_keys   || [];
    state.detailImages = item.scrape_result.detail_img_keys || [];
    state.skuThumbKeys = item.scrape_result.sku_thumb_keys  || [];
  }

  $('modal-title').textContent = (item.title_kr || '').slice(0, 30);

  state.activeOptionName     = null;
  state.selectedOptions      = [];
  state.optionCustomNames    = {};
  state.optionImageMap       = {};
  state.optionAssignedRowEls = {};
  state.croppedImageKeys     = [];

  $('img-grid').innerHTML        = '';
  $('option-cards').innerHTML    = '';
  $('detail-img-list').innerHTML = '';
  $('cropped-list').innerHTML    = '';
  state.croppedImages = [];

  $('f-category').value = '';
  $('f-category-id').value = '';
  const catResultEl = $('category-result');
  if (catResultEl) { catResultEl.innerHTML = ''; catResultEl.classList.add('hidden'); }
  document.getElementById('display-code-select-wrap')?.remove();

  $('sec-label').classList.add('hidden');
  $('sec-detail-page').classList.add('hidden');
  $('register-done').classList.add('hidden');

  document.querySelector('.split-layout').classList.add('has-workspace');
  const workspace = $('workspace');
  workspace.classList.remove('hidden');
  void workspace.offsetWidth;
  workspace.classList.add('show');

  if (state.currentScrapeResult) {
    if (_fillStep1) _fillStep1(state.currentScrapeResult);

    const skuGroups = state.currentScrapeResult?.sku_groups_translated?.length >= 2
      ? state.currentScrapeResult.sku_groups_translated : null;
    const skus = state.currentScrapeResult?.skus_translated || state.currentScrapeResult?.skus || [];
    if (_renderOptionCards)   await _renderOptionCards(skus, skuGroups);
    if (_renderDetailImgList) await _renderDetailImgList();

    const restored = await restoreProgress(item.progress);
    if (item.categoryPath && $('f-category-id').value) {
      const pathStr = item.categoryPath.split('>').map(s => s.trim()).filter(Boolean).join(' > ');
      $('f-category').value = pathStr;
    }
    goToStep(restored && item.progress?.step ? item.progress.step : 1);
  } else {
    goToStep(1);
  }

  ['f-name','f-supply','f-selling','f-qty','f-material','f-option','f-category-id'].forEach(id => {
    $(id).addEventListener('input', () => saveProgress());
  });
}

export function closeDetailView() {
  saveProgress(true);
  state.isModalOpen        = false;
  state.currentModalItemId = null;

  const workspace = $('workspace');
  workspace.classList.remove('show');
  document.querySelector('.split-layout').classList.remove('has-workspace');
  setTimeout(() => { if (!state.isModalOpen) workspace.classList.add('hidden'); }, 400);
  renderQueue();
}

export function goToStep(n) {
  state.currentStep = n;

  ['sec-step1','sec-step2','sec-step3','sec-step4'].forEach((id, i) => {
    $(id).classList.toggle('hidden', i + 1 !== n);
  });

  document.querySelectorAll('.stepper-item').forEach(item => {
    const s = parseInt(item.dataset.step);
    item.classList.toggle('active', s === n);
    item.classList.toggle('done', s < n);
  });
  document.querySelectorAll('.stepper-line').forEach(line => {
    line.classList.toggle('done', parseInt(line.dataset.afterStep) < n);
  });

  $('btn-step-prev').classList.toggle('hidden', n === 1);
  $('btn-step-next').classList.toggle('hidden', n === 4);
  $('workspace-scroll').scrollTop = 0;
  saveProgress(true);

  if (n === 3) {
    const grid = $('img-grid');
    if (grid && grid.children.length > 0) {
      grid.querySelectorAll('.img-grid-item').forEach(itemEl => {
        const imgEl = itemEl.querySelector('img');
        if (imgEl && _refreshImageGridItem) _refreshImageGridItem(itemEl, imgEl, itemEl.dataset.key);
      });
    } else {
      if (_renderImageGrid) _renderImageGrid();
    }
    if (_genAllMedia) _genAllMedia();
  }
}

let _saveProgressTimer = null;

export function saveProgress(immediate = false) {
  if (!state.currentModalItemId || !state.queueData[state.currentModalItemId]) return;
  const run = () => {
    state.queueData[state.currentModalItemId].progress = {
      step:              state.currentStep,
      selectedOptions:   [...state.selectedOptions],
      optionCustomNames: { ...state.optionCustomNames },
      croppedImageKeys:  [...state.croppedImageKeys],
      optionImageMap:   Object.fromEntries(
        Object.entries(state.optionImageMap).map(([k, v]) => [k, [...v]])
      ),
      name:       $('f-name').value,
      supply:     $('f-supply').value,
      selling:    $('f-selling').value,
      qty:        $('f-qty').value,
      material:   $('f-material').value,
      option:     $('f-option').value,
      categoryId: $('f-category-id').value,
    };
    saveQueue();
  };
  if (immediate) { clearTimeout(_saveProgressTimer); run(); }
  else { clearTimeout(_saveProgressTimer); _saveProgressTimer = setTimeout(run, 800); }
}

export async function restoreProgress(p) {
  if (!p) return false;
  if (p.name       !== undefined) $('f-name').value        = p.name;
  if (p.supply     !== undefined) $('f-supply').value      = p.supply;
  if (p.selling    !== undefined) $('f-selling').value     = p.selling;
  if (p.qty        !== undefined) $('f-qty').value         = p.qty;
  if (p.material   !== undefined) $('f-material').value    = p.material;
  if (p.option     !== undefined) $('f-option').value      = p.option;
  if (p.categoryId !== undefined) $('f-category-id').value = p.categoryId;

  state.selectedOptions   = p.selectedOptions || [];
  state.optionCustomNames = { ...(p.optionCustomNames || {}) };
  state.optionImageMap    = Object.fromEntries(
    Object.entries(p.optionImageMap || {}).map(([k, v]) => [k, [...v]])
  );

  // 크롭 이미지 복원
  state.croppedImageKeys = p.croppedImageKeys || [];
  for (const key of state.croppedImageKeys) {
    const rec = await IDB.get(key);
    if (!rec) continue;
    const bytes = new Uint8Array(rec.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const dataUrl = `data:${rec.mimeType};base64,${btoa(bin)}`;
    state.croppedImages.push(dataUrl);
    if (_renderCroppedItem) _renderCroppedItem(dataUrl, key);
  }

  document.querySelectorAll('.option-card').forEach(card => {
    card.classList.toggle('selected', state.selectedOptions.includes(card.dataset.option));
  });
  if (_refreshImageGridItem) {
    document.querySelectorAll('.img-grid-item').forEach(item => {
      const imgEl = item.querySelector('img');
      if (imgEl) _refreshImageGridItem(item, imgEl, item.dataset.key);
    });
  }
  return true;
}
