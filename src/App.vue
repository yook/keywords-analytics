<script setup lang="ts">
import {
  computed,
  onMounted,
  onBeforeUnmount,
  defineAsyncComponent,
} from "vue";
import { useProjectStore } from "./stores/project";
import { useConsistencyWorker } from "./composables/useConsistencyWorker";
import { useMorphologyWorker } from "./composables/useMorphologyWorker";
import { useLemmaDictSharedWorker } from "./composables/useLemmaDictSharedWorker";
import AppHeader from "./components/AppHeader.vue";
import AppMenu from "./components/AppMenu.vue";
import KeywordsPage from "./components/pages/KeywordsPage.vue";
import SettingsPage from "./components/pages/SettingsPage.vue";
const KeywordsFilter = defineAsyncComponent(
  () => import("./components/pages/KeywordsFilter.vue")
);
const TypingPage = defineAsyncComponent(
  () => import("./components/pages/TypingPage.vue")
);
const ConsistencyCheckPage = defineAsyncComponent(
  () => import("./components/pages/ConsistencyCheckPage.vue")
);
// import AppFooter from "./components/AppFooter.vue";
// import KeywordsPage from "./components/pages/KeywordsPage.vue";
// import IntegrationsPage from "./components/pages/IntegrationsPage.vue";
// import SettingsPage from "./components/pages/SettingsPage.vue";

const project = useProjectStore();
const morphologyWorker = useMorphologyWorker();
const consistencyWorker = useConsistencyWorker();
const lemmaSharedWorker = useLemmaDictSharedWorker();

onMounted(() => {
  console.log("[App] mounted, activePage=", project.activePage);
  lemmaSharedWorker.ensure();
  morphologyWorker.ensure();
  consistencyWorker.ensure();
});

// Local mapping for current page component to avoid importing a module-level
// computed from `AppMenu.vue` which can be evaluated before Pinia is installed.
const currentPageComponent = computed(() => {
  switch (project.activePage) {
    case "1":
    case "2":
      return KeywordsPage;
    case "filter":
      return KeywordsFilter;
    case "typing":
      return TypingPage;
    case "consistency":
      return ConsistencyCheckPage;
    case "5":
      return SettingsPage;
    default:
      return KeywordsPage;
  }
});

// // Initialize socket listeners once when app mounts
// onMounted(() => {
//   console.log("App mounted - initializing socket listeners");
//   project.socketOn();
// });

// // Cleanup on unmount (mainly for HMR in dev mode)
// onBeforeUnmount(() => {
//   console.log("App unmounting - would cleanup socket listeners here if needed");
// });

// // currentPageComponent moved to AppMenu.vue for centralized routing per user's request
</script>

<template>
  <!-- Absolute header -->
  <AppHeader />

  <!-- Body under header: aside (left) + main content -->
  <el-container class="app-root app-body">
    <el-aside width="65px" class="app-aside">
      <AppMenu />
    </el-aside>
    <el-container class="app-right is-vertical">
      <el-main class="app-content p-1">
        <component :is="currentPageComponent" v-if="currentPageComponent" />
        <div v-else class="placeholder-content">
          <el-empty description="Страница в разработке" />
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<style>
html,
body,
#app {
  height: 100vh;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background-color: var(--el-bg-color-page);
}

.app-root {
  height: 100vh;
  overflow: hidden;
}

/* leave space for absolute header (56px) */
.app-body {
  /* Place body under absolute header and keep total height within viewport */
  margin-top: 56px;
  height: calc(100vh - 56px);
  overflow: hidden;
}

.app-aside {
  border-right: 1px solid var(--el-border-color, #ebeef5);
}

.app-content {
  position: relative;
  flex: 1;
  overflow: auto;
  padding-bottom: 20px; /* keep content visible above fixed footer */
}

.app-right {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  height: 100%;
  min-height: 0; /* allow children to shrink for internal scroll */
}

.app-content {
  position: relative;
  flex: 1 1 auto;
  min-height: 0; /* enable scrolling within flex child */
}
</style>
