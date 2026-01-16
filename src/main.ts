import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import './styles/index.css'
import { createI18n } from 'vue-i18n'
import { useDexie } from './composables/useDexie'
import messages from './locales'

const i18n = createI18n({
  legacy: false,
  locale: 'ru',
  fallbackLocale: 'en',
  messages,
})

;(async () => {
  try {
    // Initialize Dexie schema first so objectStores exist
    const db = useDexie()
    await db.init()
  } catch (e) {
    console.warn('Dexie init failed at startup', e)
  }

  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)
  app.use(ElementPlus)
  app.use(i18n)
  app.mount('#app')
})()

// Persist SQL.js DB on page unload to avoid data loss on refresh
try {
  const helper = (window as any).__dexie
  if (!helper) {
    window.addEventListener('beforeunload', async () => {
      try {
        const db = useDexie()
        await db.init()
        await db.persistToIndexedDB()
      } catch (e) {
        /* best-effort */
      }
    })
  } else {
    window.addEventListener('beforeunload', async () => {
      try { await helper.persistToIndexedDB() } catch (e) {}
    })
  }
} catch (e) {}
