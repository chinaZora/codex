/**
 * 指数退避重试工具
 * @param {Function} fn - 异步函数
 * @param {Object} opts - { retries, baseDelay, maxDelay, onRetry }
 */
async function retry (fn, opts = {}) {
  const { retries = 3, baseDelay = 500, maxDelay = 10000, onRetry } = opts
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastErr = err
      if (attempt === retries) break
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
      const jitter = Math.random() * delay * 0.2
      if (onRetry) onRetry(attempt + 1, err, delay + jitter)
      await sleep(delay + jitter)
    }
  }
  throw lastErr
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 简单信号量（替代 p-limit，避免 ESM 兼容问题）
 */
function createSemaphore (max) {
  let active = 0
  const queue = []
  return function limit (fn) {
    return new Promise((resolve, reject) => {
      const run = async () => {
        active++
        try { resolve(await fn()) } catch (e) { reject(e) } finally {
          active--
          if (queue.length > 0) queue.shift()()
        }
      }
      if (active < max) run()
      else queue.push(run)
    })
  }
}

module.exports = { retry, sleep, createSemaphore }
