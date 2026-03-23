# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shopee-ERP is a local desktop application (Electron + Vue 3 + Express + SQLite) for cross-border e-commerce sourcing: crawling Shopee Thailand products, matching 1688 suppliers, batch editing, and exporting Excel reports.

## Commands

```bash
# Install dependencies
npm install

# Development (runs Express server + Vite dev server concurrently)
npm run dev

# Run backend server only (port 3000)
npm run server

# Build Vue frontend
npm run build

# Launch full app (auto-installs deps, builds, starts Electron)
npm run launch

# Electron in dev mode (requires `npm run dev` running separately)
npm run electron:dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Architecture

The app has three layers running in the same process tree:

1. **Electron** (`main.js`) — shells the app window, spawns the Express server as a child process, polls `/api/health` before loading the frontend URL
2. **Express backend** (`server/`) — REST API on port 3000, serves built Vue assets at `/app` in production
3. **Vue 3 frontend** (`src/`) — communicates with Express via `/api/*`; in dev mode runs on Vite at port 5173

### Backend (`server/`)

- `app.js` — entry point: initializes DB, mounts routes, starts scheduler
- `db/index.js` — better-sqlite3 singleton; DB file lives at `data/erp.db`
- `db/migrations.js` — runs on startup; idempotent DDL + default config seeding
- `scheduler/index.js` — polling loop (2s interval); dispatches pending jobs to workers (1 crawl concurrent, 3 match concurrent); recovers stuck jobs on restart
- `scheduler/crawlWorker.js` / `matchWorker.js` — job execution logic
- `routes/` — one file per resource: `crawl`, `match`, `edit`, `export`, `profit`, `config`, `accounts`, `sse`
- `services/` — business logic: `ShopeeScraperService` (Puppeteer + Cheerio fallback), `AlibabaSearchService` (1688 scraping with cookie), `TranslatorService` (DeepSeek / OpenAI / AliDashScope), `ImageSimilarityService`, `ProfitService`, `ExportService`, `SupplierFilterService`
- `utils/sseEmitter.js` — Server-Sent Events for real-time job progress to frontend

### Frontend (`src/`)

- `main.js` → `App.vue` with `vue-router` (hash history) + `pinia`
- Routes: `/collect` → `CollectView`, `/match` → `MatchView`, `/edit` → `EditView`, `/settings` → `SettingsView`
- `api/index.js` — centralized axios instance (`baseURL: /api`, 30s timeout); one exported object per resource domain
- `stores/` — pinia stores for crawl state (`crawl.js`), match state (`match.js`), SSE connection (`sse.js`)

### Database Schema (SQLite)

Key tables: `accounts`, `config` (key-value), `crawl_jobs`, `shopee_products`, `match_jobs`, `alibaba_suppliers`, `profit_records`

`config` stores all user settings (LLM provider/keys, exchange rate, filter thresholds, proxy, 1688 cookie) as key-value rows.

### Key Data Flow

1. User submits keyword → `POST /api/crawl/start` creates a `crawl_job`
2. Scheduler picks up job → `ShopeeScraperService` fetches products → stored in `shopee_products`
3. User selects products → `POST /api/match/start` creates `match_jobs`
4. Scheduler picks up match jobs (up to 3 concurrent) → `TranslatorService` generates `title_cn` + keywords on demand → `AlibabaSearchService` searches 1688 → results in `alibaba_suppliers`
5. User edits/selects suppliers → `PATCH /api/edit/batch` or `/edit/supplier/select`
6. Export → `POST /api/export/excel` → downloads via blob response

### Runtime Files (not in repo, created on first run)

- `data/erp.db` — SQLite database
- `uploads/shopee/` — cached product images
- `exports/` — generated Excel files
- `logs/` — winston log files

## Configuration

All runtime config is stored in the `config` DB table. Key settings:
- `llm_provider`: `deepseek` | `openai` | `alibaba`
- `deepseek_api_key`, `openai_api_key`, `alibaba_api_key`
- `exchange_rate`: THB→CNY rate (default `0.19`)
- `alibaba_cookie`: required for 1688 scraping
- `proxy_url`: optional HTTP proxy for all outbound requests
- Supplier filter thresholds: `filter_price_ratio`, `filter_min_score`, `filter_min_sales`, `filter_max_moq`

## Tests

Tests use Vitest. Test files are colocated with source (e.g., `server/services/ShopeeScraperService.test.mjs`).
