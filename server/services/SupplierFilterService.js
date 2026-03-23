const { getFilterConfig } = require('./ConfigService')
const logger = require('../utils/logger')

/**
 * 解析标签字符串为数组
 * tags 存储为 JSON 字符串 ["实力商家","包邮"]
 */
function parseTags (tagsStr) {
  if (!tagsStr) return []
  try { return JSON.parse(tagsStr) } catch { return [] }
}

/**
 * 过滤单个供应商是否符合筛选规则
 * @param {Object} supplier - 供应商数据
 * @param {number} shopeePriceCny - Shopee 商品人民币价格
 * @param {Object} filterCfg - 可选，不传则实时读数据库
 */
function filterSupplier (supplier, shopeePriceCny, filterCfg) {
  const cfg = filterCfg || getFilterConfig()
  const tags = parseTags(supplier.tags)

  if (cfg.requirePowerMerchant && !tags.includes('实力商家')) return false
  if (cfg.requireFreeShip && !tags.includes('包邮')) return false

  const price = parseFloat(supplier.price) || 0
  const maxAllowedPrice = shopeePriceCny * cfg.priceRatio
  if (price > maxAllowedPrice) return false

  const minOrder = parseInt(supplier.min_order) || 999
  if (minOrder > cfg.maxMoq) return false

  const score = parseFloat(supplier.shop_score) || 0
  if (score < cfg.minScore) return false

  const sales = parseInt(supplier.sales_30d) || 0
  if (sales < cfg.minSales) return false

  return true
}

/**
 * 批量过滤供应商列表，并输出统计日志
 */
function filterSuppliers (suppliers, shopeePriceCny) {
  const cfg = getFilterConfig()
  const reasons = {}
  const passed = []

  for (const s of suppliers) {
    const tags = parseTags(s.tags)
    let reject = null

    if (cfg.requirePowerMerchant && !tags.includes('实力商家')) {
      reject = '缺少实力商家标签'
    } else if (cfg.requireFreeShip && !tags.includes('包邮')) {
      reject = '缺少包邮标签'
    } else if ((parseFloat(s.price) || 0) > shopeePriceCny * cfg.priceRatio) {
      reject = `进价${s.price}超限(≤${(shopeePriceCny * cfg.priceRatio).toFixed(2)})`
    } else if ((parseInt(s.min_order) || 999) > cfg.maxMoq) {
      reject = `起购量${s.min_order}超限(≤${cfg.maxMoq})`
    } else if ((parseFloat(s.shop_score) || 0) < cfg.minScore) {
      reject = `评分${s.shop_score}低于${cfg.minScore}`
    } else if ((parseInt(s.sales_30d) || 0) < cfg.minSales) {
      reject = `销量${s.sales_30d}低于${cfg.minSales}`
    }

    if (reject) {
      reasons[reject] = (reasons[reject] || 0) + 1
    } else {
      passed.push(s)
    }
  }

  if (suppliers.length > 0) {
    logger.info(`供应商过滤结果: ${suppliers.length} → ${passed.length} 条`, {
      shopeePriceCny,
      maxAllowedPrice: (shopeePriceCny * cfg.priceRatio).toFixed(2),
      filterConfig: cfg,
      rejectedReasons: reasons
    })
  }

  return passed
}

module.exports = { filterSupplier, filterSuppliers, parseTags }
