// 스크래핑 완료 처리 + 이미지 다운로드

import { state } from './state.js';
import { appendGlobalLog } from './utils.js';
import { IDB } from './idb.js';
import { Translator } from './translator.js';
import { saveQueue, renderQueue, updateQueueItemStatus, crawlSettled, enqueueRescrape } from './queue.js';

let _openDetailView = null;

export function initScrape({ openDetailView }) {
  _openDetailView = openDetailView;
}

export async function onScrapeDone(result, itemId) {
  const id = itemId || state.currentItemId;
  if (!id) return;

  try {
    let titleKr, attrs, skus, sku_groups_translated, searchTags = [];

    // 옵션 문자열 전체 수집 (sku명 + sku_group 차원명 + 아이템명, 중복 제거·순서 유지)
    const optionNames = [];
    const optionSet = new Set();
    const addOpt = (name) => { if (name && !optionSet.has(name)) { optionSet.add(name); optionNames.push(name); } };
    for (const s of (result.skus || []))         addOpt(s.name);
    for (const g of (result.sku_groups || [])) {
      addOpt(g.dimension);
      for (const item of (g.items || []))        addOpt(item.name);
    }

    // ── Gemini 배치 번역 시도 ──
    const geminiResp = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'GEMINI_TRANSLATE_BATCH',
        title: result.title_cn,
        attributes: result.attributes || [],
        options: optionNames,
      }, resolve);
    });

    if (geminiResp?.ok && geminiResp.result) {
      const r = geminiResp.result;
      appendGlobalLog('✅ Gemini 번역+정제 완료');

      titleKr    = r.productName || result.title_cn;
      searchTags = r.searchTags  || [];

      console.log('[Gemini 매핑 진단] 입력 attrs:', (result.attributes||[]).length, '/ 응답 attrs:', (r.attributes||[]).length,
                  '/ 입력 options:', optionNames.length, '/ 응답 options:', (r.options||[]).length);
      console.log('[Gemini 응답 raw]', JSON.stringify(r).slice(0, 400));

      // 옵션 번역 맵: 원문 → 번역
      const optionMap = {};
      (r.options || []).forEach((kr, i) => { if (optionNames[i]) optionMap[optionNames[i]] = kr; });

      attrs = (result.attributes || []).map((a, i) => ({
        ...a, value_kr: r.attributes?.[i]?.value || a.value,
      }));
      skus = (result.skus || []).map(s => ({
        ...s, name_kr: optionMap[s.name] || s.name,
      }));
      sku_groups_translated = (result.sku_groups || []).map(g => ({
        ...g,
        dimension_kr: optionMap[g.dimension] || g.dimension,
        items: (g.items || []).map(i => ({ ...i, name_kr: optionMap[i.name] || i.name })),
      }));
    } else {
      // ── Google Translate 폴백 ──
      if (geminiResp?.noKey) {
        appendGlobalLog('Gemini 키 없음 — Google Translate 폴백');
      } else {
        appendGlobalLog(`⚠️ Gemini 실패 (${geminiResp?.error || '알 수 없음'}) — Google Translate 폴백`);
      }
      const [_titleKr, ...attrKr] = await Translator.translateBatch([
        result.title_cn,
        ...(result.attributes || []).map(a => a.value),
      ]);
      titleKr = Translator.cleanProductName(_titleKr);
      const skuKrNames = await Promise.all((result.skus || []).map(s => Translator.translateToKorean(s.name)));
      attrs = (result.attributes || []).map((a, i) => ({ ...a, value_kr: attrKr[i] || a.value }));
      skus  = (result.skus || []).map((s, i) => ({ ...s, name_kr: skuKrNames[i] || s.name }));
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

    // 🔬 번역 품질 진단 로그 (콘솔)
    console.group(`🔬 [번역 진단] ${result.scrape_method} (Gemini=${geminiResp?.ok === true})`);
    console.log('상품명 원문 :', result.title_cn);
    console.log('상품명 결과 :', titleKr);
    if (searchTags.length) console.log('검색태그    :', searchTags);
    console.table((result.attributes || []).map((a, i) => ({
      속성: a.name, 원문: a.value, 번역: attrs[i]?.value_kr,
    })));
    console.table((result.skus || []).map((s, i) => ({
      옵션원문: s.name, 옵션번역: skus[i]?.name_kr, 가격: s.price,
    })));
    console.groupEnd();
    appendGlobalLog('🔬 번역 진단 로그 — 콘솔(F12) 확인');

    appendGlobalLog(`이미지 다운로드 중... (대표 ${result.images.length}장)`);
    const mainImgData   = await downloadImagesViaSwitch(result.images,        'main_'    + id);
    const detailImgData = await downloadImagesViaSwitch(result.detail_images, 'detail_'  + id);
    const skuThumbUrls  = result.skus.map(s => s.imageUrl).filter(Boolean);
    const skuThumbData  = skuThumbUrls.length
      ? await downloadImagesViaSwitch(skuThumbUrls, 'skuthumb_' + id)
      : [];

    for (const img of [...mainImgData, ...detailImgData, ...skuThumbData]) {
      if (!img) continue;
      const buf = IDB.base64ToArrayBuffer(img.base64);
      await IDB.put(img.prefix + '_' + String(img.index).padStart(2, '0'), buf, img.url);
    }

    const fullResult = {
      ...result,
      title_kr: titleKr,
      search_tags: searchTags,
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

    if (!state.queueData[id]) return; // 처리 중 삭제됨

    // 가격 0 감지: SKU 중 price>0인 것이 하나도 없고 price_min도 0이면 가격 미수집
    const hasPrice = (fullResult.skus || []).some(s => parseFloat(s.price) > 0)
                  || parseFloat(fullResult.price_min) > 0;
    const prevItem = state.queueData[id];

    if (!hasPrice && !prevItem._priceRetried) {
      // 첫 번째 0가격 → 자동 1회 재크롤
      state.queueData[id] = { ...prevItem, _priceRetried: true, status: 'scraping', thumb: null };
      await saveQueue();
      renderQueue();
      appendGlobalLog('⚠️ 가격 0 감지 — 자동 재크롤링 시도');
      enqueueRescrape(id, prevItem.url);
      return; // crawlSettled는 finally에서 실행됨
    }

    state.queueData[id] = {
      ...state.queueData[id],
      status: 'review', title_kr: titleKr, thumb: thumbDataUrl, scrape_result: fullResult,
      priceMissing: !hasPrice,   // 재시도 후에도 0이면 경고 배지
      _priceRetried: undefined,  // 플래그 정리
    };
    await saveQueue();
    renderQueue();

    appendGlobalLog(`✅ 완료 (방법: ${result.scrape_method}, 이미지: ${result.images.length}장, 옵션: ${skus.length}개)`);
    appendGlobalLog(`sku_debug: ${JSON.stringify(result.sku_debug)}`);

    // 워크스페이스가 이 항목으로 이미 열려있을 때만 갱신 (닫혀있으면 자동 열기 안 함)
    if (state.isModalOpen && state.currentModalItemId === id) {
      if (_openDetailView) _openDetailView(id);
    }
  } catch (e) {
    appendGlobalLog('❌ 처리 오류: ' + e.message);
    console.error('onScrapeDone 오류:', e);
    updateQueueItemStatus(id, 'error');
  } finally {
    crawlSettled(id);
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
