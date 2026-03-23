const express = require('express')
const router = express.Router()
const db = require('../db/index')

// PATCH /api/edit/batch — 批量编辑标题和价格
// 支持两种格式：
//   { ids, titleTemplate, priceRatio } — 统一规则批量编辑
//   { updates: [{id, titleTemplate, priceRatio}] } — 逐条规则编辑
router.patch('/batch', (req, res) => {
  const { ids, titleTemplate, priceRatio, updates } = req.body

  // 构造统一的 per-id 任务列表
  let tasks = []
  if (Array.isArray(updates) && updates.length > 0) {
    tasks = updates
  } else if (Array.isArray(ids) && ids.length > 0) {
    tasks = ids.map(id => ({ id, titleTemplate, priceRatio }))
  } else {
    return res.status(400).json({ code: 400, message: '请提供 ids 或 updates 数组' })
  }

  const tx = db.transaction(() => {
    for (const task of tasks) {
      const { id, titleTemplate: tmpl, priceRatio: ratio } = task
      const product = db.prepare('SELECT * FROM shopee_products WHERE id=?').get(id)
      if (!product) continue

      const upd = {}
      if (tmpl) {
        upd.title_cn = tmpl.replace('{title}', product.title_cn || product.title_original || '')
      }
      if (ratio && parseFloat(ratio) > 0) {
        upd.price_thb = parseFloat((product.price_thb * parseFloat(ratio)).toFixed(2))
        upd.price_cny = parseFloat((product.price_cny * parseFloat(ratio)).toFixed(2))
      }

      if (Object.keys(upd).length > 0) {
        const sets = Object.keys(upd).map(k => `${k}=?`).join(',')
        db.prepare(`UPDATE shopee_products SET ${sets}, updated_at=datetime('now') WHERE id=?`)
          .run(...Object.values(upd), id)
      }
    }
  })
  tx()
  res.json({ code: 200, message: `已编辑 ${tasks.length} 件商品` })
})

// PATCH /api/edit/supplier/select — 标记供应商选中状态
router.patch('/supplier/select', (req, res) => {
  const { id, selected } = req.body
  if (!id) return res.status(400).json({ code: 400, message: '缺少供应商ID' })
  db.prepare('UPDATE alibaba_suppliers SET is_selected=? WHERE id=?').run(selected ? 1 : 0, id)
  res.json({ code: 200, message: selected ? '已选定供应商' : '已取消选定' })
})

module.exports = router
