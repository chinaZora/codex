const express = require('express')
const router = express.Router()
const { getAllConfig, setConfigs, getConfig } = require('../services/ConfigService')
const { testConnection } = require('../services/TranslatorService')
const logger = require('../utils/logger')

// GET /api/config — 获取所有配置（API Key 脱敏）
router.get('/', (req, res) => {
  try {
    res.json({ code: 200, data: getAllConfig() })
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message })
  }
})

// PUT /api/config — 批量更新配置
router.put('/', (req, res) => {
  try {
    const updates = req.body
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ code: 400, message: '请求体必须为键值对象' })
    }
    setConfigs(updates)
    res.json({ code: 200, message: '配置已保存' })
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message })
  }
})

// POST /api/config/test-connection — 测试 DeepSeek API 连通性
router.post('/test-connection', async (req, res) => {
  try {
    // 支持前端传入临时 apiKey（未保存的情况下也可测试）
    const tempKey = req.body?.apiKey
    const result = await testConnection(tempKey)
    res.json({ code: 200, data: result })
  } catch (err) {
    res.status(400).json({ code: 400, data: { ok: false, error: err.message } })
  }
})

module.exports = router
