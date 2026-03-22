# Shopee-ERP

[中文](#中文介绍) | [English](#english)

---

## 中文介绍

Shopee-ERP 是一个面向跨境电商选品与同款匹配场景的本地桌面工具，聚焦 Shopee 泰国站商品采集、1688 供应商匹配、批量编辑与导出流程。

### 项目简介

这个项目把常见的选品动作集中到一个本地应用里完成：

- 采集 Shopee 商品列表
- 识别标题、价格、销量与详情链接
- 生成中文标题和搜索关键词
- 匹配 1688 同款供应商
- 批量编辑商品信息
- 导出 Excel 结果

项目支持 macOS 和 Windows。

### 技术栈

- Electron 28
- Vue 3 + Element Plus + Vite
- Express 4
- SQLite
- Axios / Cheerio / Puppeteer

### 演示说明

项目当前包含 4 个主要页面：

1. 商品采集  
   输入关键词后抓取 Shopee 商品，展示图片、标题、价格、销量、匹配状态，并支持“查看详情”跳转到商品原始链接。
2. 1688 匹配  
   对采集结果进行同款搜索，展示候选供应商、价格、评分、销量等信息。
3. 批量编辑  
   对已采集商品批量修改标题、价格等字段。
4. 系统设置  
   配置 DeepSeek API Key、1688 Cookie、代理地址、汇率和筛选参数。

### 快速开始

方式一：双击启动

- macOS：双击 [start.command](./start.command)
- Windows：双击 [start.bat](./start.bat)

方式二：命令行启动

```bash
npm install
npm run launch
```

### 本地开发

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run build
npm run server
npm run electron:dev
npm test
```

### 编译说明

仓库不包含编译产物、数据库、日志和依赖目录。拿到项目后只需要执行：

```bash
npm install
npm run build
```

如果想直接运行：

```bash
npm run launch
```

### 使用前配置

首次启动后，建议在“系统设置”中配置：

- DeepSeek API Key
- 1688 Cookie
- 可选代理地址

未配置时，部分翻译、关键词提取和 1688 匹配能力会受限。

### 项目结构

```text
.
├── main.js
├── package.json
├── vite.config.js
├── start.command
├── start.bat
├── scripts/
├── server/
└── src/
```

---

## English

Shopee-ERP is a local desktop tool for cross-border e-commerce sourcing workflows, focused on Shopee Thailand product collection, 1688 supplier matching, batch editing, and Excel export.

### Project Overview

This project brings several sourcing tasks into one local application:

- collect Shopee product listings
- parse titles, prices, sales, and detail links
- generate Chinese titles and search keywords
- match similar suppliers from 1688
- batch edit collected products
- export results to Excel

It supports both macOS and Windows.

### Tech Stack

- Electron 28
- Vue 3 + Element Plus + Vite
- Express 4
- SQLite
- Axios / Cheerio / Puppeteer

### Demo Overview

The current app includes 4 main pages:

1. Product Collection  
   Search Shopee products by keyword and display image, title, price, sales, match status, and a direct detail-page link.
2. 1688 Matching  
   Match collected Shopee items with 1688 suppliers and show candidate supplier data.
3. Batch Editing  
   Update selected product fields in bulk.
4. Settings  
   Configure DeepSeek API Key, 1688 Cookie, proxy, exchange rate, and filtering rules.

### Quick Start

Option 1: double-click launch

- macOS: [start.command](./start.command)
- Windows: [start.bat](./start.bat)

Option 2: command line

```bash
npm install
npm run launch
```

### Development

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run build
npm run server
npm run electron:dev
npm test
```

### Build Notes

This repository does not include generated assets, local databases, logs, or installed dependencies. After cloning, just run:

```bash
npm install
npm run build
```

To launch the app directly:

```bash
npm run launch
```

### Required Configuration

After startup, it is recommended to configure:

- DeepSeek API Key
- 1688 Cookie
- optional proxy URL

Without them, some translation, keyword extraction, and supplier-matching features may be limited.
