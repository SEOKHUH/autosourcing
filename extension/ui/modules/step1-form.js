// Step 1: 상품명 정제, 가격 계산, 폼 채우기

import { state } from './state.js';
import { $ } from './utils.js';
import { PriceCalculator } from './price_calculator.js';

const NAME_FILTER_RE = /국경\s*간|공장\s*직접?\s*판매?|공장\s*직판|크로스\s*보더|도매가?|직접\s*판매|당일\s*발송|빠른\s*배송|무료\s*배송|특가|최저가|독점|공식\s*판매|헤오르\s*/gi;

export async function fillStep1(result) {
  $('f-name').value = '상품명 정제 중...';

  const matAttr = (result.attrs_translated || result.attributes || []).find(a =>
    /材质|面料|材料|재질|소재|material/i.test(a.name)
  );
  let matValue = matAttr ? (matAttr.value_kr || matAttr.value) : '';
  if (matAttr?.value) {
    const orig = matAttr.value.trim();
    if (/^[A-Za-z0-9\s\/\-,().]+$/.test(orig)) {
      matValue = orig.toUpperCase();
    } else {
      const engAbbrs = [...new Set((orig.match(/[A-Za-z]{2,}/g) || []).map(a => a.toUpperCase()))];
      engAbbrs.forEach(abbr => { matValue = matValue.replace(new RegExp(abbr, 'gi'), abbr); });
    }
  }
  if (/인증|없음|해당\s*없음|해당\s*사항|기타|N\/A/i.test(matValue)) matValue = '';
  $('f-material').value = matValue;

  const rawSkus = result.skus || [];
  const validPrices = rawSkus.map(s => s.price).filter(p => p > 0);
  const yuan = validPrices.length > 0
    ? Math.min(...validPrices)
    : (parseFloat(result.price_min) || 0);
  updatePriceDisplay(yuan, PriceCalculator.calculatePrices(yuan));

  $('sku-hint').textContent = '';
  $('f-option').value = '';

  refineProductName(result.title_kr || '').then(refined => {
    if ($('f-name').value === '상품명 정제 중...') $('f-name').value = refined;
  });
}

export async function refineProductName(rawName) {
  const ruleFiltered = rawName.replace(NAME_FILTER_RE, '').replace(/\s+/g, ' ').trim();
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'REFINE_PRODUCT_NAME', name: ruleFiltered });
    if (resp?.ok && resp.refined) return resp.refined;
  } catch (e) {}
  return ruleFiltered;
}

export function onSkuChange() {
  const allSkus = state.currentScrapeResult?.skus_translated || state.currentScrapeResult?.skus || [];
  const checkedSkus = allSkus.filter(s => state.selectedOptions.includes(s.name_kr || s.name));
  if (!checkedSkus.length) return;

  const validPrices = checkedSkus.map(s => parseFloat(s.price) || 0).filter(p => p > 0);
  let maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : (parseFloat(state.currentScrapeResult?.price_min) || 0);

  const qty = parseInt($('f-qty').value) || 1;
  updatePriceDisplay(maxPrice, PriceCalculator.calculatePrices(maxPrice, qty));

  // 색상 차원 옵션명만 f-option에 표시 (사양 차원 제외)
  // isColorDim 플래그 또는 차원명 키워드(색/颜色 등)로 색상 차원 판별
  const groups = state.currentScrapeResult?.sku_groups_translated || [];
  let colorOptionText;
  if (groups.length === 0) {
    colorOptionText = state.selectedOptions
      .filter(o => o !== '__default__')
      .map(o => state.optionCustomNames[o] || o)
      .join(', ');
  } else {
    const colorNames = new Set(
      groups
        .filter(g => g.isColorDim || g.items.some(i => i.imageUrl) || /색상|색|컬러|颜色|色彩|色系|color/i.test(g.dimension_kr || g.dimension || ''))
        .flatMap(g => g.items.map(item => item.name_kr || item.name))
    );
    colorOptionText = state.selectedOptions
      .filter(o => o !== '__default__' && colorNames.has(o))
      .map(o => state.optionCustomNames[o] || o)
      .join(', ');
  }
  $('f-option').value = colorOptionText;
}

export function updatePriceDisplay(yuan, prices) {
  $('d-yuan').textContent = yuan ? `¥${yuan}` : '-';
  $('d-cost').textContent = prices.cost_price ? `${prices.cost_price.toLocaleString()}원` : '-';
  $('f-supply').value  = prices.supply_price  || '';
  $('f-selling').value = prices.selling_price || '';
}
