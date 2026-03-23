const axios = require('axios')
const logger = require('../utils/logger')
const { retry } = require('../utils/retry')
const { getConfig } = require('./ConfigService')

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'
const OPENAI_API = 'https://api.openai.com/v1/chat/completions'
const ALIBABA_API = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const BATCH_SIZE = 20

const SYSTEM_PROMPT = '你是跨境电商选品专家，精通1688批发平台搜索规律。'

function buildUserPrompt (titles) {
  return `对以下泰文/英文商品标题，请完成：
1. 翻译成简洁中文标题（20字以内）
2. 提取3~5个适合在1688批发平台搜索的纯中文关键词，要求：
   - 优先使用品类+材质/工艺词，如"S925银耳环""珍珠发夹""棉麻T恤"
   - 关键词必须是中文（禁止包含泰文、英文品牌名）
   - 从最具体到最通用排序，如["星形锆石发夹","发夹批发","头饰"]
   - 每个关键词2~10个汉字

输入（JSON数组）：${JSON.stringify(titles)}

输出格式（严格JSON数组，不含markdown或额外文字）：
[{"title_cn":"中文标题","keywords":["关键词1","关键词2","关键词3"]},...]`
}

function parseResponse (content, count) {
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content.trim()

  try {
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed) && parsed.length === count) return parsed
  } catch (_) {}

  const arrMatch = jsonStr.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0])
      if (Array.isArray(parsed)) return parsed
    } catch (_) {}
  }

  return null
}

function fallbackResult (titles) {
  return titles.map(t => ({ title_cn: t, keywords: [t] }))
}

function getLlmConfig (override = {}) {
  const provider = override.provider || getConfig('llm_provider') || 'deepseek'
  if (provider === 'openai') {
    return {
      provider,
      apiKey: override.apiKey || getConfig('openai_api_key'),
      model: override.model || getConfig('openai_model') || 'gpt-4.1',
      endpoint: OPENAI_API
    }
  }

  if (provider === 'alibaba') {
    return {
      provider,
      apiKey: override.apiKey || getConfig('alibaba_api_key'),
      model: override.model || getConfig('alibaba_model') || 'qwen-plus',
      endpoint: override.endpoint || getConfig('alibaba_endpoint') || ALIBABA_API
    }
  }

  return {
    provider: 'deepseek',
    apiKey: override.apiKey || getConfig('deepseek_api_key'),
    model: override.model || 'deepseek-chat',
    endpoint: DEEPSEEK_API
  }
}

function buildHeaders (apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }
}

async function requestChatCompletion ({ endpoint, apiKey, model, messages, maxTokens = 2000 }) {
  const resp = await axios.post(endpoint, {
    model,
    messages,
    temperature: 0.1,
    max_tokens: maxTokens
  }, {
    headers: buildHeaders(apiKey),
    timeout: 30000
  })

  return resp.data?.choices?.[0]?.message?.content || ''
}

async function translateBatch (titles) {
  const llm = getLlmConfig()
  if (!llm.apiKey) {
    logger.warn(`${llm.provider} API key not configured, using fallback`)
    return fallbackResult(titles)
  }

  try {
    const result = await retry(async () => requestChatCompletion({
      endpoint: llm.endpoint,
      apiKey: llm.apiKey,
      model: llm.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(titles) }
      ]
    }), {
      retries: 2,
      baseDelay: 1000,
      onRetry: (n, e) => logger.warn(`${llm.provider} retry ${n}`, { error: e.message })
    })

    const parsed = parseResponse(result, titles.length)
    if (parsed) return parsed

    logger.warn(`${llm.provider} returned unparseable JSON, using fallback`)
    return fallbackResult(titles)
  } catch (err) {
    logger.error(`${llm.provider} translation failed`, { error: err.message })
    return fallbackResult(titles)
  }
}

async function translateAll (titles) {
  const results = []
  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    const batch = titles.slice(i, i + BATCH_SIZE)
    const batchResult = await translateBatch(batch)
    results.push(...batchResult)
  }
  return results
}

async function testConnection ({ provider, apiKey, model, endpoint } = {}) {
  const llm = getLlmConfig({ provider, apiKey, model, endpoint })
  if (!llm.apiKey) throw new Error('API Key 未配置')

  const start = Date.now()
  await requestChatCompletion({
    endpoint: llm.endpoint,
    apiKey: llm.apiKey,
    model: llm.model,
    messages: [{ role: 'user', content: '你好' }],
    maxTokens: 10
  })
  return { ok: true, latencyMs: Date.now() - start, provider: llm.provider, model: llm.model }
}

module.exports = { translateAll, testConnection, getLlmConfig }
