<template>
  <div>
    <div class="page-header">
      <h2>商品采集</h2>
      <p>输入搜索关键词，系统将自动构建 Shopee 泰国站链接并批量采集商品</p>
    </div>

    <!-- 采集表单 -->
    <el-card style="margin-bottom:16px">
      <el-form :model="form" label-width="100px" @submit.prevent="startCrawl">
        <el-form-item label="搜索关键词">
          <el-input v-model="form.keyword" placeholder="例如：饰品、手机壳、topq10" clearable style="width:400px" />
          <span style="margin-left:12px;font-size:12px;color:#999">系统将自动搜索 Shopee 泰国站对应商品列表</span>
        </el-form-item>
        <el-form-item label="排序方式">
          <el-select v-model="form.sortBy" style="width:200px">
            <el-option label="按销量排序（推荐）" value="sales" />
            <el-option label="按相关度排序" value="relevancy" />
            <el-option label="按价格升序" value="price" />
            <el-option label="按最新上架" value="ctime" />
          </el-select>
        </el-form-item>
        <el-form-item label="采集页数">
          <el-slider v-model="form.pages" :min="1" :max="10" show-stops style="width:300px" />
          <span style="margin-left:12px;color:#666">{{ form.pages }} 页（约 {{ form.pages * 60 }} 件）</span>
        </el-form-item>
        <el-form-item label="账号">
          <el-select v-model="form.accountId" placeholder="使用默认账号" clearable style="width:200px">
            <el-option v-for="a in accounts" :key="a.id" :label="a.name" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="crawling" @click="startCrawl" style="background:#ee4d2d;border-color:#ee4d2d">
            {{ crawling ? '采集中...' : '开始采集' }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 任务进度 -->
    <el-card v-if="currentJobId" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:600">采集进度</span>
        <el-button size="small" type="danger" @click="cancelCrawl">停止</el-button>
      </div>
      <el-progress :percentage="currentProgress.progress || 0" style="margin-top:12px" />
      <div style="color:#666;font-size:13px;margin-top:8px">{{ currentProgress.message }}</div>
    </el-card>

    <!-- 商品列表工具栏 -->
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <span style="font-weight:600">商品列表（共 {{ productTotal }} 件）</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <el-input v-model="searchKeyword" placeholder="搜索标题..." clearable style="width:200px" @input="onSearch" prefix-icon="Search" />
            <el-select v-model="filterStatus" placeholder="匹配状态" clearable style="width:130px" @change="onSearch">
              <el-option label="未匹配" value="none" />
              <el-option label="匹配中" value="running" />
              <el-option label="已匹配" value="done" />
              <el-option label="匹配失败" value="failed" />
            </el-select>
            <el-select v-model="sortBy" style="width:120px" @change="onSearch">
              <el-option label="采集时间" value="created_at" />
              <el-option label="销量" value="sales" />
              <el-option label="价格" value="price_thb" />
            </el-select>
            <el-button icon="Refresh" @click="loadProducts">刷新</el-button>
          </div>
        </div>
      </template>

      <el-table :data="products" stripe v-loading="loading" row-key="id" @selection-change="onSelect">
        <el-table-column type="selection" width="45" />
        <el-table-column label="图片" width="70">
          <template #default="{row}">
            <el-image :src="row.image_path || row.image_url" style="width:50px;height:50px;object-fit:cover;border-radius:4px"
              :preview-src-list="[row.image_path || row.image_url]" fit="cover" />
          </template>
        </el-table-column>
        <el-table-column label="标题" min-width="200">
          <template #default="{row}">
            <div style="font-size:13px;color:#333;line-height:1.4">{{ row.title_cn || row.title_original }}</div>
            <div style="font-size:11px;color:#999;margin-top:2px">{{ row.title_original }}</div>
          </template>
        </el-table-column>
        <el-table-column label="价格" width="120">
          <template #default="{row}">
            <div style="color:#ee4d2d;font-weight:600">฿{{ row.price_thb }}</div>
            <div style="color:#999;font-size:12px">≈¥{{ row.price_cny }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="sales" label="销量" width="80" sortable />
        <el-table-column label="匹配状态" width="100">
          <template #default="{row}">
            <el-tag :type="statusType(row.match_status)" size="small">{{ statusLabel(row.match_status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{row}">
            <el-button size="small" type="primary" link @click="openProduct(row)">查看详情</el-button>
            <el-button size="small" type="primary" link @click="gotoMatch(row)">找同款</el-button>
            <el-button size="small" type="danger" link @click="deleteProduct(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 批量操作 -->
      <div v-if="selected.length > 0" style="margin-top:12px;display:flex;gap:8px;align-items:center">
        <span style="color:#666;font-size:13px">已选 {{ selected.length }} 件</span>
        <el-button size="small" type="warning" @click="batchMatch">批量找同款</el-button>
        <el-button size="small" @click="gotoEdit">批量编辑</el-button>
        <el-button size="small" type="success" @click="exportExcel">导出Excel</el-button>
        <el-button size="small" type="danger" @click="batchDelete">批量删除</el-button>
      </div>

      <el-pagination
        style="margin-top:16px;text-align:right"
        :current-page="page"
        :page-size="pageSize"
        :total="productTotal"
        layout="total, sizes, prev, pager, next"
        :page-sizes="[20, 50, 100]"
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useCrawlStore } from '../stores/crawl'
import { useMatchStore } from '../stores/match'
import { accountApi, exportApi, crawlApi } from '../api/index'

const router = useRouter()
const crawlStore = useCrawlStore()
const matchStore = useMatchStore()

const form = ref({ keyword: '', sortBy: 'sales', pages: 2, accountId: null })
const accounts = ref([])
const crawling = ref(false)
const currentJobId = ref(null)
const selected = ref([])
const searchKeyword = ref('')
const filterStatus = ref('')
const sortBy = ref('created_at')
const page = ref(1)
const pageSize = ref(50)

const products = computed(() => crawlStore.products)
const productTotal = computed(() => crawlStore.productTotal)
const loading = computed(() => crawlStore.loading)
const currentProgress = computed(() => currentJobId.value ? (crawlStore.jobProgress[currentJobId.value] || {}) : {})

onMounted(async () => {
  const res = await accountApi.list()
  accounts.value = res.data || []
  await loadProducts()
})

async function loadProducts () {
  await crawlStore.loadProducts({ page: page.value, pageSize: pageSize.value, keyword: searchKeyword.value, matchStatus: filterStatus.value, sortBy: sortBy.value })
}

async function startCrawl () {
  if (!form.value.keyword) return ElMessage.warning('请输入搜索关键词')
  crawling.value = true
  try {
    currentJobId.value = await crawlStore.startCrawl(form.value.keyword, form.value.sortBy, form.value.pages, form.value.accountId)
    ElMessage.success('采集任务已启动')
    // 定时刷新商品列表
    const timer = setInterval(async () => {
      await loadProducts()
      const p = crawlStore.jobProgress[currentJobId.value]
      if (p?.status === 'done' || p?.status === 'failed') {
        clearInterval(timer)
        crawling.value = false
        currentJobId.value = null
      }
    }, 3000)
  } catch { crawling.value = false }
}

async function cancelCrawl () {
  await crawlStore.cancelCrawl(currentJobId.value)
  crawling.value = false
  currentJobId.value = null
}

function onSelect (rows) { selected.value = rows }
function onSearch () { page.value = 1; loadProducts() }
function onPageChange (p) { page.value = p; loadProducts() }
function onSizeChange (s) { pageSize.value = s; page.value = 1; loadProducts() }

function statusType (s) {
  return { none: 'info', pending: '', running: 'warning', done: 'success', failed: 'danger' }[s] || 'info'
}
function statusLabel (s) {
  return { none: '未匹配', pending: '待匹配', running: '匹配中', done: '已匹配', failed: '失败' }[s] || s
}

function gotoMatch (product) {
  matchStore.loadSuppliers(product.id)
  router.push('/match')
}

function openProduct (product) {
  if (!product.product_url) {
    ElMessage.warning('该商品暂无详情链接')
    return
  }
  window.open(product.product_url, '_blank', 'noopener,noreferrer')
}

async function batchMatch () {
  await matchStore.startMatch(selected.value.map(p => p.id))
  ElMessage.success(`已创建 ${selected.value.length} 个匹配任务`)
  router.push('/match')
}

function gotoEdit () {
  localStorage.setItem('editSelected', JSON.stringify(selected.value))
  router.push('/edit')
}

async function exportExcel () {
  const res = await exportApi.excel(selected.value.map(p => p.id))
  const url = URL.createObjectURL(new Blob([res.data]))
  const a = document.createElement('a')
  a.href = url
  a.download = `erp-export-${Date.now()}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('Excel 导出成功')
}

async function deleteProduct (row) {
  await ElMessageBox.confirm(`确认删除商品「${row.title_cn || row.title_original}」？`, '提示', { type: 'warning' })
  await crawlStore.deleteProduct(row.id)
  ElMessage.success('商品已删除')
}

async function batchDelete () {
  const count = selected.value.length
  await ElMessageBox.confirm(`确认删除选中的 ${count} 件商品？此操作不可恢复。`, '批量删除', { type: 'warning', confirmButtonText: '确认删除', confirmButtonClass: 'el-button--danger' })
  const ids = selected.value.map(p => p.id)
  await crawlApi.batchDeleteProducts(ids)
  ElMessage.success(`已删除 ${count} 件商品`)
  selected.value = []
  await loadProducts()
}
</script>
