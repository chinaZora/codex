const axios = require('axios')
const cheerio = require('cheerio')
const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer')
const { v4: uuidv4 } = require('uuid')
const logger = require('../utils/logger')
const { retry, sleep } = require('../utils/retry')
const { getConfig } = require('./ConfigService')
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

const SHOPEE_ROOT_URL = 'https://shopee.co.th'
const DEFAULT_BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function parseSoldCount (text) {
  if (!text) return 0

  const normalized = String(text)
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const soldMatch = normalized.match(/(?:sold|销量|已售|ขายแล้ว)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*([km]|พัน|หมื่น|แสน|ล้าน)?\+?/i) ||
    normalized.match(/(\d+(?:\.\d+)?)\s*([km]|พัน|หมื่น|แสน|ล้าน)?\+?\s*(?:sold|销量|已售|ขายแล้ว|ชิ้นขายแล้ว)/i) ||
    normalized.match(/(?:ขายไปแล้ว|ขายแล้ว)\s*(\d+(?:\.\d+)?)\s*([km]|พัน|หมื่น|แสน|ล้าน)?\+?/i)

  if (!soldMatch) return 0

  const base = parseFloat(soldMatch[1])
  const unit = (soldMatch[2] || '').toLowerCase()
  if (Number.isNaN(base)) return 0
  if (unit === 'k') return Math.round(base * 1000)
  if (unit === 'm') return Math.round(base * 1000000)
  if (unit === 'พัน') return Math.round(base * 1000)
  if (unit === 'หมื่น') return Math.round(base * 10000)
  if (unit === 'แสน') return Math.round(base * 100000)
  if (unit === 'ล้าน') return Math.round(base * 1000000)
  return Math.round(base)
}

function extractShopeeIds (productUrl = '', fallbackUrl = '') {
  const candidates = [productUrl, fallbackUrl].filter(Boolean)
  for (const value of candidates) {
    const decoded = decodeURIComponent(value)
    const slugMatch = decoded.match(/-i\.(\d+)\.(\d+)/)
    if (slugMatch) {
      return { shopId: slugMatch[1], itemId: slugMatch[2] }
    }

    try {
      const url = new URL(value.startsWith('http') ? value : `${SHOPEE_ROOT_URL}${value}`)
      const itemId = url.searchParams.get('itemid') || url.searchParams.get('item_id')
      const shopId = url.searchParams.get('shopid') || url.searchParams.get('shop_id')
      if (itemId && shopId) return { itemId, shopId }
    } catch {}
  }
  return { itemId: null, shopId: null }
}

function buildProxyConfig (proxyUrl) {
  if (!proxyUrl) return null
  const u = new URL(proxyUrl)
  return { host: u.hostname, port: parseInt(u.port), protocol: u.protocol.replace(':', '') }
}

function buildItemApiHeaders (productUrl, extraHeaders = {}) {
  return {
    ...CRAWL_HEADERS,
    ...extraHeaders,
    'Accept': 'application/json, text/plain, */*',
    'Referer': productUrl || `${SHOPEE_ROOT_URL}/`,
    'X-Requested-With': 'XMLHttpRequest'
  }
}

function extractHistoricalSold (payload) {
  if (!payload || typeof payload !== 'object') return 0

  const candidates = [
    payload?.item?.historical_sold,
    payload?.data?.item?.historical_sold,
    payload?.data?.historical_sold,
    payload?.historical_sold
  ]
  for (const value of candidates) {
    const sold = parseInt(value)
    if (sold > 0) return sold
  }
  return 0
}

function resolveChromeExecutablePath () {
  try {
    const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    if (fs.existsSync(localChrome)) return localChrome
    return puppeteer.executablePath()
  } catch {
    return undefined
  }
}

function parseCookieHeader (cookieHeader = '') {
  return cookieHeader
    .split(/;\s*/)
    .map(part => {
      const idx = part.indexOf('=')
      if (idx <= 0) return null
      return {
        name: part.slice(0, idx).trim(),
        value: part.slice(idx + 1).trim()
      }
    })
    .filter(Boolean)
}

async function createShopeeBrowser (proxyUrl = '') {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1440,900'
  ]
  if (proxyUrl) {
    const proxy = new URL(proxyUrl)
    args.push(`--proxy-server=${proxy.protocol}//${proxy.host}`)
  }

  return puppeteer.launch({
    headless: 'new',
    executablePath: resolveChromeExecutablePath(),
    args
  })
}

