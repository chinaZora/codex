import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/collect' },
  { path: '/collect', component: () => import('../views/CollectView.vue'), meta: { title: '商品采集' } },
  { path: '/match', component: () => import('../views/MatchView.vue'), meta: { title: '1688匹配' } },
  { path: '/edit', component: () => import('../views/EditView.vue'), meta: { title: '批量编辑' } },
  { path: '/settings', component: () => import('../views/SettingsView.vue'), meta: { title: '系统设置' } }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
