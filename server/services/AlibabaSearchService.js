const axios = require('axios')
const cheerio = require('cheerio')
const puppeteer = require('puppeteer')
const logger = require('../utils/logger')
const { retry, sleep, createSemaphore } = require('../utils/retry')
const { getConfig } = require('./ConfigService')
const { filterSuppliers } = require('./SupplierFilterService')
const { computeSimilarity, computeCompositeScore } = require('./ImageSimilarityService')
const { translateAll } = require('./TranslatorService')
const db = require('../db/index')
const path = require('path')
const fs = require('fs')

const UPLOAD_DIR = path.join(__dirname, '../../uploads/shopee')
const imgLimit = createSemaphore(10)

// User-Agent池，20+不同浏览器/版本
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.2210.121 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 OPR/106.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Brave/1.60.118',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/121.0.2277.106 Safari/537.36'
]

// Cookie池：支持配置多个Cookie轮询
let cookiePool = []
let currentCookieIndex = 0

// 初始化Cookie池
function initCookiePool () {
  const cookieConfig = getConfig('alibaba_cookie') || ''
  cookiePool = cookieConfig.split(/\|\|/).map(c => c.trim()).filter(Boolean)
  if (cookiePool.length === 0) cookiePool.push('')
  currentCookieIndex = Math.floor(Math.random() * cookiePool.length)
}

// 获取下一个Cookie（轮询）
function getNextCookie () {
  if (cookiePool.length === 0) initCookiePool()
  const cookie = cookiePool[currentCookieIndex]
  currentCookieIndex = (currentCookieIndex + 1) % cookiePool.length
  return cookie
}

