const express = require('express')
const router = express.Router()
const db = require('../db/index')
const { createMatchJobs, cancelMatchJob } = require('../scheduler/matchWorker')

// POST /api/match/start — 批量创建匹配任务
router.post('/start', (req, res) => {
  const { ids } = req.body
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ code: 400, message: '请选择商品' })
  }
  const jobIds = createMatchJobs(ids)
  res.json({ code: 200, data: { jobIds }, message: `已创建 ${jobIds.length} 个匹配任务` })
})

// GET /api/match/jobs — 匹配任务列表
router.get('/jobs', (req, res) => {
  const jobs = db.prepare('SELECT * FROM match_jobs ORDER BY created_at DESC LIMIT 100').all()
  res.json({ code: 200, data: jobs })
})

// POST /api/match/jobs/:id/cancel
router.post('/jobs/:id/cancel', (req, res) => {
  cancelMatchJob(req.params.id)
  res.json({ code: 200, message: '取消信号已发送' })
})

// DELETE /api/match/jobs/:id
router.delete('/jobs/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM match_jobs WHERE id=?').get(req.params.id)
  if (!job) return res.status(404).json({ code: 404, message: '任务不存在' })
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM alibaba_suppliers WHERE match_job_id=?').run(req.params.id)
    db.prepare("UPDATE shopee_products SET match_status='none', updated_at=datetime('now') WHERE id=?").run(job.shopee_product_id)
    db.prepare('DELETE FROM match_jobs WHERE id=?').run(req.params.id)
  })
  tx()
  res.json({ code: 200, message: '匹配任务已删除' })
})

// POST /api/match/reset — 批量重置商品匹配状态为 none（可重新匹配）
router.post('/reset', (req, res) => {
  const { ids } = req.body
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ code: 400, message: '请选择商品' })
  }
  const tx = db.transaction(() => {
    for (const id of ids) {
      db.prepare("UPDATE shopee_products SET match_status='none', updated_at=datetime('now') WHERE id=?").run(id)
    }
  })
  tx()
  res.json({ code: 200, message: `已重置 ${ids.length} 个商品的匹配状态` })
})

// GET /api/match/suppliers/:shopeeProductId — 供应商列表
router.get('/suppliers/:shopeeProductId', (req, res) => {
  const suppliers = db.prepare(
    'SELECT * FROM alibaba_suppliers WHERE shopee_product_id=? ORDER BY composite_score DESC'
  ).all(req.params.shopeeProductId)
  const latestJob = db.prepare(
    'SELECT search_terms FROM match_jobs WHERE shopee_product_id=? ORDER BY created_at DESC LIMIT 1'
  ).get(req.params.shopeeProductId)
  let searchTerms = []
  try { searchTerms = JSON.parse(latestJob?.search_terms || '[]') } catch {}
  res.json({ code: 200, data: { suppliers, searchTerms } })
})

module.exports = router
