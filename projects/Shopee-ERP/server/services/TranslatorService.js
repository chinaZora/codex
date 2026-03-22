const axios = require('axios')
const logger = require('../utils/logger')
const { retry } = require('../utils/retry')
const { getConfig } = require('./ConfigService')

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'
const BATCH_SIZE = 20

const SYSTEM_PROMPT = `你是跨境电商选品专家，精通1688批发平台搜索规律。`

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

/**
 * 解析 DeepSeek 返回内容（容错处理）
 */
function parseResponse (content, count) {
  // 尝试提取 JSON 代码块
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content.trim()

  try {
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed) && parsed.length === count) return parsed
  } catch (_) {}

  // 尝试提取第一个 JSON 数组
  const arrMatch = jsonStr.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0])
      if (Array.isArray(parsed)) return parsed
    } catch (_) {}
  }

  return null
}

/**
 * 降级结果：title_cn 保留原文，keywords 为 [原文]
 */
function fallbackResult (titles) {
  return titles.map(t => ({ title_cn: t, keywords: [t] }))
}

/**
 * 翻译并提取关键词（批量，每批最多 BATCH_SIZE 条）
 * @param {string[]} titles - 原文标题数组
 * @returns {Array<{title_cn, keywords}>}
 */
async function translateBatch (titles) {
  const apiKey = getConfig('deepseek_api_key')
  if (!apiKey) {
    logger.warn('DeepSeek API key not configured, using fallback')
    return fallbackResult(titles)
  }

  try {
    const result = await retry(async () => {
      const resp = await axios.post(DEEPSEEK_API, {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(titles) }
        ],
        temperature: 0.1,
        max_tokens: 2000
      }, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      })
      return resp.data.choices[0].message.content
    }, { retries: 2, baseDelay: 1000, onRetry: (n, e) => logger.warn(`DeepSeek retry ${n}`, { error: e.message }) })

    const parsed = parseResponse(result, titles.length)
    if (parsed) return parsed

    logger.warn('DeepSeek returned unparseable JSON, using fallback')
    return fallbackResult(titles)
  } catch (err) {
    logger.error('DeepSeek translation failed', { error: err.message })
    return fallbackResult(titles)
  }
}

/**
 * 分批翻译大量标题
 */
async function translateAll (titles) {
  const results = []
  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    const batch = titles.slice(i, i + BATCH_SIZE)
    const batchResult = await translateBatch(batch)
    results.push(...batchResult)
  }
  return results
}

/**
 * 测试 API Key 连通性
 * @param {string} [tempKey] - 可选临时 key（前端未保存时使用）
 */
async function testConnection (tempKey) {
  const apiKey = tempKey || getConfig('deepseek_api_key')
  if (!apiKey) throw new Error('API Key 未配置')
  const start = Date.now()
  await axios.post(DEEPSEEK_API, {
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: '你好' }],
    max_tokens: 10
  }, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 10000
  })
  return { ok: true, latencyMs: Date.now() - start }
}

module.exports = { translateAll, testConnection }
