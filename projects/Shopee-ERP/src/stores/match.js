import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { matchApi, editApi } from '../api/index'
import { useSseStore } from './sse'

export const useMatchStore = defineStore('match', () => {
  const suppliers = ref([])
  const currentProductId = ref(null)
  const jobProgress = reactive({})

  function initSse () {
    const sse = useSseStore()
    sse.on('match_', (payload) => {
      const { jobId, progress, message } = payload
      if (!jobProgress[jobId]) jobProgress[jobId] = {}
      if (progress > (jobProgress[jobId].progress || 0)) {
        jobProgress[jobId].progress = progress
      }
      if (message) jobProgress[jobId].message = message
      if (payload.type === 'match_done') {
        jobProgress[jobId].status = 'done'
        if (payload.productId === currentProductId.value) {
          loadSuppliers(payload.productId)
        }
      }
    })
  }

  async function startMatch (productIds) {
    const res = await matchApi.start(productIds)
    for (const jobId of res.data.jobIds) {
      jobProgress[jobId] = { progress: 0, status: 'pending', message: '等待匹配...' }
    }
    return res.data.jobIds
  }

  async function loadSuppliers (productId) {
    currentProductId.value = productId
    const res = await matchApi.suppliers(productId)
    suppliers.value = res.data || []
  }

  async function selectSupplier (supplierId, selected) {
    await editApi.selectSupplier(supplierId, selected)
    suppliers.value = suppliers.value.map(s =>
      s.id === supplierId ? { ...s, is_selected: selected ? 1 : 0 } : s
    )
  }

  return { suppliers, currentProductId, jobProgress, initSse, startMatch, loadSuppliers, selectSupplier }
})
