import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import { defineAsyncComponent } from 'vue'

// Import components (use async for better code-splitting)
const KeywordsPage = defineAsyncComponent(
  () => import('../components/pages/KeywordsPage.vue')
)
const KeywordsFilter = defineAsyncComponent(
  () => import('../components/pages/KeywordsFilter.vue')
)
const ClassificationPage = defineAsyncComponent(
  () => import('../components/pages/ClassificationPage.vue')
)
const AiModeratorPage = defineAsyncComponent(
  () => import('../components/pages/AiModeratorPage.vue')
)
const ConsistencyCheckPage = defineAsyncComponent(
  () => import('../components/pages/ConsistencyCheckPage.vue')
)
const ClusteringPage = defineAsyncComponent(
  () => import('../components/pages/ClusteringPage.vue')
)
const IntegrationsPage = defineAsyncComponent(
  () => import('../components/pages/IntegrationsPage.vue')
)
const SettingsPage = defineAsyncComponent(
  () => import('../components/pages/SettingsPage.vue')
)

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/keywords'
  },
  {
    path: '/keywords',
    name: 'Keywords',
    component: KeywordsPage,
    meta: { title: 'Keywords' }
  },
  {
    path: '/filter',
    name: 'KeywordsFilter',
    component: KeywordsFilter,
    meta: { title: 'Keywords Filter' }
  },
  {
    path: '/classification',
    name: 'Classification',
    component: ClassificationPage,
    meta: { title: 'Classification' }
  },
  {
    path: '/clustering',
    name: 'Clustering',
    component: ClusteringPage,
    meta: { title: 'Clustering' }
  },
  {
    path: '/consistency',
    name: 'Consistency',
    component: ConsistencyCheckPage,
    meta: { title: 'Consistency Check' }
  },
  {
    path: '/moderation',
    name: 'Moderation',
    component: AiModeratorPage,
    meta: { title: 'AI Moderator' }
  },
  {
    path: '/integrations',
    name: 'Integrations',
    component: IntegrationsPage,
    meta: { title: 'Integrations' }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: SettingsPage,
    meta: { title: 'Settings' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/keywords'
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// Update document title based on route
router.beforeEach((to, from, next) => {
  const title = (to.meta?.title as string) || 'Keywords Analytics'
  document.title = title
  next()
})

export default router
