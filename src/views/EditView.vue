<template>
  <div>
    <div class="page-header">
      <h2>批量编辑</h2>
      <p>批量设置商品标题模板和定价策略，一键同步到所有选中商品</p>
    </div>

    <el-row :gutter="16">
      <!-- 左：编辑规则 -->
      <el-col :span="8">
        <el-card style="margin-bottom:16px">
          <template #header><span style="font-weight:600">编辑规则</span></template>
          <el-form :model="ruleForm" label-width="100px" label-position="top">
            <el-form-item label="标题模板">
              <el-input v-model="ruleForm.titleTemplate" placeholder="例：{title} 泰国现货 包邮"
                clearable />
              <div style="font-size:12px;color:#999;margin-top:4px">
                <code>{title}</code> 会替换为原始中文标题
              </div>
            </el-form-item>
            <el-form-item label="定价倍率">
              <el-slider v-model="ruleForm.priceRatio" :min="1.5" :max="5" :step="0.1"
                show-input :input-size="'small'" />
              <div style="font-size:12px;color:#999;margin-top:4px">
                建议 2.0×～3.5×，确保覆盖头程 + 利润空间
              </div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :disabled="selected.length === 0"
                @click="applyRule" style="background:#ee4d2d;border-color:#ee4d2d;width:100%">
                应用到选中 ({{ selected.length }}) 件
              </el-button>
            </el-form-item>
            <el-form-item>
              <el-button type="success" :disabled="selected.length === 0"
                @click="saveChanges" :loading="saving" style="width:100%">
                保存修改
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 批量导出 -->
        <el-card>
          <template #header><span style="font-weight:600">导出</span></template>
          <el-button type="success" icon="Download" :disabled="selected.length === 0"
            @click="exportExcel" :loading="exporting" style="width:100%">
            导出 Excel ({{ selected.length }} 件)
          </el-button>
          <div style="font-size:12px;color:#999;margin-top:8px">
            导出包含：商品信息、选定供应商、利润核算
          </div>
        </el-card>
      </el-col>

      <!-- 右：商品表格 -->
      <el-col :span="16">
        <el-card>
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <span style="font-weight:600">商品列表（共 {{ productTotal }} 件）</span>
              <div style="display:flex;gap:8px">
                <el-input v-model="keyword" placeholder="搜索..." clearable style="width:180px" @input="onSearch" />
                <el-select v-model="filterStatus" placeholder="匹配状态" clearable style="width:120px" @change="onSearch">
                  <el-option label="未匹配" value="none" />
                  <el-option label="已匹配" value="done" />
                </el-select>
                <el-button icon="Refresh" @click="loadProducts">刷新</el-button>
              </div>
            </div>
          </template>

          <el-table :data="products" stripe v-loading="loading" row-key="id"
            @selection-change="onSelect" height="580">
            <el-table-column type="selection" width="45" />
            <el-table-column label="图片" width="64">
              <template #default="{ row }">
                <el-image :src="row.image_path || row.image_url"
                  style="width:44px;height:44px;object-fit:cover;border-radius:4px"
                  :preview-src-list="[row.image_path || row.image_url]" fit="cover" />
              </template>
            </el-table-column>
            <el-table-column label="标题" min-width="160">
              <template #default="{ row }">
                <div v-if="!editingId || editingId !== row.id">
                  <div style="font-size:13px;color:#333;line-height:1.4;cursor:pointer"
                    @dblclick="startEdit(row)" :title="'双击编辑'">
                    {{ row.title_cn || row.title_original }}
                  </div>
                  <div v-if="row._editedTitle" style="font-size:11px;color:#ee4d2d;margin-top:2px">
                    → {{ row._editedTitle }}
                  </div>
                </div>
                <el-input v-else v-model="editingTitle" size="small"
                  @blur="commitEdit(row)" @keyup.enter="commitEdit(row)" @keyup.esc="cancelEdit"
                  ref="titleInputRef" />
              </template>
            </el-table-column>
            <el-table-column label="原价(฿)" width="90">
              <template #default="{ row }">
                <div style="color:#ee4d2d;font-weight:600">฿{{ row.price_thb }}</div>
                <div style="font-size:11px;color:#999">≈¥{{ row.price_cny }}</div>
              </template>
            </el-table-column>
            <el-table-column label="调整后价格" width="100">
              <template #default="{ row }">
                <span v-if="row._editedPrice" style="color:#67c23a;font-weight:600">
                  ฿{{ row._editedPrice }}
                </span>
                <span v-else style="color:#ccc">—</span>
              </template>
            </el-table-column>
            <el-table-column label="供应商" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.selected_supplier_price" type="success" size="small">
                  ¥{{ row.selected_supplier_price }}
                </el-tag>
                <el-tag v-else type="info" size="small">未选定</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="statusType(row.match_status)" size="small">
                  {{ statusLabel(row.match_status) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <el-pagination style="margin-top:12px;text-align:right"
            :current-page="page" :page-size="pageSize" :total="productTotal"
            layout="total, sizes, prev, pager, next" :page-sizes="[20, 50, 100]"
            @current-change="p => { page = p; loadProducts() }"
            @size-change="s => { pageSize = s; page = 1; loadProducts() }" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useCrawlStore } from '../stores/crawl'
import { editApi, exportApi, configApi } from '../api/index'

const crawlStore = useCrawlStore()
const keyword = ref('')
const filterStatus = ref('')
const page = ref(1)
const pageSize = ref(50)
const products = computed(() => crawlStore.products)
const productTotal = computed(() => crawlStore.productTotal)
const loading = computed(() => crawlStore.loading)

const ruleForm = ref({ titleTemplate: '', priceRatio: 2.5 })
const selected = ref([])
const saving = ref(false)
const exporting = ref(false)
const exchangeRate = ref(0.19)

// 内联编辑
const editingId = ref(null)
const editingTitle = ref('')
const titleInputRef = ref(null)

onMounted(async () => {
  // 加载汇率配置
  try {
    const res = await configApi.getAll()
    const rate = parseFloat(res.data?.exchange_rate)
    if (rate > 0) exchangeRate.value = rate
  } catch (_) {}
  // 恢复从商品页跳转的已选商品
  const saved = localStorage.getItem('editSelected')
  if (saved) {
    try {
      const list = JSON.parse(saved)
      localStorage.removeItem('editSelected')
      // 等加载完毕后高亮
    } catch {}
  }
  loadProducts()
})

async function loadProducts () {
  await crawlStore.loadProducts({
    page: page.value, pageSize: pageSize.value,
    keyword: keyword.value, matchStatus: filterStatus.value
  })
}

function onSearch () { page.value = 1; loadProducts() }
function onSelect (rows) { selected.value = rows }

function applyRule () {
  const { titleTemplate, priceRatio } = ruleForm.value
  selected.value.forEach(p => {
    if (titleTemplate) {
      const base = p.title_cn || p.title_original || ''
      p._editedTitle = titleTemplate.replace('{title}', base)
    }
    if (priceRatio && p.price_cny) {
      p._editedPrice = (p.price_cny / exchangeRate.value * priceRatio).toFixed(0)
    }
  })
  ElMessage.success(`已预览应用到 ${selected.value.length} 件，点击「保存修改」提交`)
}

async function saveChanges () {
  const toSave = selected.value.filter(p => p._editedTitle || p._editedPrice)
  if (toSave.length === 0) return ElMessage.warning('没有待保存的修改')
  saving.value = true
  try {
    const updates = toSave.map(p => ({
      id: p.id,
      titleTemplate: ruleForm.value.titleTemplate || undefined,
      priceRatio: ruleForm.value.priceRatio || undefined
    }))
    await editApi.batchUpdate(updates)
    toSave.forEach(p => { p._editedTitle = null; p._editedPrice = null })
    ElMessage.success(`已保存 ${toSave.length} 件商品修改`)
    await loadProducts()
  } finally {
    saving.value = false
  }
}

async function exportExcel () {
  if (selected.value.length === 0) return ElMessage.warning('请先选择商品')
  exporting.value = true
  try {
    const ids = selected.value.map(p => p.id)
    const response = await exportApi.excel(ids)
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `erp-export-${Date.now()}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('Excel 导出成功')
  } finally {
    exporting.value = false
  }
}

function startEdit (row) {
  editingId.value = row.id
  editingTitle.value = row._editedTitle || row.title_cn || row.title_original || ''
  nextTick(() => titleInputRef.value?.focus())
}

function commitEdit (row) {
  if (editingTitle.value.trim()) {
    row._editedTitle = editingTitle.value.trim()
  }
  editingId.value = null
}

function cancelEdit () {
  editingId.value = null
}

function statusType (s) {
  return { none: 'info', pending: '', running: 'warning', done: 'success', failed: 'danger' }[s] || 'info'
}
function statusLabel (s) {
  return { none: '未匹配', pending: '待匹配', running: '匹配中', done: '已匹配', failed: '失败' }[s] || s
}
</script>
