import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import './styles/index.css'
import { createI18n } from 'vue-i18n'
import { useDexie } from './composables/useDexie'
import messages from './locales'
import { registerSW } from 'virtual:pwa-register'
import { useLemmaDictSharedWorker } from './composables/useLemmaDictSharedWorker'
import router from './router'

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
  app.use(router)
  app.use(ElementPlus)
  app.use(i18n)
  app.mount('#app')

  // Preload lemma dictionary in background (idle) to avoid delay on first consistency check
  try {
    const warmLemmaDict = () => {
      try {
        const lemmaWorker = useLemmaDictSharedWorker()
        lemmaWorker.ensure()
      } catch (e) {
        console.warn('Lemma dictionary preload failed', e)
      }
    }
    const win = window as any
    if (typeof win.requestIdleCallback === 'function') {
      win.requestIdleCallback(warmLemmaDict, { timeout: 2000 })
    } else {
      setTimeout(warmLemmaDict, 0)
    }
  } catch (e) {
    console.warn('Lemma dictionary preload scheduling failed', e)
  }

  // Required for installability (Chrome shows the install icon only when a SW is registered)
  registerSW({ immediate: true })
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
