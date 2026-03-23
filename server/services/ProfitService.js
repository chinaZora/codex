const { getConfig } = require('./ConfigService')

/**
 * 利润核算引擎
 */
function calculate ({ sellPriceThb, costCny, packagingCostThb, shippingCostThb, platformFeePct, exchangeRate }) {
  const rate = exchangeRate || parseFloat(getConfig('exchange_rate')) || 0.19
  const pkgCost = packagingCostThb ?? parseFloat(getConfig('default_packaging_cost')) ?? 5
  const shipCost = shippingCostThb ?? parseFloat(getConfig('default_shipping_cost')) ?? 0
  const feePct = platformFeePct ?? parseFloat(getConfig('platform_fee_pct')) ?? 0.02

  // 全成本（THB）= 进价换算 + 包装费 + 头程费
  const costThb = costCny / rate + pkgCost + shipCost
  // 平台佣金
  const platformFeeThb = sellPriceThb * feePct
  // 净利润
  const profitThb = sellPriceThb - costThb - platformFeeThb
  const profitCny = profitThb * rate
  const profitMargin = sellPriceThb > 0 ? profitThb / sellPriceThb : 0

  return {
    costThb: round(costThb),
    platformFeeThb: round(platformFeeThb),
    profitThb: round(profitThb),
    profitCny: round(profitCny),
    profitMargin: round(profitMargin, 4),
    packagingCostThb: pkgCost,
    shippingCostThb: shipCost,
    platformFeePct: feePct,
    exchangeRate: rate
  }
}

function round (n, digits = 2) {
  return Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits)
}

module.exports = { calculate }
