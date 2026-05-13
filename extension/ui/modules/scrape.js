// 스크래핑 완료 처리 + 이미지 다운로드

import { state } from './state.js';
import { appendGlobalLog } from './utils.js';
import { IDB } from './idb.js';
import { Translator } from './translator.js';
import { saveQueue, renderQueue, updateQueueItemStatus } from './queue.js';

let _openDetailView = null;

export function initScrape({ openDetailView }) {
  _openDetailView = openDetailView;
}

export async function onScrapeDone(result) {
  if (!state.currentItemId) return;

  try {
    const isKorean = result.scrape_method === 'BackgroundFetch' || result.scrape_method === 'WindowContext';
    let titleKr, attrs, skus, sku_groups_translated;

    if (isKorean) {
      appendGlobalLog('한국어 데이터 — 번역 스킵');
      titleKr = result.title_cn;
      attrs   = (result.attributes || []).map(a => ({ ...a, value_kr: a.value }));
      skus    = (result.skus || []).map(s => ({ ...s, name_kr: s.name }));
      sku_groups_translated = (result.sku_groups || []).map(g => ({
        ...g,
        dimension_kr: g.dimension,
        items: (g.items || []).map(i => ({ ...i, name_kr: i.name })),
      }));
    } else {
      appendGlobalLog('번역 중...');
      const [_titleKr, ...attrKr] = await Translator.translateBatch([
        result.title_cn,
        ...(result.attributes || []).map(a => a.value),
      ]);
      titleKr  = _titleKr;
      const skuKrNames = await Promise.all(result.skus.map(s => Translator.translateToKorean(s.name)));
      attrs    = result.attributes.map((a, i) => ({ ...a, value_kr: attrKr[i] || a.value }));
      skus     = result.skus.map((s, i) => ({ ...s, name_kr: skuKrNames[i] || s.name }));
      sku_groups_translated = [];
      if (result.sku_groups?.length >= 2) {
        sku_groups_translated = await Promise.all(result.sku_groups.map(async group => {
          const dimension_kr = group.dimension ? await Translator.translateToKorean(group.dimension) : '';
          const items = await Promise.all(group.items.map(async item => ({
            ...item, name_kr: await Translator.translateToKorean(item.name),
          })));
          return { ...group, dimension_kr, items };
        }));
      }
    }

    const cleanName = Translator.cleanProductName(titleKr);

    appendGlobalLog(`이미지 다운로드 중... (대표 ${result.images.length}장)`);
    const mainImgData   = await downloadImagesViaSwitch(result.images,        'main_'    + state.currentItemId);
    const detailImgData = await downloadImagesViaSwitch(result.detail_images, 'detail_'  + state.currentItemId);
    const skuThumbUrls  = result.skus.map(s => s.imageUrl).filter(Boolean);
    const skuThumbData  = skuThumbUrls.length
      ? await downloadImagesViaSwitch(skuThumbUrls, 'skuthumb_' + state.currentItemId)
      : [];

    for (const img of [...mainImgData, ...detailImgData, ...skuThumbData]) {
      if (!img) continue;
      const buf = IDB.base64ToArrayBuffer(img.base64);
      await IDB.put(img.prefix + '_' + String(img.index).padStart(2, '0'), buf, img.url);
    }

    const fullResult = {
      ...result,
      title_kr: cleanName,
      attrs_translated: attrs,
      skus_translated: skus,
      sku_groups_translated,
      main_img_keys:   mainImgData.filter(Boolean).map(img => img.prefix + '_' + String(img.index).padStart(2, '0')),
      detail_img_keys: detailImgData.filter(Boolean).map(img => img.prefix + '_' + String(img.index).padStart(2, '0')),
      sku_thumb_keys:  skuThumbData.filter(Boolean).map(img => img.prefix + '_' + String(img.index).padStart(2, '0')),
    };

    state.currentScrapeResult = fullResult;

    const firstImg = mainImgData.find(Boolean);
    let thumbDataUrl = null;
    if (firstImg) {
      const mime = firstImg.url.includes('.webp') ? 'image/webp'
                 : firstImg.url.includes('.png')  ? 'image/png'
                 : 'image/jpeg';
      thumbDataUrl = `data:${mime};base64,${firstImg.base64}`;
    }

    state.queueData[state.currentItemId] = {
      ...state.queueData[state.currentItemId],
      status: 'review', title_kr: cleanName, thumb: thumbDataUrl, scrape_result: fullResult,
    };
    await saveQueue();
    renderQueue();

    appendGlobalLog(`✅ 완료 (방법: ${result.scrape_method}, 이미지: ${result.images.length}장, 옵션: ${skus.length}개)`);
    appendGlobalLog(`sku_debug: ${JSON.stringify(result.sku_debug)}`);

    if (!state.isModalOpen || state.currentModalItemId === state.currentItemId) {
      if (_openDetailView) _openDetailView(state.currentItemId);
    }
  } catch (e) {
    appendGlobalLog('❌ 처리 오류: ' + e.message);
    console.error('onScrapeDone 오류:', e);
    updateQueueItemStatus(state.currentItemId, 'error');
  }
}

export function downloadImagesViaSwitch(urls, prefix) {
  return new Promise((resolve) => {
    if (!urls || !urls.length) return resolve([]);
    const timer = setTimeout(() => { console.warn('DOWNLOAD_IMAGES timeout:', prefix); resolve([]); }, 30000);
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_IMAGES', urls, prefix }, (resp) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        console.error('DOWNLOAD_IMAGES 오류:', chrome.runtime.lastError.message);
        return resolve([]);
      }
      resolve(resp?.images || []);
    });
  });
}
