<template>
  <div>
    <div class="page-header">
      <h2>1688 同款匹配</h2>
      <p>选择商品后批量发起匹配，自动筛选优质供应商</p>
    </div>

    <el-row :gutter="16">
      <!-- 左：商品列表 -->
      <el-col :span="10">
        <el-card>
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="display:flex;align-items:center;gap:10px">
                <span>商品列表</span>
                <el-checkbox
                  :model-value="isAllChecked"
                  :indeterminate="isIndeterminate"
                  @change="toggleAll"
                  style="margin-left:4px">全选</el-checkbox>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <el-button size="small" @click="refreshProducts" :loading="refreshing" icon="Refresh">刷新</el-button>
                <el-switch v-model="autoRefresh" :inline-prompt="true" active-text="自动刷新" inactive-text="" size="small" />
                <el-button size="small" :disabled="checkedIds.length===0"
                  @click="resetMatch" :loading="resetting">
                  重置匹配({{ checkedIds.length }})
                </el-button>
                <el-button size="small" type="primary" :disabled="checkedIds.length===0"
                  @click="startMatch" :loading="matching" style="background:#ee4d2d;border-color:#ee4d2d">
                  匹配选中({{ checkedIds.length }})
                </el-button>
              </div>
            </div>
          </template>
          <el-input v-model="keyword" placeholder="搜索商品" clearable @input="loadProducts" style="margin-bottom:10px" />
          <div class="product-list" v-loading="loading">
            <div v-for="p in products" :key="p.id"
              class="product-row" :class="{ active: currentProduct?.id === p.id }"
              @click="selectProduct(p)">
              <el-checkbox :model-value="checkedIds.includes(p.id)" @change="toggleCheck(p.id)" @click.stop />
              <el-image :src="p.image_path || p.image_url" style="width:44px;height:44px;object-fit:cover;border-radius:4px;flex-shrink:0" />
              <div style="flex:1;min-width:0;margin-left:8px">
                <div class="product-title">{{ p.title_cn || p.title_original }}</div>
                <div style="display:flex;gap:6px;margin-top:2px">
                  <span style="color:#ee4d2d;font-size:12px">฿{{ p.price_thb }}</span>
                  <el-tag :type="statusType(p.match_status)" size="small">{{ statusLabel(p.match_status) }}</el-tag>
                </div>
              </div>
            </div>
            <el-empty v-if="products.length===0" description="暂无商品" :image-size="60" />
          </div>
          <el-pagination :current-page="page" :page-size="20" :total="total" layout="prev, pager, next" small
            style="margin-top:10px" @current-change="p => { page=p; loadProducts() }" />
        </el-card>
      </el-col>

      <!-- 右：供应商结果 -->
      <el-col :span="14">
        <el-card>
          <template #header>
            <span>{{ currentProduct ? `「${currentProduct.title_cn || currentProduct.title_original}」匹配结果` : '请选择商品' }}</span>
          </template>

          <div v-if="!currentProduct" style="text-align:center;padding:60px;color:#bbb">点击左侧商品查看匹配结果</div>

          <div v-else>
            <!-- 当前商品信息 -->
            <div style="display:flex;gap:12px;margin-bottom:16px;padding:12px;background:#f8f8f8;border-radius:8px">
              <el-image :src="currentProduct.image_path || currentProduct.image_url" style="width:80px;height:80px;object-fit:cover;border-radius:6px" />
              <div>
                <div style="font-weight:600;font-size:14px">{{ currentProduct.title_cn }}</div>
                <el-tag>售价 ฿{{ currentProduct.price_thb }}</el-tag>
                <el-tag type="warning" style="margin-left:6px">≈¥{{ currentProduct.price_cny }}</el-tag>
              </div>
            </div>

            <!-- 供应商列表 -->
            <div v-if="suppliers.length===0" style="text-align:center;padding:40px;color:#bbb">
              暂无匹配结果，请先发起匹配
            </div>
            <div v-for="s in suppliers" :key="s.id" class="supplier-card" :class="{ selected: s.is_selected }">
              <div style="display:flex;gap:12px">
                <el-image :src="s.image_url" style="width:70px;height:70px;object-fit:cover;border-radius:6px;flex-shrink:0" />
                <div style="flex:1">
                  <div style="font-size:13px;font-weight:600;margin-bottom:4px">{{ s.title }}</div>
                  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">
                    <el-tag v-for="tag in parseTags(s.tags)" :key="tag" size="small"
                      :type="tag==='实力商家'?'danger':tag==='包邮'?'success':''" >{{ tag }}</el-tag>
                    <el-tag v-if="s.score_degraded" type="warning" size="small">⚠ 无相似度</el-tag>
                  </div>
                  <div style="display:flex;gap:16px;font-size:12px;color:#666">
                    <span>价格：<b style="color:#ee4d2d">¥{{ s.price }}</b></span>
                    <span>起购：{{ s.min_order }}件</span>
                    <span>月销：{{ s.sales_30d }}</span>
                    <span>评分：{{ s.shop_score }}</span>
                  </div>
                  <div style="margin-top:6px;display:flex;align-items:center;gap:8px">
                    <span style="font-size:12px;color:#666">相似度：</span>
                    <el-progress v-if="s.image_similarity >= 0"
                      :percentage="Math.round(s.image_similarity * 100)"
                      :color="s.image_similarity >= 0.8 ? '#67c23a' : s.image_similarity >= 0.5 ? '#409eff' : '#909399'"
                      style="width:120px" />
                    <span v-else style="color:#999;font-size:12px">无数据</span>
                    <span style="font-size:12px">综合分：<b>{{ s.composite_score }}</b></span>
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
                  <el-button size="small" :type="s.is_selected ? 'success' : ''" @click="toggleSelect(s)">
                    {{ s.is_selected ? '已选定' : '选定' }}
                  </el-button>
                  <el-button size="small" link @click="openUrl(s.product_url)">查看</el-button>
                  <el-button size="small" link type="primary" @click="calcProfit(s)">核算利润</el-button>
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 利润核算对话框 -->
    <el-dialog v-model="profitDialog" title="利润核算" width="460px">
      <el-form :model="profitForm" label-width="110px" v-if="profitResult === null">
        <el-form-item label="售价(THB)"><el-input-number v-model="profitForm.sellPrice" :min="0" disabled /></el-form-item>
        <el-form-item label="进价(CNY)"><el-input-number v-model="profitForm.costCny" :min="0" disabled /></el-form-item>
        <el-form-item label="包装费(THB)"><el-input-number v-model="profitForm.packaging" :min="0" :step="1" /></el-form-item>
        <el-form-item label="头程费(THB)"><el-input-number v-model="profitForm.shipping" :min="0" :step="5" /></el-form-item>
        <el-form-item><el-button type="primary" @click="submitProfit" style="background:#ee4d2d;border-color:#ee4d2d">计算</el-button></el-form-item>
      </el-form>
      <div v-else class="profit-result">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="总成本(THB)">{{ profitResult.costThb }}</el-descriptions-item>
          <el-descriptions-item label="平台佣金">{{ profitResult.platformFeeThb }}</el-descriptions-item>
          <el-descriptions-item label="净利润(THB)">
            <span :style="{color: profitResult.profitThb > 0 ? '#67c23a' : '#f56c6c', fontWeight: 700}">
              {{ profitResult.profitThb }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="净利润(CNY)">{{ profitResult.profitCny }}</el-descriptions-item>
          <el-descriptions-item label="利润率">
            <span :style="{color: profitResult.profitMargin > 0.3 ? '#67c23a' : profitResult.profitMargin > 0 ? '#e6a23c' : '#f56c6c', fontWeight: 700}">
              {{ (profitResult.profitMargin * 100).toFixed(1) }}%
            </span>
          </el-descriptions-item>
        </el-descriptions>
        <el-button style="margin-top:12px" @click="profitResult=null">重新计算</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useCrawlStore } from '../stores/crawl'
