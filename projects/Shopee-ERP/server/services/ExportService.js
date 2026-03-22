const xlsx = require('node-xlsx')
const db = require('../db/index')
const path = require('path')
const fs = require('fs')

const EXPORT_DIR = path.join(__dirname, '../../exports')
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true })

// SQLite 单次参数上限 999，超过时分批查询
const SQLITE_PARAM_LIMIT = 999
function chunkedQuery (sql, ids) {
  if (ids.length === 0) return []
  const rows = []
  for (let i = 0; i < ids.length; i += SQLITE_PARAM_LIMIT) {
    const chunk = ids.slice(i, i + SQLITE_PARAM_LIMIT)
    const ph = chunk.map(() => '?').join(',')
    rows.push(...db.prepare(sql.replace('__PH__', ph)).all(...chunk))
  }
  return rows
}

/**
 * 导出商品+供应商+利润数据为 Excel
 * @param {string[]|null} ids - 商品ID数组，null=全部导出
 * @returns {string} 导出文件路径
 */
function exportExcel (ids) {
  let products
  if (ids && ids.length > 0) {
    products = chunkedQuery('SELECT * FROM shopee_products WHERE id IN (__PH__) ORDER BY created_at DESC', ids)
  } else {
    products = db.prepare('SELECT * FROM shopee_products ORDER BY created_at DESC').all()
  }

  // Sheet 1: 商品列表
  const productSheet = [
    ['商品ID', '中文标题', '泰文原标题', '售价(THB)', '售价(CNY)', '销量', '匹配状态', '采集时间', '商品链接'],
    ...products.map(p => [
      p.id, p.title_cn, p.title_original, p.price_thb, p.price_cny,
      p.sales, p.match_status, p.created_at, p.product_url
    ])
  ]

  const productIds = products.map(p => p.id)
  const suppliers = chunkedQuery(
    `SELECT s.*, sp.title_cn as shopee_title FROM alibaba_suppliers s
     LEFT JOIN shopee_products sp ON sp.id = s.shopee_product_id
     WHERE s.shopee_product_id IN (__PH__) AND s.is_selected = 1
     ORDER BY s.composite_score DESC`,
    productIds
  )

  const supplierSheet = [
    ['关联商品标题', '供应商标题', '价格(CNY)', '最小起订量', '店铺名', '评分', '月销量', '综合评分', '相似度', '商品链接'],
    ...suppliers.map(s => [
      s.shopee_title, s.title, s.price, s.min_order, s.shop_name,
      s.shop_score, s.sales_30d, s.composite_score, s.image_similarity < 0 ? '无数据' : s.image_similarity.toFixed(2),
      s.product_url
    ])
  ]

  // Sheet 3: 利润核算
  const profits = chunkedQuery(
    `SELECT pr.*, sp.title_cn, sp.price_thb FROM profit_records pr
     LEFT JOIN shopee_products sp ON sp.id = pr.shopee_product_id
     WHERE pr.shopee_product_id IN (__PH__)`,
    productIds
  )

  const profitSheet = [
    ['商品标题', '售价(THB)', '进价(CNY)', '总成本(THB)', '包装费', '头程费', '平台佣金', '净利润(THB)', '净利润(CNY)', '利润率'],
    ...profits.map(r => [
      r.title_cn, r.sell_price_thb, r.cost_cny, r.cost_thb,
      r.packaging_cost_thb, r.shipping_cost_thb, r.platform_fee_thb,
      r.profit_thb, r.profit_cny,
      (r.profit_margin * 100).toFixed(1) + '%'
    ])
  ]

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `erp-export-${timestamp}.xlsx`
  const filepath = path.join(EXPORT_DIR, filename)

  const buffer = xlsx.build([
    { name: 'Shopee商品', data: productSheet },
    { name: '选定供应商', data: supplierSheet },
    { name: '利润核算', data: profitSheet }
  ])
  fs.writeFileSync(filepath, buffer)

  return filepath
}

module.exports = { exportExcel }
