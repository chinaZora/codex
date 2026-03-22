const express = require('express')
const router = express.Router()
const sseEmitter = require('../utils/sseEmitter')

// GET /api/sse/events — SSE 长连接
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // 发送心跳，保活连接
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n')
  }, 25000)

  // 推送 SSE 事件
  const handler = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }
  sseEmitter.on('sse', handler)

  // 客户端断开时清理
  req.on('close', () => {
    clearInterval(heartbeat)
    sseEmitter.off('sse', handler)
  })
})

module.exports = router
