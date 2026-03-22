const axios = require('axios')
const cheerio = require('cheerio')
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const logger = require('../utils/logger')
const { retry, sleep } = require('../utils/retry')
const { getConfig } = require('./ConfigService')
const { translateAll } = require('./TranslatorService')
const db = require('../db/index')

const UPLOAD_DIR = path.join(__dirname, '../../uploads/shopee')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

// Googlebot UA 绕过反爬，Shopee SSR 对其返回完整 HTML
const CRAWL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive'
}

function parseSoldCount (text) {
  if (!text) return 0

  const normalized = String(text)
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const soldMatch = normalized.match(/(?:sold|销量|已售)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*([km])?\+?/i) ||
    normalized.match(/(\d+(?:\.\d+)?)\s*([km])?\+?\s*(?:sold|销量|已售)/i)

  if (!soldMatch) return 0

  const base = parseFloat(soldMatch[1])
  const unit = (soldMatch[2] || '').toLowerCase()
  if (Number.isNaN(base)) return 0
  if (unit === 'k') return Math.round(base * 1000)
  if (unit === 'm') return Math.round(base * 1000000)
  return Math.round(base)
}

/**
 * 用 axios 拉取 Shopee 搜索页 HTML，用 cheerio 解析商品列表
 * Shopee 对 Googlebot 返回完整 SSR HTML（含 40 件商品/页），无需 Puppeteer
 */
async function fetchPageProducts (pageUrl, proxyUrl, extraHeaders = {}) {
  const axiosConfig = {
    url: pageUrl,
    method: 'GET',
    headers: { ...CRAWL_HEADERS, ...extraHeaders },
    timeout: 20000,
    decompress: true,
    maxRedirects: 5
  }
  if (proxyUrl) {
    const u = new URL(proxyUrl)
    axiosConfig.proxy = { host: u.hostname, port: parseInt(u.port), protocol: u.protocol.replace(':', '') }
  }

  const resp = await axios(axiosConfig)
  const html = resp.data

  const $ = cheerio.load(html)
  const products = []

  $('[data-sqe="item"]').each((_, el) => {
    const $el = $(el)

    // 标题：img alt 属性最完整
    const title_original = $el.find('img[alt]').first().attr('alt')?.trim() || ''

    // 商品链接
    const href = $el.find('a[href]').first().attr('href') || ''
    const productUrl = href.startsWith('http') ? href : `https://shopee.co.th${href}`

    // 图片：取 susercontent CDN 图片
    const imageUrl = $el.find('img[src*="susercontent"]').first().attr('src') || ''

    // 价格：฿ 符号后的数字 span（aria-label="promotion price" 的兄弟 div 内）
    let priceThb = 0
    const priceDiv = $el.find('[aria-label="promotion price"]').closest('div').find('.truncate.text-base\\/5, [class*="text-base"]').first()
    const priceText = priceDiv.text().trim()
    if (priceText) {
      priceThb = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0
    }
    // 备用：找 ฿ 后的数字
    if (!priceThb) {
      const fullText = $el.text()
      const m = fullText.match(/฿\s*([\d,]+(?:\.\d+)?)/)
      if (m) priceThb = parseFloat(m[1].replace(/,/g, '')) || 0
    }

    // 评分
    const ratingText = $el.find('[aria-hidden="true"] .text-shopee-black87, [class*="text-shopee-black87"]').first().text().trim()
    const rating = parseFloat(ratingText) || 0

    // 销量：兼容 "1k+ sold" / "Sold 1.2k" / "已售 123"
    const sales = parseSoldCount($el.text())

    if (title_original || imageUrl) {
      products.push({ title_original, productUrl, imageUrl, priceThb, sales, rating })
    }
  })

  logger.info(`Fetched ${products.length} products from page`, { url: pageUrl })
  return products
}

/**
 * 下载图片到本地，返回本地路径
 */
async function downloadImage (imageUrl, productId) {
  const filename = `${productId}.jpg`
  const filepath = path.join(UPLOAD_DIR, filename)
  const relativePath = `/uploads/shopee/${filename}`

  if (fs.existsSync(filepath)) return relativePath

  try {
    const resp = await axios({ url: imageUrl, responseType: 'arraybuffer', timeout: 15000, headers: CRAWL_HEADERS })
    fs.writeFileSync(filepath, resp.data)
    return relativePath
  } catch (err) {
    logger.warn('Image download failed', { imageUrl, error: err.message })
    return null
  }
}

/**
 * 主采集函数
 * @param {Object} job - { id, keyword, sort_by, url, pages_to_crawl, account_id }
 * @param {Object} callbacks - { onProgress, isCancelled }
 */
async function scrapeShopee (job, callbacks = {}) {
  const { onProgress = () => {}, isCancelled = () => false } = callbacks
  const proxyUrl = getConfig('proxy_url') || ''
  const baseDelay = parseInt(getConfig('crawl_page_delay_ms') || '2000')
  const exchangeRate = parseFloat(getConfig('exchange_rate') || '0.19')

  // 查询账号 Cookie（若有）
  const extraHeaders = {}
  if (job.account_id) {
    const account = db.prepare('SELECT cookie FROM accounts WHERE id=?').get(job.account_id)
    if (account?.cookie) extraHeaders['Cookie'] = account.cookie
  }

  const allProducts = []

  for (let pageIdx = 0; pageIdx < job.pages_to_crawl; pageIdx++) {
    if (isCancelled()) {
      logger.info('Crawl job cancelled', { jobId: job.id })
      break
    }

    // 构建分页 URL
    let pageUrl
    if (job.keyword) {
      pageUrl = `https://shopee.co.th/search?keyword=${encodeURIComponent(job.keyword)}&sortBy=${job.sort_by || 'sales'}&page=${pageIdx}`
    } else {
      pageUrl = `${job.url}${job.url.includes('?') ? '&' : '?'}page=${pageIdx}`
    }

    let pageProducts = []
    await retry(async () => {
      pageProducts = await fetchPageProducts(pageUrl, proxyUrl, extraHeaders)
      if (pageProducts.length === 0) throw new Error('No products found on page')
    }, {
      retries: 2,
      baseDelay: 3000,
      onRetry: (n, e) => logger.warn(`Page ${pageIdx} retry ${n}`, { error: e.message })
    }).catch(err => {
      logger.warn(`Page ${pageIdx} failed, skipping`, { error: err.message })
    })

    // 批量翻译本页标题
    if (pageProducts.length > 0) {
      const titles = pageProducts.map(p => p.title_original)
      const translations = await translateAll(titles).catch(() => titles.map(() => null))
      pageProducts.forEach((p, i) => {
        p.title_cn = translations[i]?.title_cn || p.title_original
        p.keywords = translations[i]?.keywords || [p.title_original]
        p.price_cny = parseFloat((p.priceThb * exchangeRate).toFixed(2))
      })
      allProducts.push(...pageProducts)
    }

    const progress = Math.round(((pageIdx + 1) / job.pages_to_crawl) * 80)
    onProgress({ progress, done: allProducts.length, message: `第 ${pageIdx + 1}/${job.pages_to_crawl} 页完成，共 ${allProducts.length} 件` })

    if (pageIdx < job.pages_to_crawl - 1) {
      await sleep(baseDelay + Math.random() * 1500)
    }
  }

  return allProducts
}

module.exports = { scrapeShopee, downloadImage, UPLOAD_DIR }
