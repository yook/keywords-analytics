<script setup lang="ts">
import { computed, onMounted, defineAsyncComponent } from "vue";
import { useProjectStore } from "./stores/project";
import { useConsistencyWorker } from "./composables/useConsistencyWorker";
import { useMorphologyWorker } from "./composables/useMorphologyWorker";
import { useLemmaDictSharedWorker } from "./composables/useLemmaDictSharedWorker";
import AppHeader from "./components/AppHeader.vue";
import AppMenu from "./components/AppMenu.vue";
import KeywordsPage from "./components/pages/KeywordsPage.vue";
import SettingsPage from "./components/pages/SettingsPage.vue";
import IntegrationsPage from "./components/pages/IntegrationsPage.vue";

const KeywordsFilter = defineAsyncComponent(
  () => import("./components/pages/KeywordsFilter.vue"),
);
const ClassificationPage = defineAsyncComponent(
  () => import("./components/pages/ClassificationPage.vue"),
);
const ConsistencyCheckPage = defineAsyncComponent(
  () => import("./components/pages/ConsistencyCheckPage.vue"),
);
const ClusteringPage = defineAsyncComponent(
  () => import("./components/pages/ClusteringPage.vue"),
);

const project = useProjectStore();
const morphologyWorker = useMorphologyWorker();
const consistencyWorker = useConsistencyWorker();
const lemmaSharedWorker = useLemmaDictSharedWorker();

onMounted(() => {
  console.log("[App] mounted, activePage=", project.activePage);
  if (project.getProjects) project.getProjects();
  lemmaSharedWorker.ensure();
  morphologyWorker.ensure();
  consistencyWorker.ensure();
});

const currentPageComponent = computed(() => {
  switch (project.activePage) {
    case "1":
    case "2":
      return KeywordsPage;
    case "filter":
      return KeywordsFilter;
    case "typing":
      return ClassificationPage;
    case "clustering":
      return ClusteringPage;
    case "consistency":
      return ConsistencyCheckPage;
    case "integrations":
      return IntegrationsPage;
    case "5":
      return SettingsPage;
    case "6":
      return KeywordsPage;
    default:
      return KeywordsPage;
  }
});
</script>

<template>
  <AppHeader />

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

.app-body {
  margin-top: 56px;
  height: calc(100vh - 56px);
  overflow: hidden;
}

.app-aside {
  border-right: 1px solid var(--el-border-color, #ebeef5);
  transition: width 0.3s;
}

.app-right {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
}

.app-content {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
</style>