async function prepareShopeePage (browser, extraHeaders = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await page.setUserAgent(DEFAULT_BROWSER_UA)
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
    ...Object.fromEntries(Object.entries(extraHeaders).filter(([key]) => key.toLowerCase() !== 'cookie'))
  })
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

  const cookies = parseCookieHeader(extraHeaders.Cookie)
  if (cookies.length > 0) {
    await page.setCookie(...cookies.map(cookie => ({
      ...cookie,
      domain: '.shopee.co.th',
      path: '/',
      httpOnly: false,
      secure: true
    })))
  }

  return page
}

function parseProductsFromHtml (html) {
  const $ = cheerio.load(html)
  const products = []

  $('[data-sqe="item"]').each((_, el) => {
    const $el = $(el)

    const title_original = $el.find('img[alt]').first().attr('alt')?.trim() || ''
    const href = $el.find('a[href]').first().attr('href') || ''
    const productUrl = href.startsWith('http') ? href : `${SHOPEE_ROOT_URL}${href}`
    const similarProductsUrl = $el.find('a[href*="/find_similar_products"]').last().attr('href') || ''

    const imageUrl = $el.find('img[src*="susercontent"], img[src*="img.susercontent"]').first().attr('src') || ''

    let priceThb = 0
    const textContent = $el.text().replace(/\s+/g, ' ').trim()
    const priceDiv = $el.find('[aria-label="promotion price"]').closest('div').find('.truncate.text-base\\/5, [class*="text-base"]').first()
    const priceText = priceDiv.text().trim()
    if (priceText) priceThb = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0
    if (!priceThb) {
      const priceMatch = textContent.match(/฿\s*([\d,]+(?:\.\d+)?)/)
      if (priceMatch) priceThb = parseFloat(priceMatch[1].replace(/,/g, '')) || 0
    }

    const ratingText = $el.find('[aria-hidden="true"] .text-shopee-black87, [class*="text-shopee-black87"]').first().text().trim()
    const rating = parseFloat(ratingText) || 0
    const sales = parseSoldCount(textContent)

    if (title_original || imageUrl) {
      const { itemId, shopId } = extractShopeeIds(productUrl, similarProductsUrl)
      products.push({ title_original, productUrl, imageUrl, priceThb, sales, rating, itemId, shopId, similarProductsUrl })
    }
  })

  return products
}

function normalizeDomProduct (product) {
  const title_original = (product.title_original || '').trim()
  const productUrl = product.productUrl
    ? (product.productUrl.startsWith('http') ? product.productUrl : `${SHOPEE_ROOT_URL}${product.productUrl}`)
    : ''
  const similarProductsUrl = product.similarProductsUrl || ''
  const imageUrl = product.imageUrl || ''
  const priceThb = parseFloat(product.priceThb) || 0
  const rating = parseFloat(product.rating) || 0
  const textContent = [product.textContent, product.ariaLabels].filter(Boolean).join(' ')
  const sales = parseSoldCount(textContent)
  const { itemId, shopId } = extractShopeeIds(productUrl, similarProductsUrl)

  return {
    title_original,
    productUrl,
    imageUrl,
    priceThb,
    sales,
    rating,
    itemId,
    shopId,
    similarProductsUrl
  }
}

/**
 * 用浏览器渲染 Shopee 搜索页，再从渲染后的 DOM 解析商品列表。
 */
async function fetchPageProductsByHttp (pageUrl, proxyUrl, extraHeaders = {}) {
  const axiosConfig = {
    url: pageUrl,
    method: 'GET',
    headers: { ...CRAWL_HEADERS, ...extraHeaders },
    timeout: 20000,
    decompress: true,
    maxRedirects: 5
  }
  if (proxyUrl) axiosConfig.proxy = buildProxyConfig(proxyUrl)
  const resp = await axios(axiosConfig)
  const products = parseProductsFromHtml(resp.data)
  logger.info(`Fetched ${products.length} products from HTTP fallback`, { url: pageUrl })
  return products
}