import { useMatchStore } from '../stores/match'
import { profitApi, matchApi } from '../api/index'

const crawlStore = useCrawlStore()
const matchStore = useMatchStore()

const keyword = ref('')
const page = ref(1)
const products = computed(() => crawlStore.products)
const total = computed(() => crawlStore.productTotal)
const loading = computed(() => crawlStore.loading)
const suppliers = computed(() => matchStore.suppliers)
const currentProduct = ref(null)
const checkedIds = ref([])
const matching = ref(false)
const resetting = ref(false)
const refreshing = ref(false)
const autoRefresh = ref(false)
const autoRefreshInterval = ref(null)

// 全选状态
const isAllChecked = computed(() => products.value.length > 0 && checkedIds.value.length === products.value.length)
const isIndeterminate = computed(() => checkedIds.value.length > 0 && checkedIds.value.length < products.value.length)

function toggleAll (val) {
  checkedIds.value = val ? products.value.map(p => p.id) : []
}

const profitDialog = ref(false)
const profitForm = ref({ sellPrice: 0, costCny: 0, packaging: 5, shipping: 0, supplierId: '' })
const profitResult = ref(null)

onMounted(() => loadProducts())

async function loadProducts () {
  await crawlStore.loadProducts({ page: page.value, pageSize: 20, keyword: keyword.value })
}

