// Step 3: 라벨·상세페이지 이미지 생성 + IDB 저장

import { state } from './state.js';
import { $, appendGlobalLog, dataUrlToArrayBuffer } from './utils.js';
import { IDB } from './idb.js';
import { HtmlRenderer } from './html_renderer.js';

export function getColorOptions() {
  const all       = state.selectedOptions.filter(o => o !== '__default__');
  const skuGroups = state.currentScrapeResult?.sku_groups_translated;
  if (!skuGroups?.length) return all;
  const colorGroup = skuGroups.find(g => g.isColorDim || g.items.some(i => i.imageUrl))
    || skuGroups.find(g => /색상|색|컬러|颜色|色彩|色系|color/i.test(g.dimension_kr || g.dimension || ''));
  if (!colorGroup) return all;
  const colorNames = new Set(colorGroup.items.map(i => i.name_kr || i.name));
  const filtered   = all.filter(o => colorNames.has(o));
  return filtered.length > 0 ? filtered : all;
}

export function getImagesForGeneration(maxCount) {
  const firstOpt = state.selectedOptions[0];
  if (firstOpt && state.optionImageMap[firstOpt]?.length > 0) return state.optionImageMap[firstOpt].slice(0, maxCount);
  if (state.optionImageMap['__default__']?.length > 0) return state.optionImageMap['__default__'].slice(0, maxCount);
  return state.allImages.slice(0, maxCount);
}

export async function genAllMedia() {
  await genLabel();
  await genDetailPage();
}

export async function genLabel() {
  const name      = '헤오르 ' + ($('f-name').value.trim());
  const colorOpts = getColorOptions();
  const option    = colorOpts.length > 0
    ? colorOpts.map(o => state.optionCustomNames[o] || o).join(', ')
    : '단일 옵션';
  const material  = $('f-material').value.trim();
  const quantity  = $('f-qty').value.trim();

  if (!name.trim()) { alert('상품명을 입력해주세요'); return; }
  appendGlobalLog('라벨 이미지 생성 중...');
  try {
    const dataUrl = await HtmlRenderer.renderLabel({ productName: name, color: option, material, quantity });
    $('label-img').src = dataUrl;
    $('sec-label').classList.remove('hidden');
    await IDB.put('label_' + state.currentModalItemId, dataUrlToArrayBuffer(dataUrl), 'label', 'image/png');
    appendGlobalLog('✅ 라벨 이미지 생성 완료');
  } catch (e) {
    appendGlobalLog('❌ 라벨 생성 오류: ' + e.message);
    console.error(e);
  }
}

export async function genDetailPage() {
  appendGlobalLog('상세페이지 이미지 생성 중...');
  try {
    const name     = '헤오르 ' + ($('f-name').value.trim());
    const option   = $('f-option').value.trim();
    const quantity = $('f-qty').value.trim();
    const material = $('f-material').value.trim();

    let imageBuffers = [];
    if (state.croppedImages.length > 0) {
      imageBuffers = await Promise.all(state.croppedImages.map(dataUrlToArrayBuffer));
    } else {
      const imgKeys = getImagesForGeneration(3);
      appendGlobalLog(`상세페이지 이미지 키: ${imgKeys.length}개 (${imgKeys.join(', ')})`);
      imageBuffers = await Promise.all(imgKeys.map(async k => {
        const rec = await IDB.get(k);
        return rec ? rec.buffer : null;
      }));
    }

    const dataUrl = await HtmlRenderer.renderDetailPage({ productName: name, color: option, quantity, material, imageBuffers });
    $('detail-page-img').src = dataUrl;
    $('sec-detail-page').classList.remove('hidden');
    await IDB.put('detail_' + state.currentModalItemId, dataUrlToArrayBuffer(dataUrl), 'detail', 'image/png');
    appendGlobalLog('✅ 상세페이지 이미지 생성 완료');
  } catch (e) {
    appendGlobalLog('❌ 상세페이지 생성 오류: ' + e.message);
    console.error(e);
    alert('상세페이지 생성 오류: ' + e.message);
  }
}
