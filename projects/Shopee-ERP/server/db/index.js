const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const dataDir = path.join(__dirname, '../../data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const db = new Database(path.join(dataDir, 'erp.db'), {
  // verbose: console.log  // 调试时开启
})

// 性能优化 & 安全配置
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('synchronous = NORMAL')
db.pragma('cache_size = -64000') // 64MB cache
db.pragma('temp_store = MEMORY')

module.exports = db
