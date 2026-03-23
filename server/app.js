const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')

const { runMigrations } = require('./db/migrations')
const { startScheduler } = require('./scheduler/index')
const logger = require('./utils/logger')

// 确保目录存在
const dirs = ['uploads/shopee', 'exports', 'logs', 'data']
dirs.forEach(d => {
  const fp = path.join(__dirname, '..', d)
  if (!fs.existsSync(fp)) fs.mkdirSync(fp, { recursive: true })
})

// 初始化数据库
runMigrations()

const app = express()
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))
app.use('/exports', express.static(path.join(__dirname, '../exports')))

// API 路由
app.use('/api/config', require('./routes/config'))
app.use('/api/accounts', require('./routes/accounts'))
app.use('/api/crawl', require('./routes/crawl'))
app.use('/api/match', require('./routes/match'))
app.use('/api/edit', require('./routes/edit'))
app.use('/api/export', require('./routes/export'))
app.use('/api/profit', require('./routes/profit'))
app.use('/api/sse', require('./routes/sse'))

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ code: 200, message: 'ok', time: new Date().toISOString() })
})

// 生产环境：托管 Vue 构建产物
const distPath = path.join(__dirname, '../dist')
if (fs.existsSync(distPath)) {
  app.use('/app', express.static(distPath))
  app.get('/app/*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// 全局错误处理
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { path: req.path, error: err.message })
  res.status(500).json({ code: 500, message: err.message })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  logger.info(`ERP后端服务已启动: http://localhost:${PORT}`)
  startScheduler()
})

module.exports = app
