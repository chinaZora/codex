<template>
  <div class="app-layout">
    <!-- 左侧导航 -->
    <aside class="sidebar">
      <div class="logo">
        <span class="logo-icon">🛒</span>
        <span class="logo-text">跨境ERP</span>
      </div>
      <nav>
        <router-link to="/collect" class="nav-item">
          <el-icon><Search /></el-icon><span>商品采集</span>
        </router-link>
        <router-link to="/match" class="nav-item">
          <el-icon><Connection /></el-icon><span>1688匹配</span>
        </router-link>
        <router-link to="/edit" class="nav-item">
          <el-icon><Edit /></el-icon><span>批量编辑</span>
        </router-link>
        <router-link to="/settings" class="nav-item">
          <el-icon><Setting /></el-icon><span>系统设置</span>
        </router-link>
      </nav>
      <div class="sidebar-footer">
        <el-tag :type="sseStore.connected ? 'success' : 'danger'" size="small">
          {{ sseStore.connected ? '服务在线' : '服务离线' }}
        </el-tag>
      </div>
    </aside>

    <!-- 主内容 -->
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useSseStore } from './stores/sse'
import { useCrawlStore } from './stores/crawl'
import { useMatchStore } from './stores/match'

const sseStore = useSseStore()
const crawlStore = useCrawlStore()
const matchStore = useMatchStore()

onMounted(() => {
  sseStore.connect()
  crawlStore.initSse()
  matchStore.initSse()
})
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Microsoft YaHei', -apple-system, sans-serif; background: #f0f2f5; }

.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  width: 200px;
  min-width: 200px;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  display: flex;
  flex-direction: column;
  padding: 0;
}

.logo {
  padding: 20px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.logo-icon { font-size: 24px; }
.logo-text { color: #fff; font-size: 16px; font-weight: 700; }

nav { flex: 1; padding: 12px 0; }
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  color: rgba(255,255,255,0.7);
  text-decoration: none;
  font-size: 14px;
  transition: all 0.2s;
}
.nav-item:hover { color: #fff; background: rgba(255,255,255,0.1); }
.nav-item.router-link-active { color: #ee4d2d; background: rgba(238,77,45,0.15); border-right: 3px solid #ee4d2d; }

.sidebar-footer { padding: 16px; border-top: 1px solid rgba(255,255,255,0.1); }

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: #f0f2f5;
}

/* 通用卡片 */
.page-header { margin-bottom: 20px; }
.page-header h2 { font-size: 20px; font-weight: 700; color: #1a1a2e; }
.page-header p { color: #666; font-size: 13px; margin-top: 4px; }
</style>
