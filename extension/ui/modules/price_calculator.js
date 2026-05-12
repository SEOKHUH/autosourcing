// 가격 계산: 원가 = 위안가×400 / 공급가 = ceil((원가+3000)/100)×100 / 판매가 = ceil(공급가/0.6/100)×100

export const PriceCalculator = (() => {
  function calculatePrices(yuanPrice, qty = 1) {
    const costPrice    = Math.floor(yuanPrice * 400 * qty);
    const supplyPrice  = Math.ceil((costPrice + 3000) / 100) * 100;
    const sellingPrice = Math.ceil(supplyPrice / 0.6 / 100) * 100;
    return {
      cost_price:    costPrice,
      supply_price:  supplyPrice,
      selling_price: sellingPrice,
      margin:        sellingPrice - supplyPrice,
    };
  }

  function calculateFromSkus(skus) {
    if (!skus || skus.length === 0) return calculatePrices(0);
    const prices = skus.map(s => s.price).filter(p => p > 0);
    if (!prices.length) return calculatePrices(0);
    return calculatePrices(Math.max(...prices));
  }

  return { calculatePrices, calculateFromSkus };
})();