function selectProduct (p) {
  currentProduct.value = p
  matchStore.loadSuppliers(p.id)
}

function toggleCheck (id) {
  const idx = checkedIds.value.indexOf(id)
  if (idx >= 0) checkedIds.value.splice(idx, 1)
  else checkedIds.value.push(id)
}

async function startMatch () {
  matching.value = true
  try {
    await matchStore.startMatch(checkedIds.value)
    ElMessage.success('匹配任务已启动，请稍候...')
    checkedIds.value = []
  } finally { matching.value = false }
}

async function resetMatch () {
  resetting.value = true
  try {
    await matchApi.reset(checkedIds.value)
    ElMessage.success(`已重置 ${checkedIds.value.length} 个商品的匹配状态`)
    checkedIds.value = []
    await loadProducts()
  } finally { resetting.value = false }
}

function statusType (s) {
  return { none: 'info', pending: '', running: 'warning', done: 'success', failed: 'danger' }[s] || 'info'
}
function statusLabel (s) {
  return { none: '未匹配', pending: '待匹配', running: '匹配中', done: '已匹配', failed: '失败' }[s] || s
}

function parseTags (str) {
  try { return JSON.parse(str || '[]') } catch { return [] }
}

async function toggleSelect (supplier) {
  await matchStore.selectSupplier(supplier.id, !supplier.is_selected)
}

function openUrl (url) {
  if (url) window.open(url, '_blank')
}

function calcProfit (supplier) {
  profitForm.value = {
    sellPrice: currentProduct.value?.price_thb || 0,
    costCny: supplier.price,
    packaging: 5,
    shipping: 0,
    supplierId: supplier.id
  }
  profitResult.value = null
  profitDialog.value = true
}

async function submitProfit () {
  const res = await profitApi.calculate({
    shopeeProductId: currentProduct.value.id,
    supplierId: profitForm.value.supplierId,
    packagingCostThb: profitForm.value.packaging,
    shippingCostThb: profitForm.value.shipping
  })
  profitResult.value = res.data
}

// 手动刷新商品列表
async function refreshProducts() {
  refreshing.value = true
  try {
    const currentProductId = currentProduct.value?.id
    await loadProducts()
    // 刷新后保持选中之前的商品
    if (currentProductId) {
      const p = products.value.find(item => item.id === currentProductId)
      if (p) selectProduct(p)
    }
    ElMessage.success('列表已刷新')
  } finally {
    refreshing.value = false
  }
}

// 自动刷新监听
watch(autoRefresh, (val) => {
  if (val) {
    // 每5秒自动刷新一次
    autoRefreshInterval.value = setInterval(async () => {
      await loadProducts()
      // 如果有当前选中的商品，同步刷新供应商列表
      if (currentProduct.value) {
        await matchStore.loadSuppliers(currentProduct.value.id)
      }
    }, 5000)
    ElMessage.success('已开启自动刷新，每5秒更新一次')
  } else {
    if (autoRefreshInterval.value) {
      clearInterval(autoRefreshInterval.value)
      autoRefreshInterval.value = null
    }
    ElMessage.info('已关闭自动刷新')
  }
})

// 页面卸载时清除定时器
onUnmounted(() => {
  if (autoRefreshInterval.value) {
    clearInterval(autoRefreshInterval.value)
  }
})
</script>

<style scoped>
.product-list { max-height: 500px; overflow-y: auto; }
.product-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px; cursor: pointer; border-radius: 6px;
  border-bottom: 1px solid #f5f5f5; transition: background .15s;
}
.product-row:hover { background: #f8f8f8; }
.product-row.active { background: #fff3f0; border-left: 3px solid #ee4d2d; }
.product-title { font-size: 12px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.supplier-card {
  border: 1px solid #eee; border-radius: 8px; padding: 12px;
  margin-bottom: 10px; transition: border-color .2s;
}
.supplier-card:hover { border-color: #ee4d2d; }
.supplier-card.selected { border-color: #67c23a; background: #f0faf0; }
</style>
