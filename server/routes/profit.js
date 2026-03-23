const express = require('express')
const router = express.Router()
const { v4: uuidv4 } = require('uuid')
const db = require('../db/index')
const { calculate } = require('../services/ProfitService')

// POST /api/profit/calculate — 计算并保存利润
router.post('/calculate', (req, res) => {
  const { shopeeProductId, supplierId, packagingCostThb, shippingCostThb } = req.body
  if (!shopeeProductId || !supplierId) {
    return res.status(400).json({ code: 400, message: '缺少商品ID或供应商ID' })
  }

  const product = db.prepare('SELECT * FROM shopee_products WHERE id=?').get(shopeeProductId)
  const supplier = db.prepare('SELECT * FROM alibaba_suppliers WHERE id=?').get(supplierId)
  if (!product || !supplier) {
    return res.status(404).json({ code: 404, message: '商品或供应商不存在' })
  }

  const result = calculate({
    sellPriceThb: product.price_thb,
    costCny: supplier.price,
    packagingCostThb,
    shippingCostThb
  })

  const id = uuidv4()
  db.prepare(`
    INSERT OR REPLACE INTO profit_records
      (id, shopee_product_id, supplier_id, sell_price_thb, cost_cny, cost_thb,
       packaging_cost_thb, shipping_cost_thb, platform_fee_pct, platform_fee_thb,
       profit_thb, profit_cny, profit_margin)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, shopeeProductId, supplierId,
    product.price_thb, supplier.price, result.costThb,
    result.packagingCostThb, result.shippingCostThb,
    result.platformFeePct, result.platformFeeThb,
    result.profitThb, result.profitCny, result.profitMargin
  )

  res.json({ code: 200, data: { id, ...result } })
})

// GET /api/profit/records/:shopeeProductId
router.get('/records/:shopeeProductId', (req, res) => {
  const records = db.prepare(
    `SELECT pr.*, s.title as supplier_title, s.price as supplier_price, s.shop_name
     FROM profit_records pr
     LEFT JOIN alibaba_suppliers s ON s.id = pr.supplier_id
     WHERE pr.shopee_product_id=? ORDER BY pr.created_at DESC`
  ).all(req.params.shopeeProductId)
  res.json({ code: 200, data: records })
})

// POST /api/profit/batch-calculate — 批量核算
router.post('/batch-calculate', (req, res) => {
  const { items } = req.body
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ code: 400, message: '请传入 items 数组' })
  }

  const results = []
  for (const item of items) {
    const { shopeeProductId, supplierId } = item
    const product = db.prepare('SELECT * FROM shopee_products WHERE id=?').get(shopeeProductId)
    const supplier = db.prepare('SELECT * FROM alibaba_suppliers WHERE id=?').get(supplierId)
    if (!product || !supplier) continue

    const result = calculate({ sellPriceThb: product.price_thb, costCny: supplier.price })
    const id = uuidv4()
    db.prepare(`
      INSERT OR REPLACE INTO profit_records
        (id, shopee_product_id, supplier_id, sell_price_thb, cost_cny, cost_thb,
         packaging_cost_thb, shipping_cost_thb, platform_fee_pct, platform_fee_thb,
         profit_thb, profit_cny, profit_margin)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, shopeeProductId, supplierId,
      product.price_thb, supplier.price, result.costThb,
      result.packagingCostThb, result.shippingCostThb,
      result.platformFeePct, result.platformFeeThb,
      result.profitThb, result.profitCny, result.profitMargin
    )
    results.push({ id, shopeeProductId, ...result })
  }

  res.json({ code: 200, data: results, message: `已核算 ${results.length} 件` })
})

module.exports = router
