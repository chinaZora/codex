const sharp = require('sharp')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const logger = require('../utils/logger')

const HASH_SIZE = 8 // 8x9 = 72位 dHash
const IMAGE_CACHE = new Map() // 图片特征缓存：url -> hash

/**
 * 图片预处理：修正方向、居中裁剪、标准化
 */
async function preprocessImage (imagePath) {
  // 自动修正EXIF方向，调整为正方形居中裁剪，统一尺寸
  return sharp(imagePath)
    .rotate() // 自动修正方向
    .resize(HASH_SIZE + 1, HASH_SIZE, {
      fit: 'cover',
      position: 'centre' // 居中裁剪，避免拉伸失真
    })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
}

/**
 * 计算图片的差异哈希（dHash）：比aHash准确率更高，对亮度变化不敏感
 * 返回 64 位 BigInt
 */
async function computeHash (imagePath) {
  // 检查缓存
  if (IMAGE_CACHE.has(imagePath)) {
    return IMAGE_CACHE.get(imagePath)
  }

  const { data } = await preprocessImage(imagePath)

  // dHash算法：比较相邻像素差异
  let hash = 0n
  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      const left = data[y * (HASH_SIZE + 1) + x]
      const right = data[y * (HASH_SIZE + 1) + x + 1]
      hash |= (left > right ? 1n : 0n) << BigInt(y * HASH_SIZE + x)
    }
  }

  // 存入缓存，1小时过期
  IMAGE_CACHE.set(imagePath, hash)
  setTimeout(() => IMAGE_CACHE.delete(imagePath), 3600 * 1000)

  return hash
}

/**
 * 计算两个哈希的汉明距离
 */
function hammingDistance (h1, h2) {
  let xor = h1 ^ h2
  let dist = 0
  while (xor) {
    dist += Number(xor & 1n)
    xor >>= 1n
  }
  return dist
}

/**
 * 计算相似度 0~1，-1 表示获取失败
 */
async function computeSimilarity (localImagePath, remoteImageUrl) {
  try {
    const hash1 = await computeHash(localImagePath)

    // 下载远程图片到临时文件
    const tmpPath = localImagePath + '.tmp_compare'
    const resp = await axios({
      url: remoteImageUrl,
      responseType: 'arraybuffer',
      timeout: 8000
    })
    fs.writeFileSync(tmpPath, resp.data)

    let hash2
    try {
      hash2 = await computeHash(tmpPath)
    } finally {
      try { fs.unlinkSync(tmpPath) } catch (_) {}
    }

    const maxBits = HASH_SIZE * HASH_SIZE
    const dist = hammingDistance(hash1, hash2)
    return 1 - dist / maxBits
  } catch (err) {
    logger.warn('Image similarity failed', { localImagePath, remoteImageUrl, error: err.message })
    return -1
  }
}

/**
 * 计算综合评分
 * @param {number} similarity - 0~1 或 -1（失败）
 * @param {number} shopScore - 0~5
 * @param {number} sales30d - 近30日销量
 * @param {number} minOrder - 最小起订量
 * @param {number} priceRatio - 价格比率（1688价格 / Shopee价格，越小越有优势）
 * @param {Array<string>} tags - 供应商标签
 * @param {Object} weights - 自定义权重配置
 */
function computeCompositeScore (similarity, shopScore, sales30d, minOrder = 1, priceRatio = 1, tags = [], weights = null) {
  // 默认权重配置
  const defaultWeights = {
    similarity: 0.45,
    shopScore: 0.15,
    sales: 0.15,
    priceAdvantage: 0.15,
    minOrder: 0.05,
    tags: 0.05
  }
  const w = weights || defaultWeights

  const cappedSales = Math.min(sales30d || 0, 10000) / 10000
  const scoreNorm = (shopScore || 0) / 5

  // 价格优势：价格越低分数越高
  const priceAdvantage = Math.max(0, 1 - Math.min(priceRatio, 1))

  // 起订量优势：起订量越低分数越高
  const minOrderScore = Math.max(0, 1 - Math.min(minOrder / 100, 1))

  // 标签加分
  const tagWeights = {
    '实力商家': 0.3,
    '包邮': 0.2,
    '7天无理由': 0.15,
    '极速退款': 0.1,
    '一件代发': 0.15,
    '正品保障': 0.1
  }
  const tagScore = tags.reduce((sum, tag) => sum + (tagWeights[tag] || 0), 0)
  const normalizedTagScore = Math.min(tagScore, 1)

  if (similarity < 0) {
    // 降级评分（无相似度数据）
    return round(
      scoreNorm * 0.3 +
      cappedSales * 0.3 +
      priceAdvantage * 0.2 +
      minOrderScore * 0.1 +
      normalizedTagScore * 0.1
    )
  }

  return round(
    similarity * w.similarity +
    scoreNorm * w.shopScore +
    cappedSales * w.sales +
    priceAdvantage * w.priceAdvantage +
    minOrderScore * w.minOrder +
    normalizedTagScore * w.tags
  )
}

function round (n) {
  return Math.round(n * 10000) / 10000
}

module.exports = { computeHash, computeSimilarity, computeCompositeScore }
