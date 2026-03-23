const sharp = require('sharp')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const logger = require('../utils/logger')

const HASH_SIZE = 8 // 8x8 = 64位 aHash

/**
 * 计算图片的平均哈希（aHash）
 * 返回 64 位 BigInt
 */
async function computeHash (imagePath) {
  const { data } = await sharp(imagePath)
    .resize(HASH_SIZE, HASH_SIZE, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const avg = data.reduce((s, v) => s + v, 0) / data.length
  let hash = 0n
  for (let i = 0; i < data.length; i++) {
    hash |= (data[i] >= avg ? 1n : 0n) << BigInt(i)
  }
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
 */
function computeCompositeScore (similarity, shopScore, sales30d) {
  const cappedSales = Math.min(sales30d || 0, 10000) / 10000
  const scoreNorm = (shopScore || 0) / 5

  if (similarity < 0) {
    // 降级评分（无相似度数据）
    return round(scoreNorm * 0.6 + cappedSales * 0.4)
  }
  return round(similarity * 0.5 + scoreNorm * 0.3 + cappedSales * 0.2)
}

function round (n) {
  return Math.round(n * 10000) / 10000
}

module.exports = { computeHash, computeSimilarity, computeCompositeScore }
