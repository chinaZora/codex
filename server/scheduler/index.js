const db = require('../db/index')
const logger = require('../utils/logger')
const { runCrawlJob } = require('./crawlWorker')
const { runMatchJob } = require('./matchWorker')

const MAX_CRAWL_CONCURRENT = 1
const MAX_MATCH_CONCURRENT = 3

let crawlRunning = 0
let matchRunning = 0
let schedulerInterval = null

/**
 * 启动时：将 running 状态的任务重置为 pending（崩溃恢复）
 */
function recoverStuckJobs () {
  const crawlRecovered = db.prepare(
    "UPDATE crawl_jobs SET status='pending', updated_at=datetime('now') WHERE status='running'"
  ).run().changes

  const matchRecovered = db.prepare(
    "UPDATE match_jobs SET status='pending', updated_at=datetime('now') WHERE status='running'"
  ).run().changes

  // 对应的 shopee_products match_status 也重置
  db.prepare(
    "UPDATE shopee_products SET match_status='pending', updated_at=datetime('now') WHERE match_status='running'"
  ).run()

  if (crawlRecovered > 0) logger.info(`Recovered ${crawlRecovered} stuck crawl jobs`)
  if (matchRecovered > 0) logger.info(`Recovered ${matchRecovered} stuck match jobs`)
}

/**
 * 调度一次采集任务
 */
function dispatchCrawl () {
  if (crawlRunning >= MAX_CRAWL_CONCURRENT) return

  const job = db.prepare(
    "SELECT * FROM crawl_jobs WHERE status='pending' ORDER BY created_at ASC LIMIT 1"
  ).get()

  if (!job) return

  crawlRunning++
  logger.info('Dispatching crawl job', { jobId: job.id })

  runCrawlJob(job).finally(() => {
    crawlRunning--
  })
}

/**
 * 调度匹配任务（并发最多3个）
 */
function dispatchMatch () {
  const available = MAX_MATCH_CONCURRENT - matchRunning
  if (available <= 0) return

  const jobs = db.prepare(
    "SELECT * FROM match_jobs WHERE status='pending' ORDER BY created_at ASC LIMIT ?"
  ).all(available)

  for (const job of jobs) {
    matchRunning++
    logger.info('Dispatching match job', { jobId: job.id, productId: job.shopee_product_id })
    runMatchJob(job).finally(() => {
      matchRunning--
    })
  }
}

/**
 * 启动调度器
 */
function startScheduler () {
  recoverStuckJobs()

  schedulerInterval = setInterval(() => {
    try {
      dispatchCrawl()
      dispatchMatch()
    } catch (err) {
      logger.error('Scheduler tick error', { error: err.message })
    }
  }, 2000)

  logger.info('Task scheduler started')
}

/**
 * 停止调度器
 */
function stopScheduler () {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    logger.info('Task scheduler stopped')
  }
}

module.exports = { startScheduler, stopScheduler }
