<template>
  <div>
    <div class="page-header">
      <h2>系统设置</h2>
      <p>配置 API 密钥、汇率、利润默认值及供应商筛选规则</p>
    </div>

    <div v-loading="loading">
      <!-- 基础配置 -->
      <el-card style="margin-bottom:16px">
        <template #header>
          <span style="font-weight:600">基础配置</span>
        </template>
        <el-form :model="cfg" label-width="160px">
          <el-form-item label="翻译服务商">
            <el-select v-model="cfg.llm_provider" style="width:220px">
              <el-option label="DeepSeek" value="deepseek" />
              <el-option label="OpenAI" value="openai" />
              <el-option label="阿里百炼" value="alibaba" />
            </el-select>
          </el-form-item>
          <el-form-item label="DeepSeek API Key" v-if="cfg.llm_provider === 'deepseek'">
            <el-input v-model="cfg.deepseek_api_key" placeholder="sk-..." show-password style="width:360px" />
            <el-button style="margin-left:8px" @click="testApi" :loading="testing">测试连接</el-button>
            <el-tag v-if="testResult !== null" :type="testResult ? 'success' : 'danger'" style="margin-left:8px">
              {{ testResult ? '连接成功' : '连接失败' }}
            </el-tag>
          </el-form-item>
          <el-form-item label="OpenAI API Key" v-if="cfg.llm_provider === 'openai'">
            <el-input v-model="cfg.openai_api_key" placeholder="sk-..." show-password style="width:360px" />
          </el-form-item>
          <el-form-item label="OpenAI 模型" v-if="cfg.llm_provider === 'openai'">
            <el-input v-model="cfg.openai_model" placeholder="gpt-4.1" style="width:220px" />
            <el-button style="margin-left:8px" @click="testApi" :loading="testing">测试连接</el-button>
            <el-tag v-if="testResult !== null" :type="testResult ? 'success' : 'danger'" style="margin-left:8px">
              {{ testResult ? '连接成功' : '连接失败' }}
            </el-tag>
          </el-form-item>
          <el-form-item label="阿里 API Key" v-if="cfg.llm_provider === 'alibaba'">
            <el-input v-model="cfg.alibaba_api_key" placeholder="sk-..." show-password style="width:360px" />
          </el-form-item>
          <el-form-item label="阿里模型" v-if="cfg.llm_provider === 'alibaba'">
            <el-input v-model="cfg.alibaba_model" placeholder="qwen-plus / 你的 codeplan 模型名" style="width:260px" />
          </el-form-item>
          <el-form-item label="阿里接口地址" v-if="cfg.llm_provider === 'alibaba'">
            <el-input v-model="cfg.alibaba_endpoint" placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions" style="width:500px" />
            <el-button style="margin-left:8px" @click="testApi" :loading="testing">测试连接</el-button>
            <el-tag v-if="testResult !== null" :type="testResult ? 'success' : 'danger'" style="margin-left:8px">
              {{ testResult ? '连接成功' : '连接失败' }}
            </el-tag>
          </el-form-item>
          <el-form-item label="THB→CNY 汇率">
            <el-input-number v-model="cfg.exchange_rate" :precision="4" :step="0.001" :min="0.01" :max="1" />
            <span style="margin-left:8px;color:#666;font-size:13px">当前 1 CNY ≈ {{ (1/cfg.exchange_rate).toFixed(2) }} THB</span>
          </el-form-item>
          <el-form-item label="代理地址">
            <el-input v-model="cfg.proxy_url" placeholder="http://127.0.0.1:7890（留空不使用代理）" style="width:360px" />
          </el-form-item>
          <el-form-item label="采集翻页延迟(ms)">
            <el-input-number v-model="cfg.crawl_page_delay_ms" :min="500" :max="10000" :step="100" />
            <span style="margin-left:8px;color:#999;font-size:12px">建议 1000-3000ms，过低易被封</span>
          </el-form-item>
          <el-form-item label="1688 登录 Cookie">
            <el-input v-model="cfg.alibaba_cookie" type="textarea" :rows="3"
              placeholder="从浏览器开发者工具 → Network → 1688 请求 Headers 中复制 cookie 字段（必填，否则 1688 匹配功能无法使用）"
              style="width:500px" />
            <div style="font-size:12px;color:#999;margin-top:4px">
              登录 1688.com / 1688手机版，按 F12 → Network → 任意请求 → Request Headers → 复制 cookie 字段全文
            </div>
          </el-form-item>
          <el-form-item label="Apify API Token">
            <el-input v-model="cfg.apify_api_token" placeholder="apify_api_..." show-password style="width:360px" />
            <span style="margin-left:8px;color:#999;font-size:13px">用于Apify平台采集Shopee商品</span>
          </el-form-item>
          <el-form-item label="Apify Actor ID">
            <el-input v-model="cfg.apify_actor_id" placeholder="best_scraper/shopee-scraper" style="width:360px" />
            <span style="margin-left:8px;color:#999;font-size:13px">默认值：best_scraper/shopee-scraper</span>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 利润核算默认值 -->
      <el-card style="margin-bottom:16px">
        <template #header>
          <span style="font-weight:600">利润核算默认值</span>
        </template>
        <el-form :model="cfg" label-width="160px">
          <el-form-item label="默认包装费(THB)">
            <el-input-number v-model="cfg.default_packaging_cost" :min="0" :step="1" />
          </el-form-item>
          <el-form-item label="默认头程费(THB)">
            <el-input-number v-model="cfg.default_shipping_cost" :min="0" :step="5" />
          </el-form-item>
          <el-form-item label="平台佣金率(%)">
            <el-input-number v-model="cfg.platform_fee_pct" :min="0" :max="50" :step="0.5" :precision="1" />
            <span style="margin-left:8px;color:#999;font-size:12px">Shopee 泰国站通常 2%~5%</span>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 供应商筛选规则 -->
      <el-card style="margin-bottom:16px">
        <template #header>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600">供应商筛选规则</span>
            <el-tooltip content="这些规则用于自动过滤 1688 匹配结果，仅保留满足条件的优质供应商" placement="top">
              <el-icon style="color:#999;cursor:help"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
        </template>
        <el-form :model="cfg" label-width="200px">
          <el-form-item label="最高进价倍率（相对售价）">
            <el-input-number v-model="cfg.filter_price_ratio" :min="0.1" :max="0.9" :step="0.05" :precision="2" />
            <span style="margin-left:8px;color:#999;font-size:12px">供应商价×汇率 ÷ 泰铢售价 ≤ 此值</span>
          </el-form-item>
          <el-form-item label="最大起订量(件)">
            <el-input-number v-model="cfg.filter_max_moq" :min="1" :max="1000" :step="10" />
          </el-form-item>
          <el-form-item label="最低店铺评分">
            <el-slider v-model="cfg.filter_min_score" :min="1" :max="5" :step="0.1" show-input :input-size="'small'" style="width:400px" />
          </el-form-item>
          <el-form-item label="最低近30日销量">
            <el-input-number v-model="cfg.filter_min_sales" :min="0" :step="100" />
          </el-form-item>
          <el-form-item label="要求「实力商家」标签">
            <el-switch v-model="cfg.filter_require_power_merchant" />
          </el-form-item>
          <el-form-item label="要求「包邮」标签">
            <el-switch v-model="cfg.filter_require_free_ship" />
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 多账号管理 -->
      <el-card style="margin-bottom:16px">
        <template #header>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600">Shopee 账号管理</span>
            <el-button size="small" type="primary" @click="addAccount"
              style="background:#ee4d2d;border-color:#ee4d2d">添加账号</el-button>
          </div>
        </template>
        <el-table :data="accounts" stripe>
          <el-table-column prop="name" label="账号名称" min-width="120" />
          <el-table-column prop="cookie" label="Cookie（前50字）" min-width="200">
            <template #default="{ row }">
              <span style="font-size:12px;color:#666">{{ (row.cookie || '').slice(0, 50) }}...</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.is_default ? 'success' : ''" size="small">
                {{ row.is_default ? '默认' : '备用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" link @click="setDefault(row)" v-if="!row.is_default">设为默认</el-button>
              <el-button size="small" link type="primary" @click="editAccount(row)">编辑</el-button>
              <el-button size="small" link type="danger" @click="deleteAccount(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- 保存按钮 -->
      <div style="text-align:center;margin-top:24px">
        <el-button type="primary" size="large" @click="saveConfig" :loading="saving"
          style="background:#ee4d2d;border-color:#ee4d2d;width:200px">
          保存所有设置
        </el-button>
      </div>
    </div>

    <!-- 账号编辑对话框 -->
    <el-dialog v-model="accountDialog" :title="accountForm.id ? '编辑账号' : '添加账号'" width="500px">
      <el-form :model="accountForm" label-width="100px">
        <el-form-item label="账号名称">
          <el-input v-model="accountForm.name" placeholder="如：泰国主账号" />
        </el-form-item>
        <el-form-item label="Cookie">
          <el-input v-model="accountForm.cookie" type="textarea" :rows="4"
            placeholder="从浏览器开发者工具 → Network 中复制 Request Headers 里的 cookie 字段" />
          <div style="font-size:12px;color:#999;margin-top:4px">
            用于绕过 Shopee 登录验证，Cookie 有效期通常为 7-30 天
          </div>
        </el-form-item>
        <el-form-item label="设为默认">
          <el-switch v-model="accountForm.isDefault" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="accountDialog = false">取消</el-button>
        <el-button type="primary" @click="saveAccount" style="background:#ee4d2d;border-color:#ee4d2d">
          {{ accountForm.id ? '更新' : '添加' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { configApi, accountApi } from '../api/index'

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const testResult = ref(null)

const cfg = ref({
  llm_provider: 'deepseek',
  deepseek_api_key: '',
  openai_api_key: '',
  openai_model: 'gpt-4.1',
  alibaba_api_key: '',
  alibaba_model: 'qwen-plus',
  alibaba_endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  exchange_rate: 0.19,
  proxy_url: '',
  alibaba_cookie: '',
  crawl_page_delay_ms: 1500,
  apify_api_token: '',
  apify_actor_id: 'vdrmota/shopee-scraper',
  default_packaging_cost: 5,
  default_shipping_cost: 0,
  platform_fee_pct: 2,
  filter_price_ratio: 0.6,
  filter_max_moq: 200,
  filter_min_score: 4.0,
  filter_min_sales: 100,
  filter_require_power_merchant: false,
  filter_require_free_ship: false
})

const accounts = ref([])
const accountDialog = ref(false)
const accountForm = ref({ id: null, name: '', cookie: '', isDefault: false })

onMounted(async () => {
  loading.value = true
  try {
    const [cfgRes, accRes] = await Promise.all([configApi.getAll(), accountApi.list()])
    const data = cfgRes.data || {}
    // 合并服务端配置（类型转换）
    Object.keys(cfg.value).forEach(k => {
      if (data[k] !== undefined) {
        const v = data[k]
        if (typeof cfg.value[k] === 'number') cfg.value[k] = parseFloat(v) || 0
        else if (typeof cfg.value[k] === 'boolean') cfg.value[k] = v === 'true' || v === true || v === 1
        else cfg.value[k] = v
      }
    })
    // platform_fee_pct 在 DB 以小数存储（如 0.02），UI 以百分比展示（如 2）
    if (data.platform_fee_pct !== undefined) {
      cfg.value.platform_fee_pct = Math.round(parseFloat(data.platform_fee_pct) * 10000) / 100
    }
    accounts.value = accRes.data || []
  } finally {
    loading.value = false
  }
})

async function saveConfig () {
  saving.value = true
  try {
    const kvMap = {}
    Object.keys(cfg.value).forEach(k => {
      kvMap[k] = String(cfg.value[k])
    })
    // platform_fee_pct 以小数存储（UI 是百分比，÷100 后存入）
    kvMap.platform_fee_pct = String(cfg.value.platform_fee_pct / 100)
    await configApi.setAll(kvMap)
    ElMessage.success('设置已保存')
  } finally {
    saving.value = false
  }
}

async function testApi () {
  const provider = cfg.value.llm_provider || 'deepseek'
  const apiKey = provider === 'openai'
    ? cfg.value.openai_api_key
    : (provider === 'alibaba' ? cfg.value.alibaba_api_key : cfg.value.deepseek_api_key)
  const model = provider === 'openai'
    ? cfg.value.openai_model
    : (provider === 'alibaba' ? cfg.value.alibaba_model : undefined)
  const endpoint = provider === 'alibaba' ? cfg.value.alibaba_endpoint : undefined
  if (!apiKey) return ElMessage.warning('请先输入 API Key')
  testing.value = true
  testResult.value = null
  try {
    const res = await configApi.testConnection({ provider, apiKey, model, endpoint })
    testResult.value = res.data?.ok === true
    if (!testResult.value) ElMessage.error(res.data?.error || '连接失败')
  } catch {
    testResult.value = false
  } finally {
    testing.value = false
  }
}

function addAccount () {
  accountForm.value = { id: null, name: '', cookie: '', isDefault: false }
  accountDialog.value = true
}

function editAccount (row) {
  accountForm.value = { id: row.id, name: row.name, cookie: row.cookie || '', isDefault: !!row.is_default }
  accountDialog.value = true
}

async function saveAccount () {
  if (!accountForm.value.name) return ElMessage.warning('账号名称不能为空')
  const { id, name, cookie, isDefault } = accountForm.value
  if (id) {
    await accountApi.update(id, { name, cookie, isDefault })
    ElMessage.success('账号已更新')
  } else {
    await accountApi.create({ name, cookie, isDefault })
    ElMessage.success('账号已添加')
  }
  accountDialog.value = false
  const res = await accountApi.list()
  accounts.value = res.data || []
}

async function setDefault (row) {
  await accountApi.setDefault(row.id)
  const res = await accountApi.list()
  accounts.value = res.data || []
  ElMessage.success(`已将「${row.name}」设为默认账号`)
}

async function deleteAccount (row) {
  await ElMessageBox.confirm(`确认删除账号「${row.name}」？`, '提示', { type: 'warning' })
  await accountApi.remove(row.id)
  accounts.value = accounts.value.filter(a => a.id !== row.id)
  ElMessage.success('账号已删除')
}
</script>
