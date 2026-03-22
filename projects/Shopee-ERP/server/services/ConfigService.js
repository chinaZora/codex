const db = require('../db/index')

/**
 * 获取单条配置值
 */
function getConfig (key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key)
  return row ? row.value : null
}

/**
 * 获取所有配置，返回 { key: value } 对象
 * API Key 脱敏处理
 */
function getAllConfig () {
  const rows = db.prepare('SELECT key, value FROM config').all()
  const result = {}
  for (const row of rows) {
    if (['deepseek_api_key', 'openai_api_key', 'alibaba_api_key'].includes(row.key) && row.value && row.value.length > 4) {
      result[row.key] = '****' + row.value.slice(-4)
    } else {
      result[row.key] = row.value
    }
  }
  return result
}

/**
 * 获取所有筛选规则配置（返回正确类型）
 */
function getFilterConfig () {
  return {
    priceRatio: parseFloat(getConfig('filter_price_ratio') || '0.5'),
    minScore: parseFloat(getConfig('filter_min_score') || '4.5'),
    minSales: parseInt(getConfig('filter_min_sales') || '1000'),
    maxMoq: parseInt(getConfig('filter_max_moq') || '50'),
    requireFreeShip: getConfig('filter_require_free_ship') !== 'false',
    requirePowerMerchant: getConfig('filter_require_power_merchant') !== 'false',
    exchangeRate: parseFloat(getConfig('exchange_rate') || '0.19')
  }
}

/**
 * 批量更新配置
 */
function setConfigs (kvMap) {
  const stmt = db.prepare(
    "INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now')) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
  )
  const sensitiveKeys = new Set(['deepseek_api_key', 'openai_api_key', 'alibaba_api_key'])
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) {
      const value = String(v)
      if (sensitiveKeys.has(k) && value.startsWith('****')) continue
      stmt.run(k, value)
    }
  })
  tx(Object.entries(kvMap))
}

module.exports = { getConfig, getAllConfig, getFilterConfig, setConfigs }
