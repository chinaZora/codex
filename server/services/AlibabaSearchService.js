const axios = require('axios')
const cheerio = require('cheerio')
const puppeteer = require('puppeteer')
const logger = require('../utils/logger')
const { retry, sleep, createSemaphore } = require('../utils/retry')
const { getConfig } = require('./ConfigService')
const { filterSuppliers } = require('./SupplierFilterService')
const { computeSimilarity, computeCompositeScore } = require('./ImageSimilarityService')
const path = require('path')
const fs = require('fs')

const UPLOAD_DIR = path.join(__dirname, '../../uploads/shopee')
const imgLimit = createSemaphore(10)

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
 * 清洗关键词：去掉 emoji / 泰文 / 特殊符号，只保留中文+数字+字母
 * 返回空字符串表示该词不可用
 */
function cleanKeyword (kw) {
  if (!kw || typeof kw !== 'string') return ''
  // 去 emoji（代理对、杂项符号等）
  let s = kw.replace(/[\uD800-\uDFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '')
  // 去泰文
  s = s.replace(/[\u0E00-\u0E7F]+/g, ' ')
  // 去括号内容（通常是促销描述："买4送2"）
  s = s.replace(/[(\[【〔][^)\]】〕]*[)\]】〕]/g, ' ')
  // 只保留中文、英文字母、数字、常见连字符
  s = s.replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s-]/g, ' ')
  // 合并空格并裁剪
  s = s.replace(/\s+/g, ' ').trim()
  // 取前 30 字符
  return s.slice(0, 30).trim()
}

/**
 * 从清洗后的词中提取最精炼的搜索词（取最长的中文连续片段，最多12字）
 */
function extractCoreChinesePhrase (kw) {
  const cleaned = cleanKeyword(kw)
  const matches = cleaned.match(/[\u4e00-\u9fff\u3400-\u4dbf]{2,}/g)
  if (!matches) return cleaned.slice(0, 20)
  // 取最长的中文片段（最能代表品类）
  matches.sort((a, b) => b.length - a.length)
  return matches[0].slice(0, 12)
}

/**
 * 获取可用于 1688 搜索的中文关键词列表。
 * 若 DB 中的 keywords 全是泰文（翻译未成功），则调用 TranslatorService 实时重新翻译，
 * 并将结果回写到数据库，供后续匹配和展示使用。
 */
