import { describe, expect, it } from 'vitest'
import scraper from './ShopeeScraperService.js'

const { parseSoldCount, extractShopeeIds, extractHistoricalSold } = scraper

describe('ShopeeScraperService helpers', () => {
  it('parses sold count in English, Chinese, and Thai formats', () => {
    expect(parseSoldCount('1.2k sold')).toBe(1200)
    expect(parseSoldCount('已售 356')).toBe(356)
    expect(parseSoldCount('ขายแล้ว 2.5พัน ชิ้น')).toBe(2500)
    expect(parseSoldCount('ขายไปแล้ว 1.2หมื่น')).toBe(12000)
  })

  it('extracts item and shop ids from product and similar-product urls', () => {
    expect(
      extractShopeeIds('https://shopee.co.th/demo-product-i.1172482472.24826770134')
    ).toEqual({ shopId: '1172482472', itemId: '24826770134' })

    expect(
      extractShopeeIds('', '/find_similar_products?catid=100009&itemid=24826770134&shopid=1172482472')
    ).toEqual({ shopId: '1172482472', itemId: '24826770134' })
  })

  it('extracts historical sold from different API payload shapes', () => {
    expect(extractHistoricalSold({ item: { historical_sold: 88 } })).toBe(88)
    expect(extractHistoricalSold({ data: { item: { historical_sold: 99 } } })).toBe(99)
    expect(extractHistoricalSold({ data: { historical_sold: 120 } })).toBe(120)
    expect(extractHistoricalSold({})).toBe(0)
  })
})