// 获取随机User-Agent
function getRandomUA () {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

// 动态请求间隔：基础间隔+随机抖动，失败时指数退避
function getRequestDelay (retryCount = 0) {
  const base = 1500 + Math.random() * 1500 // 1500-3000ms
  return base * Math.pow(2, retryCount) // 指数退避
}

// ──────────────────────────────────────────────
// 关键词工具函数
// ──────────────────────────────────────────────

/** 是否含中文字符 */
function hasChinese (str) {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(str)
}

/** 是否含泰文字符 */
function hasThai (str) {
  return /[\u0E00-\u0E7F]/.test(str)
}

/**
 * 全角转半角
 */
function toHalfWidth (str) {
  return str.replace(/[\uff01-\uff5e]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
}

/**
 * 清洗关键词：去掉 emoji / 泰文 / 特殊符号，保留中文+数字+字母+必要特殊字符
 * 返回空字符串表示该词不可用
 */
function cleanKeyword (kw) {
  if (!kw || typeof kw !== 'string') return ''
  // 全角转半角
  let s = toHalfWidth(kw)
  // 去 emoji（代理对、杂项符号等）
  s = s.replace(/[\uD800-\uDFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '')
  // 去泰文
  s = s.replace(/[\u0E00-\u0E7F]+/g, ' ')
  // 保留常用单位、规格符号
  s = s.replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s\-+*#%℃°./]/g, ' ')
  // 合并空格并裁剪
  s = s.replace(/\s+/g, ' ').trim()
  // 取前 30 字符
  return s.slice(0, 30).trim()
}

/**
 * 从清洗后的词中提取多个核心中文短语，按权重排序（长度 + 位置优先级）
 * 返回短语数组，按搜索价值从高到低排列
 */
function extractCoreChinesePhrases (kw) {
  const cleaned = cleanKeyword(kw)
  const matches = cleaned.match(/[\u4e00-\u9fff\u3400-\u4dbf]{2,}/g)
  if (!matches) return [cleaned.slice(0, 20)].filter(Boolean)

  // 计算权重：长度占70%，位置越靠前权重越高占30%
  const weighted = matches.map((phrase, idx) => {
    const lengthScore = phrase.length * 0.7
    const positionScore = (matches.length - idx) * 0.3
    return { phrase, score: lengthScore + positionScore }
  })

  // 按权重降序排序，去重
  const seen = new Set()
  return weighted
    .sort((a, b) => b.score - a.score)
    .map(item => item.phrase.slice(0, 12))
    .filter(phrase => {
      if (seen.has(phrase) || phrase.length < 2) return false
      seen.add(phrase)
      return true
    })
}

/**
 * 获取可用于 1688 搜索的中文关键词列表。
 * 若 DB 中的 keywords 全是泰文（翻译未成功），则调用 TranslatorService 实时重新翻译，
 * 并将结果回写到数据库，供后续匹配和展示使用。
 */
async function extractSearchTerms (product) {
  // 1. 尝试解析 DB 中已有的 keywords
  let stored = []
  try { stored = JSON.parse(product.keywords || '[]') } catch {}

  // 清洗后的中文关键词，去重
  const seen = new Set()
  const cleanedStored = stored
    .map(k => cleanKeyword(k))
    .filter(k => {
      if (!hasChinese(k) || k.length < 2 || seen.has(k)) return false
      seen.add(k)
      return true
    })

  if (cleanedStored.length > 0) return cleanedStored

  // 2. title_cn 本身如果是中文，可以直接提取多个核心短语
  const titleCn = product.title_cn || ''
  if (hasChinese(titleCn) && !hasThai(titleCn)) {
    const cores = extractCoreChinesePhrases(titleCn)
    if (cores.length > 0) return cores
  }

  // 3. 需要重新翻译
  logger.info('Keywords/title contain no Chinese, re-translating for 1688 match', { productId: product.id })
  const sourceText = product.title_original || titleCn || ''
  if (!sourceText) return []

  try {
    const results = await translateAll([sourceText])
    const r = results[0]
    if (r && (r.title_cn || r.keywords)) {
      // 回写数据库，让下次直接命中缓存
      const newTitleCn = r.title_cn && hasChinese(r.title_cn) ? r.title_cn : titleCn
      const newKeywords = Array.isArray(r.keywords) ? r.keywords : []
      db.prepare("UPDATE shopee_products SET title_cn=?, keywords=?, updated_at=datetime('now') WHERE id=?")
        .run(newTitleCn, JSON.stringify(newKeywords), product.id)

      // 清洗并去重关键词
      const seenFresh = new Set()
      const fresh = newKeywords
        .map(k => cleanKeyword(k))
        .filter(k => {
          if (!hasChinese(k) || k.length < 2 || seenFresh.has(k)) return false
          seenFresh.add(k)
          return true
        })
      if (fresh.length > 0) return fresh

      // keywords 仍然为空，用 title_cn 的核心中文短语
      const cores = extractCoreChinesePhrases(newTitleCn)
      if (cores.length > 0) return cores
    }
  } catch (err) {
    logger.warn('Re-translation failed', { productId: product.id, error: err.message })
  }

  return []
}

// ──────────────────────────────────────────────
// HTTP / 解析层
// ──────────────────────────────────────────────

function buildHeaders (cookie) {
  const headers = {
    'User-Agent': getRandomUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://s.1688.com/',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-site',
    'Upgrade-Insecure-Requests': '1'
  }
  if (cookie) headers['Cookie'] = cookie
  return headers
}

function isLoginRedirect (html) {
  return (
    html.includes('login.1688.com') ||
    html.includes('login.taobao.com') ||
    html.includes('member/signin') ||
    html.length < 8000
  )
}

function parseCookieHeader (cookieHeader = '') {
  return cookieHeader
    .split(/;\s*/)
    .map(part => {
      const idx = part.indexOf('=')
      if (idx <= 0) return null
      return { name: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim() }
    })
    .filter(Boolean)
}

function isSpaShell (html) {
  const $ = cheerio.load(html)
  const productNodes = $('[data-offer-id], .list-item, [class*="offerlist-item"]').length
  const scriptCount = (html.match(/<script\s+src=/g) || []).length
  return productNodes < 1 && scriptCount > 5
}

function parseSuppliers (html) {
  const $ = cheerio.load(html)
  const suppliers = []

  // 多套选择器适配不同页面结构
  const itemSelectors = [
    '.list-item', '[class*="offerlist-item"]', '.sm-offer-item',
    '[data-offer-id]', '.offer-item', '.product-item', '.goods-item'
  ]
  const $items = $(itemSelectors.join(', '))

  $items.each((_, el) => {
    const $el = $(el)

    // 标题+链接：多选择器 fallback
    const titleSelectors = [
      '[class*="title"] a', '.offer-title a', 'h2 a', '.product-title a',
      '.goods-title a', '[class*="name"] a'
    ]
    const titleLink = $el.find(titleSelectors.join(', ')).first()
    const title = titleLink.text().trim()

    const linkSelectors = [
      'a[href*="1688.com"]', 'a[href*="offer/"]', 'a.item-link', 'a.product-link'
    ]
    const rawHref = titleLink.attr('href') || $el.find(linkSelectors.join(', ')).first().attr('href') || ''
    const product_url = rawHref.startsWith('http') ? rawHref : (rawHref ? `https:${rawHref}` : '')

    // 价格解析：支持区间取最低价
    const priceSelectors = [
      '[class*="price"]', '.price-text', '.goods-price', '.product-price',
      '[class*="cost"]', '[data-price]'
    ]
    const priceText = $el.find(priceSelectors.join(', ')).first().text()
    // 匹配所有价格数字，取最小的
    const priceMatches = priceText.match(/(\d+\.?\d*)/g)
    const price = priceMatches && priceMatches.length > 0
      ? Math.min(...priceMatches.map(p => parseFloat(p)).filter(Boolean))
      : 0

    // MOQ解析：增强正则，支持各种单位
    const moqSelectors = [
      '[class*="moq"]', '[class*="min-order"]', '.trade-count',
      '.min-order-num', '[class*="起订"]', '.order-num'
    ]
    const moqText = $el.find(moqSelectors.join(', ')).first().text()
    // 支持格式："≥2件", "起订量10", "MOQ 5PCS", "2起批"
    const moqMatch = moqText.match(/(?:≥|>=|起订|起批|MOQ|min\s*order)?\s*(\d+)/i)
    const min_order = moqMatch ? parseInt(moqMatch[1]) : 1

    // 店铺名称
    const shopSelectors = [
      '.company-name a', '[class*="company"] a', '[class*="shop-name"]',
      '.store-name a', '.seller-name a'
    ]
    const shop_name = $el.find(shopSelectors.join(', ')).first().text().trim()

    // 店铺评分
    const scoreSelectors = [
      '[class*="score"]', '[class*="rating"]', '.rate-num',
      '.shop-score', '[class*="信用"]'
    ]
    const scoreText = $el.find(scoreSelectors.join(', ')).first().text()
    const scoreMatch = scoreText.match(/[\d.]+/)
    const shop_score = scoreMatch ? parseFloat(scoreMatch[0]) : 0

    // 销量解析：支持"1000+", "1.2万"等格式
    const salesSelectors = [
      '[class*="sale"]', '[class*="sold"]', '.count-num',
      '.sales-volume', '[class*="成交"]', '[class*="销量"]'
    ]
    const salesText = $el.find(salesSelectors.join(', ')).first().text()
    let sales_30d = 0
    const salesMatch = salesText.match(/(\d+\.?\d*)\s*(\+|万|k|千)?/i)
    if (salesMatch) {
      sales_30d = parseFloat(salesMatch[1])
      const unit = salesMatch[2]?.toLowerCase()
      if (unit === '万' || unit === 'w') sales_30d *= 10000
      if (unit === '千' || unit === 'k') sales_30d *= 1000
    }
    sales_30d = Math.round(sales_30d)

    // 标签提取：CSS选择器 + 全文关键词兜底
    const tags = []
    const tagSelectors = [
      '[class*="tag"]', '[class*="label"]', '[class*="badge"]',
      '[class*="icon-text"]', '.service-tag', '.promotion-tag'
    ]
    $el.find(tagSelectors.join(', ')).each((_, t) => {
      const text = $(t).text().trim()
      if (text && text.length <= 20 && !tags.includes(text)) tags.push(text)
    })
    const fullText = $el.text()
    for (const kw of ['实力商家', '包邮', '天猫', '诚信通', '7天无理由', '极速退款', '一件代发', '正品保障']) {
      if (fullText.includes(kw) && !tags.includes(kw)) tags.push(kw)
    }

    // 图片提取
    const imgSelectors = [
      'img[src*="alicdn"]', 'img[src*="1688"]', 'img[data-src]',
      'img.product-img', 'img.goods-img', 'img.item-img'
    ]
    const imgEl = $el.find(imgSelectors.join(', ')).first()
    const rawImg = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy') || ''
    const image_url = rawImg.startsWith('http') ? rawImg : (rawImg ? `https:${rawImg}` : '')

    if (title || product_url) {
      suppliers.push({ title, price, min_order, shop_name, shop_score, sales_30d, tags: JSON.stringify(tags), product_url, image_url })
    }
  })

  return suppliers
}

async function searchByKeywordPuppeteer (keyword, pageNum, cookie, proxyUrl, browserRef) {
  const url = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(keyword)}&n=y&page=${pageNum}`
  let page = null
  try {
    // Lazily launch browser on first Puppeteer need
    if (!browserRef.instance) {
      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
        '--disable-infobars',
        '--disable-extensions'
      ]
      // Note: pass raw proxyUrl (e.g. "http://host:8080") — Chromium --proxy-server accepts host:port
      // This intentionally differs from ShopeeScraperService which strips the port (a limitation there)
      if (proxyUrl) args.push(`--proxy-server=${proxyUrl}`)
      browserRef.instance = await puppeteer.launch({
        headless: 'new',
        args,
        defaultViewport: { width: 1920, height: 1080 }
      })
    }

    page = await browserRef.instance.newPage()
    // 随机User-Agent，反爬虫指纹
    await page.setUserAgent(getRandomUA())
    // 移除webdriver指纹
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      window.chrome = { runtime: {} }
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] })
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] })
    })

    // Inject 1688 cookie — leading dot covers s.1688.com and all subdomains
    if (cookie) {
      const cookies = parseCookieHeader(cookie)
      if (cookies.length > 0) {
        await page.setCookie(...cookies.map(c => ({ ...c, domain: '.1688.com', path: '/' })))
      }
    }

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // Soft wait for product container — proceed even if not found
    await page.waitForSelector('[data-offer-id], .list-item, [class*="offerlist-item"]', { timeout: 15000 })
      .catch(() => {})

    const html = await page.content()

    if (isLoginRedirect(html)) {
      throw new Error('LOGIN_REQUIRED: 1688 返回登录页，请在系统设置中配置有效的 1688 Cookie')
    }

    return parseSuppliers(html)
  } catch (err) {
    if (err.message.startsWith('LOGIN_REQUIRED')) throw err
    logger.warn('1688 Puppeteer page failed', { keyword, pageNum, error: err.message })
    return []
  } finally {
    if (page) await page.close().catch(() => {})
  }
}

async function searchByKeyword (keyword, maxPages, proxyUrl, browserRef = {}) {
  const results = []
  initCookiePool() // 初始化Cookie池

  for (let p = 1; p <= maxPages; p++) {
    const url = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(keyword)}&n=y&page=${p}`
    try {
      await retry(async (retryCount) => {
        // 每次请求用新的UA和Cookie
        const cookie = getNextCookie()
        const headers = buildHeaders(cookie)

        const axiosConfig = {
          url, method: 'GET', headers,
          timeout: 25000, decompress: true, maxRedirects: 2
        }
        if (proxyUrl) {
          const u = new URL(proxyUrl)
          axiosConfig.proxy = { host: u.hostname, port: parseInt(u.port), protocol: u.protocol.replace(':', '') }
        }

        const resp = await axios(axiosConfig)
        const html = typeof resp.data === 'string' ? resp.data : String(resp.data)

        if (isLoginRedirect(html)) {
          // Cookie失效，尝试下一个Cookie
          if (cookiePool.length > 1) {
            logger.warn('Cookie returned login page, rotating to next cookie')
            throw new Error('RETRY_WITH_NEW_COOKIE')
          }
          throw new Error('LOGIN_REQUIRED: 1688 返回登录页，请在系统设置中配置有效的 1688 Cookie')
        }

        // IMPORTANT: must be `let` (not `const`) — reassigned by Puppeteer fallback below
        let items = parseSuppliers(html)

        // SPA fallback: overseas IPs get a React shell with no product data
        if (items.length === 0 && isSpaShell(html)) {
          logger.info(`1688 SPA detected, falling back to Puppeteer for keyword="${keyword}" page ${p}`)
          items = await searchByKeywordPuppeteer(keyword, p, cookie, proxyUrl, browserRef)
        }

        results.push(...items)
        logger.info(`1688 keyword="${keyword}" page ${p}: ${items.length} suppliers`)

        if (p < maxPages) await sleep(getRequestDelay())
      }, {
        retries: 3,
        baseDelay: 2000,
        onRetry: (n, e) => {
          logger.warn(`1688 page ${p} retry ${n}`, { error: e.message })
          // 失败时增加间隔
          return sleep(getRequestDelay(n))
        }
      })
    } catch (err) {
      logger.warn(`1688 page ${p} failed`, { keyword, error: err.message })
      if (err.message.startsWith('LOGIN_REQUIRED')) throw err
    }
  }

  return results
}

// ──────────────────────────────────────────────
// 主匹配函数
// ──────────────────────────────────────────────

/**
 * @param {Object} product - shopee_products 记录
 * @param {Object} callbacks - { onProgress, isCancelled }
 */
async function matchProduct (product, callbacks = {}) {
  const { onProgress = () => {}, isCancelled = () => false } = callbacks
  const proxyUrl = getConfig('proxy_url') || ''
  const alibabaCookie = getConfig('alibaba_cookie') || ''
  const exchangeRate = parseFloat(getConfig('exchange_rate') || '0.19')
  const shopeePriceCny = product.price_cny || (product.price_thb * exchangeRate)

  // ── 1. 获取可用的中文搜索词（含自动重翻译）
  onProgress({ progress: 5, message: '准备搜索关键词...' })
  const searchTerms = await extractSearchTerms(product)

  if (searchTerms.length === 0) {
    logger.warn('No usable Chinese keywords — product cannot be matched', { productId: product.id, title: product.title_original })
    return []
  }

  logger.info('1688 search terms', { productId: product.id, terms: searchTerms })

  // ── 2. 多关键词搜索：主词3页 + 次词2页 + 第三词1页
  const pageLimits = [3, 2, 1]
  let rawResults = []
  const browserRef = { instance: null }

  try {
    for (let i = 0; i < Math.min(searchTerms.length, 3); i++) {
      if (isCancelled()) break
      const term = searchTerms[i]
      const pages = pageLimits[i] || 1
      onProgress({ progress: 10 + i * 8, message: `搜索"${term}"...` })

      try {
        const hits = await searchByKeyword(term, pages, proxyUrl, browserRef)
        rawResults.push(...hits)
        logger.info(`Keyword "${term}": ${hits.length} raw results`)
      } catch (err) {
        if (err.message.startsWith('LOGIN_REQUIRED')) {
          logger.error('1688 login required', { productId: product.id })
          return []
        }
        logger.warn('Keyword search failed', { term, error: err.message })
      }

      if (rawResults.length >= 60) break // 已够用，不继续翻页
    }
  } finally {
    if (browserRef.instance) await browserRef.instance.close().catch(() => {})
  }

  // ── 3. 智能去重：URL + 标题相似度 + 价格维度
  const seenUrls = new Set()
  const seenTitles = new Set()
  rawResults = rawResults.filter(s => {
    // 先按URL去重
    if (s.product_url && seenUrls.has(s.product_url)) return false
    if (s.product_url) seenUrls.add(s.product_url)

    // 标题相似度去重：去掉特殊字符后比较核心内容
    const cleanTitle = s.title.replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]/g, '').toLowerCase()
    if (cleanTitle.length > 10 && seenTitles.has(cleanTitle)) return false
    if (cleanTitle.length > 10) seenTitles.add(cleanTitle)

    return true
  })
  logger.info(`Total unique raw results: ${rawResults.length}`, { productId: product.id })

  // ── 4. 供应商过滤
  let filtered = filterSuppliers(rawResults, shopeePriceCny)

  // 过滤后为空 → 放宽进价限制再试（只用价格兜底，保证至少有候选）
  if (filtered.length === 0 && rawResults.length > 0) {
    logger.info('No suppliers passed filter, relaxing price ratio to 0.9 for fallback', { productId: product.id })
    filtered = rawResults
      .filter(s => (parseFloat(s.price) || 0) <= shopeePriceCny * 0.9)
      .slice(0, 20)
  }

  if (isCancelled()) return []

  onProgress({ progress: 50, message: `过滤后 ${filtered.length} 个供应商，计算图片相似度...` })

  // ── 5. 图片相似度打分 + 综合评分
  const localImagePath = product.image_path
    ? path.join(__dirname, '../../', product.image_path)
    : null

  const suppliersWithScore = await Promise.all(
    filtered.map((s, i) => imgLimit(async () => {
      if (isCancelled()) return null
      let similarity = -1
      if (localImagePath && fs.existsSync(localImagePath) && s.image_url) {
        similarity = await computeSimilarity(localImagePath, s.image_url)
      }

      // 计算价格比率：1688价格 / Shopee人民币价格（越低越有优势）
      const priceRatio = s.price > 0 && shopeePriceCny > 0 ? s.price / shopeePriceCny : 1

      // 解析标签
      let tags = []
      try {
        tags = JSON.parse(s.tags || '[]')
      } catch (_) {}

      const compositeScore = computeCompositeScore(
        similarity,
        s.shop_score,
        s.sales_30d,
        s.min_order,
        priceRatio,
        tags
      )
      const scoreDegraded = similarity < 0 ? 1 : 0
      onProgress({
        progress: 50 + Math.round((i + 1) / filtered.length * 45),
        message: `评估供应商 ${i + 1}/${filtered.length}`
      })
      return { ...s, image_similarity: similarity, composite_score: compositeScore, score_degraded: scoreDegraded }
    }))
  )

  return suppliersWithScore
    .filter(Boolean)
    .filter(s => s.image_similarity >= 0.3 || s.image_similarity < 0)
    .sort((a, b) => b.composite_score - a.composite_score)
}

module.exports = { matchProduct }
