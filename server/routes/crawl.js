const express = require('express')
const router = express.Router()
const db = require('../db/index')
const path = require('path')
const fs = require('fs')
const { createCrawlJob, cancelCrawlJob } = require('../scheduler/crawlWorker')

// POST /api/crawl/start — 创建采集任务
router.post('/start', (req, res) => {
  const { keyword, sortBy = 'sales', pagesToCrawl = 2, accountId, crawlMethod = 'web' } = req.body
  if (!keyword) return res.status(400).json({ code: 400, message: '请提供搜索关键词' })
  if (typeof keyword === 'string' && keyword.length > 200) {
    return res.status(400).json({ code: 400, message: '关键词最多 200 个字符' })
  }
  const validMethods = ['web', 'api', 'apify']
  const method = validMethods.includes(crawlMethod) ? crawlMethod : 'web'
  const pages = Math.min(Math.max(parseInt(pagesToCrawl) || 2, 1), 10)
  const jobId = createCrawlJob({ keyword, sortBy, pagesToCrawl: pages, accountId: accountId || null, crawlMethod: method })
  res.json({ code: 200, data: { jobId }, message: '采集任务已创建' })
})

// GET /api/crawl/jobs — 任务列表
router.get('/jobs', (req, res) => {
  const jobs = db.prepare('SELECT * FROM crawl_jobs ORDER BY created_at DESC LIMIT 50').all()
  res.json({ code: 200, data: jobs })
})

// GET /api/crawl/jobs/:id — 单条任务详情
router.get('/jobs/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM crawl_jobs WHERE id=?').get(req.params.id)
  if (!job) return res.status(404).json({ code: 404, message: '任务不存在' })
  res.json({ code: 200, data: job })
})

// POST /api/crawl/jobs/:id/cancel — 取消任务
router.post('/jobs/:id/cancel', (req, res) => {
  cancelCrawlJob(req.params.id)
  res.json({ code: 200, message: '取消信号已发送' })
})

// DELETE /api/crawl/jobs/:id — 删除任务及级联数据
router.delete('/jobs/:id', (req, res) => {
  const job = db.prepare('SELECT id FROM crawl_jobs WHERE id=?').get(req.params.id)
  if (!job) return res.status(404).json({ code: 404, message: '任务不存在' })

  // 级联删除顺序：profit_records → alibaba_suppliers → match_jobs → shopee_products（含图片）→ crawl_jobs
  const tx = db.transaction(() => {
    // 先拿图片路径（仅用于删本地文件）
    const products = db.prepare('SELECT image_path FROM shopee_products WHERE crawl_job_id=?').all(req.params.id)

    // 用子查询替代大数组 spread，避免 SQLite 999 参数限制
    db.prepare('DELETE FROM profit_records WHERE shopee_product_id IN (SELECT id FROM shopee_products WHERE crawl_job_id=?)').run(req.params.id)
    db.prepare('DELETE FROM alibaba_suppliers WHERE shopee_product_id IN (SELECT id FROM shopee_products WHERE crawl_job_id=?)').run(req.params.id)
    db.prepare('DELETE FROM match_jobs WHERE shopee_product_id IN (SELECT id FROM shopee_products WHERE crawl_job_id=?)').run(req.params.id)

    // 删除本地图片文件
    for (const p of products) {
      if (p.image_path) {
        const fp = path.join(__dirname, '../../', p.image_path)
        if (fs.existsSync(fp)) fs.unlinkSync(fp)
      }
    }
    db.prepare('DELETE FROM shopee_products WHERE crawl_job_id=?').run(req.params.id)
    db.prepare('DELETE FROM crawl_jobs WHERE id=?').run(req.params.id)
  })
  tx()
  res.json({ code: 200, message: '任务及关联数据已删除' })
})

// DELETE /api/crawl/products/batch — 批量删除商品（必须在 :id 路由之前注册）
router.delete('/products/batch', (req, res) => {
  const { ids } = req.body
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ code: 400, message: '请提供商品ID列表' })
  }
  const tx = db.transaction(() => {
    for (const id of ids) {
      const product = db.prepare('SELECT id, image_path FROM shopee_products WHERE id=?').get(id)
      if (!product) continue
      db.prepare('DELETE FROM profit_records WHERE shopee_product_id=?').run(product.id)
      db.prepare('DELETE FROM alibaba_suppliers WHERE shopee_product_id=?').run(product.id)
      db.prepare('DELETE FROM match_jobs WHERE shopee_product_id=?').run(product.id)
      if (product.image_path) {
        const fp = path.join(__dirname, '../../', product.image_path)
        if (fs.existsSync(fp)) fs.unlinkSync(fp)
      }
      db.prepare('DELETE FROM shopee_products WHERE id=?').run(product.id)
    }
  })
  tx()
  res.json({ code: 200, message: `已删除 ${ids.length} 个商品` })
})

// DELETE /api/crawl/products/:id — 删除单个商品及级联数据
router.delete('/products/:id', (req, res) => {
  const product = db.prepare('SELECT id, image_path FROM shopee_products WHERE id=?').get(req.params.id)
  if (!product) return res.status(404).json({ code: 404, message: '商品不存在' })

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM profit_records WHERE shopee_product_id=?').run(product.id)
    db.prepare('DELETE FROM alibaba_suppliers WHERE shopee_product_id=?').run(product.id)
    db.prepare('DELETE FROM match_jobs WHERE shopee_product_id=?').run(product.id)
    if (product.image_path) {
      const fp = path.join(__dirname, '../../', product.image_path)
      if (fs.existsSync(fp)) fs.unlinkSync(fp)
    }
    db.prepare('DELETE FROM shopee_products WHERE id=?').run(product.id)
  })
  tx()
  res.json({ code: 200, message: '商品已删除' })
})

// GET /api/crawl/products — 商品分页列表
router.get('/products', (req, res) => {
  const {
    page = 1, pageSize = 50, sortBy = 'created_at', sortOrder = 'desc',
    matchStatus, crawlJobId, keyword, accountId
  } = req.query

  const validSortFields = ['created_at', 'sales', 'price_thb', 'match_status', 'updated_at']
  const sort = validSortFields.includes(sortBy) ? sortBy : 'created_at'
  const order = sortOrder === 'asc' ? 'ASC' : 'DESC'
  const limit = Math.min(parseInt(pageSize) || 50, 200)
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit

  const conditions = []
  const params = []

  if (matchStatus) { conditions.push('match_status=?'); params.push(matchStatus) }
  if (crawlJobId) { conditions.push('crawl_job_id=?'); params.push(crawlJobId) }
  if (accountId) { conditions.push('account_id=?'); params.push(accountId) }
  if (keyword) {
    conditions.push('(title_cn LIKE ? OR title_original LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`)
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM shopee_products ${where}`).get(...params).cnt
  const list = db.prepare(
    `SELECT * FROM shopee_products ${where} ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset)

  res.json({ code: 200, data: { total, list, page: parseInt(page), pageSize: limit } })
})

module.exports = router