async function extractSearchTerms (product) {
  const db = require('../db/index')

  // 1. 尝试解析 DB 中已有的 keywords
  let stored = []
  try { stored = JSON.parse(product.keywords || '[]') } catch {}

  // 清洗后的中文关键词
  const cleanedStored = stored
    .map(k => cleanKeyword(k))
    .filter(k => hasChinese(k) && k.length >= 2)

  if (cleanedStored.length > 0) return cleanedStored

  // 2. title_cn 本身如果是中文，可以直接用
  const titleCn = product.title_cn || ''
  if (hasChinese(titleCn) && !hasThai(titleCn)) {
    const core = extractCoreChinesePhrase(titleCn)
    if (core.length >= 2) return [core]
  }

  // 3. 需要重新翻译
  logger.info('Keywords/title contain no Chinese, re-translating for 1688 match', { productId: product.id })
  const { translateAll } = require('./TranslatorService')
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

      const fresh = newKeywords
        .map(k => cleanKeyword(k))
        .filter(k => hasChinese(k) && k.length >= 2)
      if (fresh.length > 0) return fresh

      // keywords 仍然为空，用 title_cn 的核心中文短语
      const core = extractCoreChinesePhrase(newTitleCn)
      if (core.length >= 2) return [core]
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
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.1688.com/',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
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

  const $items = $('.list-item, [class*="offerlist-item"], .sm-offer-item, [data-offer-id]')

  $items.each((_, el) => {
    const $el = $(el)

    const titleLink = $el.find('[class*="title"] a, .offer-title a, h2 a').first()
    const title = titleLink.text().trim()
    const rawHref = titleLink.attr('href') || $el.find('a[href*="1688.com"]').first().attr('href') || ''
    const product_url = rawHref.startsWith('http') ? rawHref : (rawHref ? `https:${rawHref}` : '')

    const priceText = $el.find('[class*="price"], .price-text').first().text().replace(/[^0-9.]/g, '')
    const price = parseFloat(priceText) || 0

    const moqText = $el.find('[class*="moq"], [class*="min-order"], .trade-count').first().text()
    const moqMatch = moqText.match(/\d+/)
    const min_order = moqMatch ? parseInt(moqMatch[0]) : 1

    const shop_name = $el.find('.company-name a, [class*="company"] a, [class*="shop-name"]').first().text().trim()

    const scoreText = $el.find('[class*="score"], [class*="rating"], .rate-num').first().text()
    const scoreMatch = scoreText.match(/[\d.]+/)
    const shop_score = scoreMatch ? parseFloat(scoreMatch[0]) : 0

    const salesText = $el.find('[class*="sale"], [class*="sold"], .count-num').first().text()
    const sales_30d = parseInt(salesText.replace(/[^0-9]/g, '')) || 0

    // 标签提取：CSS选择器 + 全文关键词兜底
    const tags = []
    $el.find('[class*="tag"], [class*="label"], [class*="badge"], [class*="icon-text"]').each((_, t) => {
      const text = $(t).text().trim()
      if (text && text.length <= 20) tags.push(text)
    })
    const fullText = $el.text()
    for (const kw of ['实力商家', '包邮', '天猫', '诚信通', '7天无理由']) {
      if (fullText.includes(kw) && !tags.includes(kw)) tags.push(kw)
    }

    const imgEl = $el.find('img[src*="alicdn"], img[src*="1688"], img[data-src]').first()
    const rawImg = imgEl.attr('src') || imgEl.attr('data-src') || ''
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
      const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
      // Note: pass raw proxyUrl (e.g. "http://host:8080") — Chromium --proxy-server accepts host:port
      // This intentionally differs from ShopeeScraperService which strips the port (a limitation there)
      if (proxyUrl) args.push(`--proxy-server=${proxyUrl}`)
      browserRef.instance = await puppeteer.launch({ headless: 'new', args })
    }

    page = await browserRef.instance.newPage()
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

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

async function searchByKeyword (keyword, maxPages, cookie, proxyUrl) {
  const results = []
  const headers = buildHeaders(cookie)

  for (let p = 1; p <= maxPages; p++) {
    const url = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(keyword)}&n=y&page=${p}`
    try {
      await retry(async () => {
        const axiosConfig = {
          url, method: 'GET', headers,
          timeout: 20000, decompress: true, maxRedirects: 3
        }
        if (proxyUrl) {
          const u = new URL(proxyUrl)
          axiosConfig.proxy = { host: u.hostname, port: parseInt(u.port), protocol: u.protocol.replace(':', '') }
        }

        const resp = await axios(axiosConfig)
        const html = typeof resp.data === 'string' ? resp.data : String(resp.data)

        if (isLoginRedirect(html)) {
          throw new Error('LOGIN_REQUIRED: 1688 返回登录页，请在系统设置中配置有效的 1688 Cookie')
        }

        const items = parseSuppliers(html)
        results.push(...items)
        logger.info(`1688 keyword="${keyword}" page ${p}: ${items.length} suppliers`)

        if (p < maxPages) await sleep(1200 + Math.random() * 800)
      }, { retries: 2, baseDelay: 2000 })
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

  for (let i = 0; i < Math.min(searchTerms.length, 3); i++) {
    if (isCancelled()) break
    const term = searchTerms[i]
    const pages = pageLimits[i] || 1
    onProgress({ progress: 10 + i * 8, message: `搜索"${term}"...` })

    try {
      const hits = await searchByKeyword(term, pages, alibabaCookie, proxyUrl)
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

  // ── 3. 按 product_url 去重
  const seen = new Set()
  rawResults = rawResults.filter(s => {
    const key = s.product_url || s.title
    if (!key || seen.has(key)) return false
    seen.add(key)
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

  // ── 5. 图片相似度打分
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
      const compositeScore = computeCompositeScore(similarity, s.shop_score, s.sales_30d)
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
