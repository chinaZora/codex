const { EventEmitter } = require('events')

/**
 * SSE 广播单例
 * 用法：sseEmitter.emit('sse', eventPayload)
 * 路由中订阅：sseEmitter.on('sse', handler)
 */
const sseEmitter = new EventEmitter()
sseEmitter.setMaxListeners(100) // 支持多个 SSE 客户端并发连接

/**
 * 推送 SSE 事件的便捷方法
 * @param {Object} payload - { type, jobId, progress, message, data }
 */
sseEmitter.push = function (payload) {
  sseEmitter.emit('sse', payload)
}

module.exports = sseEmitter
