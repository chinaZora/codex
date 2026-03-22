import axios from 'axios'
import { ElMessage } from 'element-plus'

const BASE = '/api'

const http = axios.create({ baseURL: BASE, timeout: 30000 })

http.interceptors.response.use(
  res => res.data,
  err => {
    const msg = err.response?.data?.message || err.message || '请求失败'
    ElMessage.error(msg)
    return Promise.reject(err)
  }
)

// 配置
export const configApi = {
  getAll: () => http.get('/config'),
  setAll: (data) => http.put('/config', data),
  testConnection: (payload) => http.post('/config/test-connection', payload)
}

// 账号
export const accountApi = {
  list: () => http.get('/accounts'),
  create: (data) => http.post('/accounts', data),
  update: (id, data) => http.put(`/accounts/${id}`, data),
  remove: (id) => http.delete(`/accounts/${id}`),
  setDefault: (id) => http.post(`/accounts/${id}/set-default`)
}

// 采集
export const crawlApi = {
  start: (data) => http.post('/crawl/start', data),
  jobs: () => http.get('/crawl/jobs'),
  job: (id) => http.get(`/crawl/jobs/${id}`),
  cancel: (id) => http.post(`/crawl/jobs/${id}/cancel`),
  deleteJob: (id) => http.delete(`/crawl/jobs/${id}`),
  products: (params) => http.get('/crawl/products', { params }),
  deleteProduct: (id) => http.delete(`/crawl/products/${id}`),
  batchDeleteProducts: (ids) => http.delete('/crawl/products/batch', { data: { ids } })
}

// 匹配
export const matchApi = {
  start: (ids) => http.post('/match/start', { ids }),
  reset: (ids) => http.post('/match/reset', { ids }),
  jobs: () => http.get('/match/jobs'),
  cancel: (id) => http.post(`/match/jobs/${id}/cancel`),
  deleteJob: (id) => http.delete(`/match/jobs/${id}`),
  suppliers: (productId) => http.get(`/match/suppliers/${productId}`)
}

// 编辑
export const editApi = {
  batchUpdate: (updates) => http.patch('/edit/batch', { updates }),
  selectSupplier: (id, selected) => http.patch('/edit/supplier/select', { id, selected })
}

// 利润
export const profitApi = {
  calculate: (data) => http.post('/profit/calculate', data),
  records: (productId) => http.get(`/profit/records/${productId}`),
  batchCalculate: (items) => http.post('/profit/batch-calculate', { items })
}

// 导出
export const exportApi = {
  excel: (ids) => {
    return axios({
      url: `${BASE}/export/excel`,
      method: 'POST',
      data: { ids },
      responseType: 'blob',
      timeout: 60000
    })
  }
}
