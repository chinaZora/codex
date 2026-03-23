# 1688 Puppeteer Fallback Design

**Date:** 2026-03-23
**Status:** Approved

## Problem

1688's search page (`s.1688.com/selloffer/offer_search.htm`) is a React SPA. On Chinese mainland/HK/TW IPs, the server returns SSR HTML with product data embedded — Cheerio parses it fine. On overseas IPs (e.g., this Windows server), the server returns a JavaScript shell with no product data in the HTML, resulting in 0 suppliers parsed.

## Solution

Add a Puppeteer-based fallback inside `AlibabaSearchService.js`. The existing axios path runs first (fast, works on Mac/CN IP). If it returns 0 results and the page looks like a SPA shell, Puppeteer renders the page and re-parses.

## Affected File

`server/services/AlibabaSearchService.js` — only this file changes.

## Design

### 1. `searchByKeywordPuppeteer(keyword, pageNum, cookie, proxyUrl, browserRef)`

New async function. Called only when the axios path yields 0 results on a SPA page.

- Launch Puppeteer with `headless: 'new'` (matches `ShopeeScraperService.js` convention) and `args: ['--no-sandbox', '--disable-setuid-sandbox']`
- If `proxyUrl` is set, add `--proxy-server=<proxyUrl>` to launch args
- Store the launched instance in `browserRef.instance` so the caller's `finally` block can close it
- Open a new page, set `User-Agent` to Chrome desktop UA
- Inject `alibaba_cookie` via `page.setCookie()`:
  - Parse the cookie string into `{name, value, domain: '.1688.com', path: '/'}` objects (leading dot so cookies apply to all subdomains including `s.1688.com`)
  - Reuse or mirror the `parseCookieHeader` pattern already in `ShopeeScraperService.js`
- Navigate to the search URL with `waitUntil: 'domcontentloaded'`, timeout 30s
- Wait for a product container selector (soft, 15s timeout — proceed even if not found):
  `'[data-offer-id], .list-item, [class*="offerlist-item"]'`
- Call `page.content()` to get the rendered HTML — even on timeout, attempt to parse partial render
- Check `isLoginRedirect(html)` on the rendered HTML; if true, throw `LOGIN_REQUIRED` (consistent with axios path, surfaces actionable error instead of silent 0 results)
- Pass HTML to existing `parseSuppliers(html)` — no changes to parse logic
- Close the page (`page.close()`) — browser lifecycle is managed by caller via `browserRef`

### 2. SPA detection in `searchByKeyword`

The `isSpaShell` check is only reached after `isLoginRedirect` returns false (ensuring the page is not a login redirect). After the axios request succeeds and `parseSuppliers` returns 0 items:

```
if (items.length === 0 && isSpaShell(html)) → trigger Puppeteer fallback
```

`isSpaShell(html)`:
```js
function isSpaShell(html) {
  const $ = cheerio.load(html)
  const productNodes = $('[data-offer-id], .list-item, [class*="offerlist-item"]').length
  const scriptCount = (html.match(/<script\s+src=/g) || []).length
  return productNodes < 1 && scriptCount > 5
}
```

Uses the same selectors as `parseSuppliers` so detection and parsing are aligned.

### 3. Browser lifecycle in `matchProduct`

`matchProduct` owns the browser lifecycle via a ref object:

```js
const browserRef = { instance: null }
try {
  // keyword loop passes browserRef to searchByKeyword
  // searchByKeyword lazily initialises browserRef.instance on first Puppeteer need
  ...
} finally {
  if (browserRef.instance) await browserRef.instance.close()
}
```

The null-guard in `finally` ensures safe cleanup even if Puppeteer never launched (axios path succeeded) or if `puppeteer.launch()` threw before assigning.

### 4. `searchByKeyword` signature change

```js
async function searchByKeyword(keyword, maxPages, cookie, proxyUrl, browserRef = {})
```

- Default is `{}` (not `null`) so `browserRef.instance = ...` never throws TypeError
- All existing callers in `matchProduct` are updated to pass `browserRef`
- On first Puppeteer need: `browserRef.instance = await puppeteer.launch(...)`
- Subsequent pages in the same job reuse the same browser instance

## What Does NOT Change

- `parseSuppliers` — unchanged
- `extractSearchTerms` — unchanged
- `matchProduct` main flow — only adds `browserRef` wrapper and `finally` block
- `isLoginRedirect` — unchanged
- All other services

## Error Handling

- If Puppeteer launch fails, log a warning and return `[]` for that keyword (same as current axios failure path)
- If `waitForSelector` times out, still call `page.content()` — partial render may still yield results
- Browser is always closed in `matchProduct`'s `finally` block with a null-guard

## No New Dependencies

Puppeteer is already in `package.json`. No additional packages required.

## Testing

Manual test: run a match job on Windows with a valid 1688 cookie configured. Expected log:
```
1688 SPA detected, falling back to Puppeteer for keyword="耳环饰品"
1688 keyword="耳环饰品" page 1: N suppliers   (N > 0)
```
Mac behaviour is unchanged — axios path returns results, `isSpaShell` is never triggered.