async function fetchPageProducts (browser, pageUrl, proxyUrl, extraHeaders = {}) {
  const page = await prepareShopeePage(browser, extraHeaders)
  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2500)
    await page.waitForSelector('[data-sqe="item"]', { timeout: 30000 })
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2)
    })
    await page.waitForTimeout(1200)
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
    })
    await page.waitForTimeout(1200)
    const domProducts = await page.$$eval('[data-sqe="item"]', items => {
      const readText = node => (node && node.textContent ? node.textContent.replace(/\s+/g, ' ').trim() : '')
      const readAttr = (node, attr) => (node && node.getAttribute ? (node.getAttribute(attr) || '') : '')

      return items.map(item => {
        const titleImg = item.querySelector('img[alt]')
        const productLink = item.querySelector('a[href]:not([href*="/find_similar_products"])')
        const similarLink = item.querySelector('a[href*="/find_similar_products"]')
        const image = item.querySelector('img[src*="susercontent"], img[src*="img.susercontent"]')
        const priceNode = item.querySelector('[aria-label="promotion price"]')?.closest('div')?.querySelector('.truncate.text-base\\/5, [class*="text-base"]')
        const ratingNode = item.querySelector('[class*="text-shopee-black87"]')
        const rawText = readText(item)
        const ariaLabels = Array.from(item.querySelectorAll('[aria-label]'))
          .map(el => el.getAttribute('aria-label') || '')
          .join(' ')

        let priceThb = 0
        const priceText = readText(priceNode)
        if (priceText) {
          priceThb = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0
        }
        if (!priceThb) {
          const match = rawText.match(/฿\s*([\d,]+(?:\.\d+)?)/)
          if (match) priceThb = parseFloat(match[1].replace(/,/g, '')) || 0
        }

        return {
          title_original: readAttr(titleImg, 'alt'),
          productUrl: readAttr(productLink, 'href'),
          similarProductsUrl: readAttr(similarLink, 'href'),
          imageUrl: readAttr(image, 'src') || readAttr(image, 'data-src'),
          priceThb,
          rating: parseFloat(readText(ratingNode)) || 0,
          textContent: rawText,
          ariaLabels
        }
      })
    })
    const products = domProducts.map(normalizeDomProduct).filter(product => product.title_original || product.imageUrl)
    if (products.length > 0) {
      logger.info(`Fetched ${products.length} products from rendered page`, { url: pageUrl })
      return products
    }

    const html = await page.content()
    const fallbackProducts = parseProductsFromHtml(html)
    logger.info(`Rendered page had no parsed products, fallback parsed ${fallbackProducts.length}`, { url: pageUrl })
    return fallbackProducts
  } catch (err) {
    let debugInfo = {}
    try {
      const [pageTitle, currentUrl, userAgent, pageText] = await Promise.all([
        page.title().catch(() => ''),
        Promise.resolve(page.url()).catch(() => ''),
        page.evaluate(() => navigator.userAgent).catch(() => ''),
        page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 500)).catch(() => '')
      ])
      debugInfo = {
        pageTitle,
        currentUrl,
        userAgent,
        pageTextPreview: pageText
      }
    } catch {}

    logger.warn('Rendered page scrape failed, fallback to raw HTML', {
      url: pageUrl,
      error: err.message,
      ...debugInfo
    })
    const fallbackProducts = await fetchPageProductsByHttp(pageUrl, proxyUrl, extraHeaders)
    logger.info(`Using HTTP fallback results after rendered page failure`, {
      url: pageUrl,
      products: fallbackProducts.length
    })
    return fallbackProducts
  } finally {
    await page.close().catch(() => {})
  }
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
  const browser = await createShopeeBrowser(proxyUrl)

  try {
    for (let pageIdx = 0; pageIdx < job.pages_to_crawl; pageIdx++) {
      if (isCancelled()) {
        logger.info('Crawl job cancelled', { jobId: job.id })
        break
      }

      let pageUrl
      if (job.keyword) {
        pageUrl = `https://shopee.co.th/search?keyword=${encodeURIComponent(job.keyword)}&sortBy=${job.sort_by || 'sales'}&page=${pageIdx}`
      } else {
        pageUrl = `${job.url}${job.url.includes('?') ? '&' : '?'}page=${pageIdx}`
      }

      let pageProducts = []
      await retry(async () => {
        pageProducts = await fetchPageProducts(browser, pageUrl, proxyUrl, extraHeaders)
        if (pageProducts.length === 0) throw new Error('No products found on page')
      }, {
        retries: 2,
        baseDelay: 3000,
        onRetry: (n, e) => logger.warn(`Page ${pageIdx} retry ${n}`, { error: e.message })
      }).catch(err => {
        logger.warn(`Page ${pageIdx} failed, skipping`, { error: err.message })
      })

      if (pageProducts.length > 0) {
        pageProducts.forEach((p, i) => {
          p.title_cn = ''
          p.keywords = []
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
  } finally {
    await browser.close().catch(() => {})
  }

  return allProducts
}

module.exports = { scrapeShopee, downloadImage, UPLOAD_DIR, parseSoldCount, extractShopeeIds, extractHistoricalSold }
