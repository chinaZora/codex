# 1688 Puppeteer Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 1688 supplier search returning 0 results on overseas IPs by adding a Puppeteer fallback when the axios path detects a React SPA shell.

**Architecture:** The existing axios path runs first (fast, works on Mac/CN IP). If it gets 0 results and `isSpaShell()` detects a JS-only page, `searchByKeywordPuppeteer` launches a headless browser, injects the 1688 cookie, waits for product DOM to render, then feeds the HTML to the unchanged `parseSuppliers`. The browser is owned by `matchProduct` via a `browserRef` wrapper and closed in a `finally` block.

**Tech Stack:** Node.js, Puppeteer (already in package.json), Cheerio (already used), existing `AlibabaSearchService.js` patterns.

---

## Files

- Modify: `server/services/AlibabaSearchService.js` — only file that changes

---

### Task 1: Add `puppeteer` require and `isSpaShell` helper

**Files:**
- Modify: `server/services/AlibabaSearchService.js:1-10` (add require) and after `isLoginRedirect` (add helper)

- [ ] **Step 1: Add puppeteer require at top of file**

Open `server/services/AlibabaSearchService.js`. The current requires are:
```js
const axios = require('axios')
const cheerio = require('cheerio')
...
```

Add `puppeteer` after `cheerio`:
```js
const axios = require('axios')
const cheerio = require('cheerio')
const puppeteer = require('puppeteer')
```

- [ ] **Step 2: Add `parseCookieHeader` helper after the `buildHeaders` function (around line 134)**

```js
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
```

- [ ] **Step 3: Add `isSpaShell` helper after `parseCookieHeader`**

```js
function isSpaShell (html) {
  const $ = cheerio.load(html)
  const productNodes = $('[data-offer-id], .list-item, [class*="offerlist-item"]').length
  const scriptCount = (html.match(/<script\s+src=/g) || []).length
  return productNodes < 1 && scriptCount > 5
}
```

- [ ] **Step 4: Start the server to verify no syntax errors**

Run: `node -e "require('./server/services/AlibabaSearchService.js'); console.log('OK')"`

Expected output: `OK` (no errors)

- [ ] **Step 5: Commit**

```bash
git add server/services/AlibabaSearchService.js
git commit -m "feat: add isSpaShell helper and puppeteer require to AlibabaSearchService"
```

---

### Task 2: Add `searchByKeywordPuppeteer` function

**Files:**
- Modify: `server/services/AlibabaSearchService.js` — add new function before `searchByKeyword`

- [ ] **Step 1: Add `searchByKeywordPuppeteer` function**

Insert this function directly before the existing `searchByKeyword` function (currently around line 198):

```js
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
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node -e "require('./server/services/AlibabaSearchService.js'); console.log('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add server/services/AlibabaSearchService.js
git commit -m "feat: add searchByKeywordPuppeteer to AlibabaSearchService"
```

---

### Task 3: Update `searchByKeyword` to accept `browserRef` and trigger fallback

**Files:**
- Modify: `server/services/AlibabaSearchService.js:198-235` — update `searchByKeyword` signature and add fallback

- [ ] **Step 1: Update `searchByKeyword` signature and add Puppeteer fallback**

Replace the current `searchByKeyword` function with:

```js
async function searchByKeyword (keyword, maxPages, cookie, proxyUrl, browserRef = {}) {
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

        // IMPORTANT: must be `let` (not `const`) — reassigned by Puppeteer fallback below
        let items = parseSuppliers(html)

        // SPA fallback: overseas IPs get a React shell with no product data
        if (items.length === 0 && isSpaShell(html)) {
          logger.info(`1688 SPA detected, falling back to Puppeteer for keyword="${keyword}" page ${p}`)
          items = await searchByKeywordPuppeteer(keyword, p, cookie, proxyUrl, browserRef)
        }

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
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node -e "require('./server/services/AlibabaSearchService.js'); console.log('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add server/services/AlibabaSearchService.js
git commit -m "feat: add SPA detection and Puppeteer fallback in searchByKeyword"
```

---

### Task 4: Update `matchProduct` to manage browser lifecycle

**Files:**
- Modify: `server/services/AlibabaSearchService.js:245-286` — update `matchProduct` keyword loop

- [ ] **Step 1: Add `browserRef` and `finally` block to `matchProduct`**

In `matchProduct`, find the keyword search loop (section `// ── 2. 多关键词搜索`). Wrap it with `browserRef` and a `finally` block:

Replace this section:
```js
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
```

With:
```js
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
        const hits = await searchByKeyword(term, pages, alibabaCookie, proxyUrl, browserRef)
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
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node -e "require('./server/services/AlibabaSearchService.js'); console.log('OK')"`

Expected: `OK`

- [ ] **Step 3: Start server and verify it starts cleanly**

Run: `node server/app.js`

Expected log lines:
```
Database migrations completed
ERP后端服务已启动: http://localhost:3000
Task scheduler started
```

Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add server/services/AlibabaSearchService.js
git commit -m "feat: add browserRef lifecycle to matchProduct for Puppeteer reuse"
```

---

### Task 5: Manual end-to-end test

- [ ] **Step 1: Start the server**

```bash
node server/app.js
```

- [ ] **Step 2: Trigger a match job via the app UI**

Open `http://localhost:3000/app`, go to Match view, select a product and start matching.

- [ ] **Step 3: Verify logs show Puppeteer fallback triggered**

Expected log sequence:
```
1688 search terms { terms: ["..."] }
1688 SPA detected, falling back to Puppeteer for keyword="..." page 1
1688 keyword="..." page 1: N suppliers   ← N > 0
```

If `N > 0`: feature working correctly.
If still `N = 0` after Puppeteer: 1688 cookie may be expired — reconfigure in Settings.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add server/services/AlibabaSearchService.js
git commit -m "fix: 1688 Puppeteer fallback for SPA pages on overseas IPs"
```
