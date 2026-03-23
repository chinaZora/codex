import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import {
  Connection,
  Download,
  Edit,
  QuestionFilled,
  Refresh,
  Search,
  Setting
} from '@element-plus/icons-vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'
import router from './router/index'

const app = createApp(App)

app.component('Connection', Connection)
app.component('Download', Download)
app.component('Edit', Edit)
app.component('QuestionFilled', QuestionFilled)
app.component('Refresh', Refresh)
app.component('Search', Search)
app.component('Setting', Setting)

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')
