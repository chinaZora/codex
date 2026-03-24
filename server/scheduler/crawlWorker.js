const { v4: uuidv4 } = require('uuid')
const db = require('../db/index')
const logger = require('../utils/logger')
const { scrapeShopee, downloadImage } = require('../services/ShopeeScraperService')
const { translateAll } = require('../services/TranslatorService')
const sseEmitter = require('../utils/sseEmitter')

// 记录当前运行中的任务（用于取消）
const runningJobs = new Map() // jobId → { cancelled: false }

/**
 * 创建采集任务
 */
function createCrawlJob ({ keyword, sortBy = 'sales', pagesToCrawl = 2, accountId = null, crawlMethod = 'web' }) {
  const id = uuidv4()
  const url = `https://shopee.co.th/search?keyword=${encodeURIComponent(keyword)}&sortBy=${sortBy}`
  db.prepare(
    'INSERT INTO crawl_jobs (id, account_id, keyword, url, pages_to_crawl, status, crawl_method) VALUES (?,?,?,?,?,?,?)'
  ).run(id, accountId, keyword, url, pagesToCrawl, 'pending', crawlMethod)
  return id
}

/**
 * 取消采集任务
 */
function cancelCrawlJob (jobId) {
  const job = runningJobs.get(jobId)
  if (job) job.cancelled = true
  db.prepare("UPDATE crawl_jobs SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(jobId)
}

/**
 * 采集 Worker
 */
async function runCrawlJob (job) {
  const signal = { cancelled: false }
  runningJobs.set(job.id, signal)

  const updateJob = (fields) => {
    const sets = Object.entries(fields).map(([k]) => `${k}=?`).join(',')
    const vals = [...Object.values(fields), job.id]
    db.prepare(`UPDATE crawl_jobs SET ${sets}, updated_at=datetime('now') WHERE id=?`).run(...vals)
  }

  updateJob({ status: 'running', progress: 0 })
  sseEmitter.push({ type: 'crawl_progress', jobId: job.id, progress: 0, message: '采集开始...' })

  try {
    const products = await scrapeShopee(job, {
      isCancelled: () => signal.cancelled,
      onProgress: ({ progress, done, message }) => {
        updateJob({ progress, fetched: done })
        sseEmitter.push({ type: 'crawl_progress', jobId: job.id, progress, done, message })
      }
    })

    if (signal.cancelled) {
      updateJob({ status: 'cancelled' })
      return
    }

    // 保存商品到数据库
    const insertProduct = db.prepare(`
      INSERT OR IGNORE INTO shopee_products
        (id, crawl_job_id, account_id, title_original, title_cn, keywords,
         price_thb, price_cny, sales, image_url, image_path, product_url)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `)

    let saved = 0
    const saveAll = db.transaction(() => {
      for (const p of products) {
        const id = uuidv4()
        insertProduct.run(
          id, job.id, job.account_id,
          p.title_original, p.title_cn,
          JSON.stringify(p.keywords || []),
          p.priceThb || p.price_thb, p.price_cny,
          p.sales, p.imageUrl || p.image_url,
          null, // image_path 稍后异步下载
          p.productUrl || p.product_url
        )
        saved++
        // 返回 id 供后续下载图片
        p._savedId = id
      }
    })
    saveAll()

    updateJob({ status: 'done', progress: 90, fetched: saved })
    sseEmitter.push({ type: 'crawl_progress', jobId: job.id, progress: 90, message: `已保存 ${saved} 件，正在下载图片...` })

    // 异步下载图片（不阻塞任务完成）
    ;(async () => {
      try {
        for (const p of products) {
          if (!p._savedId || !p.imageUrl) continue
          const localPath = await downloadImage(p.imageUrl, p._savedId)
          if (localPath) {
            db.prepare("UPDATE shopee_products SET image_path=? WHERE id=?").run(localPath, p._savedId)
          }
        }
      } catch (err) {
        logger.warn('Image download batch failed', { jobId: job.id, error: err.message })
      } finally {
        updateJob({ progress: 100 })
        sseEmitter.push({ type: 'crawl_done', jobId: job.id, progress: 100, message: `采集完成，共 ${saved} 件商品` })
      }
    })()

  } catch (err) {
    logger.error('Crawl job failed', { jobId: job.id, error: err.message })
    updateJob({ status: 'failed', error: err.message })
    sseEmitter.push({ type: 'crawl_failed', jobId: job.id, message: err.message })
  } finally {
    runningJobs.delete(job.id)
  }
}

module.exports = { createCrawlJob, cancelCrawlJob, runCrawlJob }
