// 소싱 원장 행 빌더 — step4.js와 queue.js 양쪽에서 사용 (순환 의존 방지용 분리)

import { PriceCalculator } from './price_calculator.js';

export function buildLedgerRows(item) {
  const scrapeResult = item.scrape_result || {};
  const progress     = item.progress     || {};

  const productName = progress.name || scrapeResult.title_kr || '';
  const qty         = progress.qty  || '1개';
  const qtyNum      = parseInt(qty) || 1;
  const defaultYuan = parseFloat(progress.yuan) || parseFloat(scrapeResult.price) || 0;

  const selectedOptions   = progress.selectedOptions   || [];
  const optionCustomNames = progress.optionCustomNames || {};
  const skus              = scrapeResult.skus_translated || scrapeResult.skus || [];

  // step4.js 와 동일한 colorOptions 판별 로직
  const hasOptions = selectedOptions.length > 0 &&
    !(selectedOptions.length === 1 && selectedOptions[0] === '__default__');

  const groups = scrapeResult.sku_groups_translated || [];
  const colorNames = new Set(
    groups
      .filter(g => g.isColorDim || g.items.some(i => i.imageUrl) ||
        /색상|색|컬러|颜色|色彩|色系|color/i.test(g.dimension_kr || g.dimension || ''))
      .flatMap(g => g.items.map(i => i.name_kr || i.name))
  );
  const colorOptionsFromGroups = hasOptions
    ? selectedOptions.filter(o => o !== '__default__' && colorNames.has(o))
    : [];
  const colorOptions = colorOptionsFromGroups.length > 0
    ? colorOptionsFromGroups
    : (hasOptions ? selectedOptions.filter(o => o !== '__default__') : []);

  const monthlySales = item.estimatedMonthlySales || 0;

  const makeRow = (optName, yuan) => {
    const prices      = PriceCalculator.calculatePrices(yuan, qtyNum);
    const displayName = optionCustomNames[optName] || optName;
    return {
      url1688:     item.url || '',
      productName,
      color:       displayName,
      qty,
      yuan,
      supplyPrice:  prices.supply_price,
      sellingPrice: prices.selling_price,
      monthlySales,
    };
  };

  if (colorOptions.length === 0) {
    return [makeRow('', defaultYuan)];
  }

  return colorOptions.map(optName => {
    const sku  = skus.find(s => s.name_kr === optName || s.name === optName);
    const yuan = (sku?.price > 0 ? sku.price : null) ?? defaultYuan;
    return makeRow(optName, yuan);
  });
}
