import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSseStore = defineStore('sse', () => {
  const connected = ref(false)
  const lastEvent = ref(null)
  // prefix → Function[]，支持同前缀多监听器
  const handlers = new Map()
  let es = null

  function connect () {
    if (es) return
    es = new EventSource('/api/sse/events')

    es.onopen = () => { connected.value = true }
    es.onerror = () => {
      connected.value = false
      // EventSource 会自动重连
    }
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data)
        lastEvent.value = payload
        // 分发给所有匹配前缀的 handler
        for (const [prefix, handlerList] of handlers) {
          if (payload.type && payload.type.startsWith(prefix)) {
            for (const h of handlerList) h(payload)
          }
        }
      } catch (_) {}
    }
  }

  function on (prefix, handler) {
    if (!handlers.has(prefix)) handlers.set(prefix, [])
    handlers.get(prefix).push(handler)
  }

  // off 精确移除单个 handler；不传 handler 则移除该前缀所有监听器
  function off (prefix, handler) {
    if (!handlers.has(prefix)) return
    if (handler === undefined) {
      handlers.delete(prefix)
    } else {
      const list = handlers.get(prefix)
      const idx = list.indexOf(handler)
      if (idx !== -1) list.splice(idx, 1)
      if (list.length === 0) handlers.delete(prefix)
    }
  }

  return { connected, lastEvent, connect, on, off }
})
