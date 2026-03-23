const { v4: uuidv4 } = require('uuid')
const db = require('../db/index')
const logger = require('../utils/logger')
const { matchProduct } = require('../services/AlibabaSearchService')
const sseEmitter = require('../utils/sseEmitter')

const runningMatchJobs = new Map()

/**
 * 批量创建匹配任务
 */
function createMatchJobs (productIds) {
  const jobIds = []
  const insert = db.prepare(
    'INSERT INTO match_jobs (id, shopee_product_id, status) VALUES (?,?,?)'
  )
  const updateStatus = db.prepare(
    "UPDATE shopee_products SET match_status='pending', updated_at=datetime('now') WHERE id=?"
  )
  const tx = db.transaction(() => {
    for (const pid of productIds) {
      const id = uuidv4()
      insert.run(id, pid, 'pending')
      updateStatus.run(pid)
      jobIds.push(id)
    }
  })
  tx()
  return jobIds
}

/**
 * 取消匹配任务
 */
function cancelMatchJob (jobId) {
  const signal = runningMatchJobs.get(jobId)
  if (signal) signal.cancelled = true
  db.prepare("UPDATE match_jobs SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(jobId)
}

/**
 * 匹配 Worker
 */
async function runMatchJob (job) {
  const signal = { cancelled: false }
  runningMatchJobs.set(job.id, signal)

  const updateJob = (fields) => {
    const sets = Object.entries(fields).map(([k]) => `${k}=?`).join(',')
    db.prepare(`UPDATE match_jobs SET ${sets}, updated_at=datetime('now') WHERE id=?`)
      .run(...Object.values(fields), job.id)
  }

  updateJob({ status: 'running', progress: 0 })

  // 获取对应的 Shopee 商品
  const product = db.prepare('SELECT * FROM shopee_products WHERE id=?').get(job.shopee_product_id)
  if (!product) {
    updateJob({ status: 'failed', error: '商品不存在' })
    return
  }

  db.prepare("UPDATE shopee_products SET match_status='running', updated_at=datetime('now') WHERE id=?")
    .run(product.id)

  sseEmitter.push({ type: 'match_progress', jobId: job.id, productId: product.id, progress: 5, message: '开始匹配...' })

  try {
    const suppliers = await matchProduct(product, {
      isCancelled: () => signal.cancelled,
      onProgress: ({ progress, message }) => {
        updateJob({ progress })
        sseEmitter.push({ type: 'match_progress', jobId: job.id, productId: product.id, progress, message })
      }
    })

    if (signal.cancelled) {
      updateJob({ status: 'cancelled' })
      db.prepare("UPDATE shopee_products SET match_status='none', updated_at=datetime('now') WHERE id=?").run(product.id)
      return
    }

    // 清除旧结果（同一商品的所有历史供应商），写入新结果
    const clearOld = db.prepare('DELETE FROM alibaba_suppliers WHERE shopee_product_id=?')
    const insertSupplier = db.prepare(`
      INSERT INTO alibaba_suppliers
        (id, match_job_id, shopee_product_id, title, price, min_order, shop_name,
         shop_score, tags, sales_30d, product_url, image_url,
         image_similarity, composite_score, score_degraded)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `)

    const saveAll = db.transaction(() => {
      clearOld.run(product.id)
      for (const s of suppliers) {
        insertSupplier.run(
          uuidv4(), job.id, product.id,
          s.title, s.price, s.min_order, s.shop_name,
          s.shop_score, s.tags, s.sales_30d,
          s.product_url, s.image_url,
          s.image_similarity, s.composite_score, s.score_degraded || 0
        )
      }
    })
    saveAll()

    updateJob({ status: 'done', progress: 100, result_count: suppliers.length })
    db.prepare("UPDATE shopee_products SET match_status='done', updated_at=datetime('now') WHERE id=?").run(product.id)
    sseEmitter.push({
      type: 'match_done',
      jobId: job.id,
      productId: product.id,
      progress: 100,
      resultCount: suppliers.length,
      message: `匹配完成，找到 ${suppliers.length} 个供应商`
    })
  } catch (err) {
    logger.error('Match job failed', { jobId: job.id, error: err.message })
    updateJob({ status: 'failed', error: err.message })
    db.prepare("UPDATE shopee_products SET match_status='failed', updated_at=datetime('now') WHERE id=?").run(product.id)
    sseEmitter.push({ type: 'match_failed', jobId: job.id, productId: product.id, message: err.message })
  } finally {
    runningMatchJobs.delete(job.id)
  }
}

module.exports = { createMatchJobs, cancelMatchJob, runMatchJob }
