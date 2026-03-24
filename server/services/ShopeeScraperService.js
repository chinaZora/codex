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
  return parseProductsFromHtml(resp.data)
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
    logger.warn('Rendered page scrape failed, fallback to raw HTML', { url: pageUrl, error: err.message })
    return fetchPageProductsByHttp(pageUrl, proxyUrl, extraHeaders)
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
 * 从Apify平台拉取商品
 */
async function fetchFromApify(keyword, pagesToCrawl, proxyUrl) {
  const apiToken = getConfig('apify_api_token')
  const actorId = getConfig('apify_actor_id') || 'best_scraper/shopee-scraper'

  if (!apiToken) throw new Error('请先在系统设置中配置Apify API Token')

  logger.info(`Starting Apify scrape for keyword="${keyword}", pages=${pagesToCrawl}`)

  try {
    // 1. 创建Actor运行任务
    const runResp = await axios.post(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiToken}`,
      {
        keyword,
        countryCode: 'TH',
        language: 'th',
        maxItemsPerPage: 60,
        maxPages: pagesToCrawl,
        proxyConfiguration: {
          useApifyProxy: true,
          apifyProxyGroups: ['SHOPEE', 'RESIDENTIAL']
        },
        extendOutputFunction: `({ item }) => {
          return {
            title: item.title,
            url: item.url,
            mainImage: item.mainImage,
            price: item.price,
            priceCurrency: item.priceCurrency,
            sold: item.sold,
            rating: item.rating,
            itemId: item.itemId,
            shopId: item.shopId
          }
        }`
      },
      {
        timeout: 60000,
        headers: { 'Content-Type': 'application/json' }
      }
    )

    const runId = runResp.data.data.id
    logger.info(`Apify run created: ${runId}`)

    // 2. 轮询任务状态直到完成（最长等待10分钟）
    let runStatus = 'RUNNING'
    for (let i = 0; i < 60; i++) {
      await sleep(10000) // 每10秒检查一次
      const statusResp = await axios.get(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${apiToken}`,
        { timeout: 15000 }
      )
      runStatus = statusResp.data.data.status
      logger.info(`Apify run ${runId} status: ${runStatus}`)
      if (runStatus === 'SUCCEEDED' || runStatus === 'FAILED' || runStatus === 'ABORTED') break
    }

    if (runStatus !== 'SUCCEEDED') throw new Error(`Apify任务运行失败: ${runStatus}`)

    // 3. 获取运行结果
    const resultResp = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiToken}&limit=1000`,
      { timeout: 30000 }
    )

    logger.info(`Apify returned ${resultResp.data.length} products`)

    // 4. 转换为系统统一的商品格式
    const exchangeRate = parseFloat(getConfig('exchange_rate') || '0.19')
    return resultResp.data.map(item => ({
      title_original: item.title || '',
      productUrl: item.url || '',
      imageUrl: item.mainImage || '',
      priceThb: parseFloat(item.price) || 0,
      sales: parseInt(item.sold) || 0,
      rating: parseFloat(item.rating) || 0,
      itemId: item.itemId || '',
      shopId: item.shopId || '',
      title_cn: '',
      keywords: [],
      price_cny: parseFloat(((item.price || 0) * exchangeRate).toFixed(2))
    }))
  } catch (err) {
    logger.error('Apify scrape failed', { error: err.message, response: err.response?.data })
    throw new Error(`Apify采集失败: ${err.message}`)
  }
}

/**
 * 主采集函数
 * @param {Object} job - { id, keyword, sort_by, url, pages_to_crawl, account_id, crawl_method }
 * @param {Object} callbacks - { onProgress, isCancelled }
 */
async function scrapeShopee (job, callbacks = {}) {
  const { onProgress = () => {}, isCancelled = () => false } = callbacks
  const proxyUrl = getConfig('proxy_url') || ''
  const baseDelay = parseInt(getConfig('crawl_page_delay_ms') || '2000')
  const exchangeRate = parseFloat(getConfig('exchange_rate') || '0.19')

  // 按采集方式选择对应的实现
  if (job.crawl_method === 'apify') {
    onProgress({ progress: 10, done: 0, message: '已提交Apify采集任务，等待执行...' })
    const products = await fetchFromApify(job.keyword, job.pages_to_crawl, proxyUrl)
    onProgress({ progress: 100, done: products.length, message: `Apify采集完成，共 ${products.length} 件` })
    return products
  } else if (job.crawl_method === 'api') {
    throw new Error('API通道采集功能开发中，请选择其他采集方式')
  }

  // 原有本地Puppeteer采集逻辑

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
