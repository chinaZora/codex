const db = require('./index')
const logger = require('../utils/logger')

function runMigrations () {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      cookie     TEXT,
      note       TEXT,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS config (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS crawl_jobs (
      id              TEXT PRIMARY KEY,
      account_id      TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      keyword         TEXT,
      url             TEXT,
      pages_to_crawl  INTEGER DEFAULT 2,
      status          TEXT DEFAULT 'pending',
      progress        INTEGER DEFAULT 0,
      total           INTEGER DEFAULT 0,
      fetched         INTEGER DEFAULT 0,
      error           TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shopee_products (
      id               TEXT PRIMARY KEY,
      crawl_job_id     TEXT REFERENCES crawl_jobs(id),
      account_id       TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      title_original   TEXT,
      title_cn         TEXT,
      keywords         TEXT,
      price_thb        REAL,
      price_cny        REAL,
      sales            INTEGER DEFAULT 0,
      image_url        TEXT,
      image_path       TEXT,
      product_url      TEXT,
      match_status     TEXT DEFAULT 'none',
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS match_jobs (
      id                  TEXT PRIMARY KEY,
      shopee_product_id   TEXT REFERENCES shopee_products(id),
      status              TEXT DEFAULT 'pending',
      progress            INTEGER DEFAULT 0,
      result_count        INTEGER DEFAULT 0,
      error               TEXT,
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alibaba_suppliers (
      id                TEXT PRIMARY KEY,
      match_job_id      TEXT REFERENCES match_jobs(id),
      shopee_product_id TEXT REFERENCES shopee_products(id),
      title             TEXT,
      price             REAL,
      min_order         INTEGER,
      shop_name         TEXT,
      shop_score        REAL DEFAULT 0,
      tags              TEXT,
      sales_30d         INTEGER DEFAULT 0,
      product_url       TEXT,
      image_url         TEXT,
      image_similarity  REAL DEFAULT 0,
      composite_score   REAL DEFAULT 0,
      score_degraded    INTEGER DEFAULT 0,
      is_selected       INTEGER DEFAULT 0,
      created_at        TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profit_records (
      id                  TEXT PRIMARY KEY,
      shopee_product_id   TEXT REFERENCES shopee_products(id),
      supplier_id         TEXT REFERENCES alibaba_suppliers(id),
      sell_price_thb      REAL,
      cost_cny            REAL,
      cost_thb            REAL,
      packaging_cost_thb  REAL DEFAULT 0,
      shipping_cost_thb   REAL DEFAULT 0,
      platform_fee_pct    REAL DEFAULT 0.02,
      platform_fee_thb    REAL,
      profit_thb          REAL,
      profit_cny          REAL,
      profit_margin       REAL,
      created_at          TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_shopee_crawl_job ON shopee_products(crawl_job_id);
    CREATE INDEX IF NOT EXISTS idx_shopee_match_status ON shopee_products(match_status);
    CREATE INDEX IF NOT EXISTS idx_alibaba_shopee_id ON alibaba_suppliers(shopee_product_id);
    CREATE INDEX IF NOT EXISTS idx_match_jobs_product ON match_jobs(shopee_product_id);
    CREATE INDEX IF NOT EXISTS idx_profit_shopee ON profit_records(shopee_product_id);
  `)

  // 预置默认配置（INSERT OR IGNORE 不覆盖已有值）
  const defaults = {
    deepseek_api_key: '',
    exchange_rate: '0.19',
    filter_price_ratio: '0.6',
    filter_min_score: '4.0',
    filter_min_sales: '100',
    filter_max_moq: '200',
    filter_require_free_ship: 'false',
    filter_require_power_merchant: 'false',
    proxy_url: '',
    alibaba_cookie: '',
    crawl_page_delay_ms: '3000',
    default_packaging_cost: '5',
    default_shipping_cost: '0',
    platform_fee_pct: '0.02'
  }

  const insertConfig = db.prepare(
    'INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)'
  )
  const insertMany = db.transaction((entries) => {
    for (const [k, v] of entries) insertConfig.run(k, v)
  })
  insertMany(Object.entries(defaults))

  // 迁移：更新过严的筛选默认值（仅在值仍为初始保守值时才更新）
  const relaxMigrations = [
    ['filter_price_ratio',           '0.5',    '0.6'],
    ['filter_min_score',             '4.5',    '4.0'],
    ['filter_min_sales',             '1000',   '100'],
    ['filter_max_moq',               '50',     '200'],
    ['filter_require_free_ship',     'true',   'false'],
    ['filter_require_power_merchant','true',   'false']
  ]
  const updateIfDefault = db.prepare(
    "UPDATE config SET value=? WHERE key=? AND value=?"
  )
  for (const [key, oldVal, newVal] of relaxMigrations) {
    updateIfDefault.run(newVal, key, oldVal)
  }

  // 迁移：为已存在的数据库添加 keyword 列（新建时 DDL 已包含）
  try {
    db.exec("ALTER TABLE crawl_jobs ADD COLUMN keyword TEXT")
  } catch (e) {
    // 列已存在则忽略
  }

  logger.info('Database migrations completed')
}

module.exports = { runMigrations }
