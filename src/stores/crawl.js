import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { crawlApi } from '../api/index'
import { useSseStore } from './sse'

export const useCrawlStore = defineStore('crawl', () => {
  const jobs = ref([])
  const products = ref([])
  const productTotal = ref(0)
  const loading = ref(false)

  // jobId → { progress, status, message, done }
  const jobProgress = reactive({})

  function initSse () {
    const sse = useSseStore()
    sse.on('crawl_', (payload) => {
      const { jobId, progress, status, message, done } = payload
      if (!jobProgress[jobId]) jobProgress[jobId] = {}
      // 状态合并：progress 取较大值，HTTP轮询优先
      if (progress > (jobProgress[jobId].progress || 0)) {
        jobProgress[jobId].progress = progress
      }
      if (message) jobProgress[jobId].message = message
      if (done !== undefined) jobProgress[jobId].done = done
      if (payload.type === 'crawl_done') {
        jobProgress[jobId].status = 'done'
        loadJobs()
      }
      if (payload.type === 'crawl_failed') {
        jobProgress[jobId].status = 'failed'
        loadJobs()
      }
    })
  }

  async function loadJobs () {
    const res = await crawlApi.jobs()
    jobs.value = res.data || []
  }

  async function loadProducts (params = {}) {
    loading.value = true
    try {
      const res = await crawlApi.products(params)
      products.value = res.data.list || []
      productTotal.value = res.data.total || 0
      return res.data
    } finally {
      loading.value = false
    }
  }

  async function startCrawl (keyword, sortBy, pagesToCrawl, accountId) {
    const res = await crawlApi.start({ keyword, sortBy, pagesToCrawl, accountId })
    const jobId = res.data.jobId
    jobProgress[jobId] = { progress: 0, status: 'pending', message: '等待开始...' }
    await loadJobs()
    return jobId
  }

  async function cancelCrawl (jobId) {
    await crawlApi.cancel(jobId)
    await loadJobs()
  }

  async function deleteJob (jobId) {
    await crawlApi.deleteJob(jobId)
    await loadJobs()
    await loadProducts()
  }

  async function deleteProduct (productId) {
    await crawlApi.deleteProduct(productId)
    products.value = products.value.filter(p => p.id !== productId)
    productTotal.value = Math.max(0, productTotal.value - 1)
  }

  // SSE 重连后补偿轮询
  async function syncJobStatus (jobId) {
    const res = await crawlApi.job(jobId)
    const job = res.data
    if (jobProgress[jobId]) {
      // 轮询结果优先
      jobProgress[jobId].progress = Math.max(job.progress, jobProgress[jobId].progress || 0)
      jobProgress[jobId].status = job.status
    }
  }

  return { jobs, products, productTotal, loading, jobProgress, initSse, loadJobs, loadProducts, startCrawl, cancelCrawl, deleteJob, deleteProduct, syncJobStatus }
})
