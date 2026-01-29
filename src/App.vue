<script setup lang="ts">
import { onMounted } from "vue";
import { useProjectStore } from "./stores/project";
import { useConsistencyWorker } from "./composables/useConsistencyWorker";
import { useMorphologyWorker } from "./composables/useMorphologyWorker";
import { useLemmaDictSharedWorker } from "./composables/useLemmaDictSharedWorker";
import AppHeader from "./components/AppHeader.vue";
import AppMenu from "./components/AppMenu.vue";

const project = useProjectStore();
const morphologyWorker = useMorphologyWorker();
const consistencyWorker = useConsistencyWorker();
const lemmaSharedWorker = useLemmaDictSharedWorker();

onMounted(() => {
  console.log("[App] mounted");
  if (project.getProjects) project.getProjects();
  lemmaSharedWorker.ensure();
  morphologyWorker.ensure();
  consistencyWorker.ensure();
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
        <RouterView />
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
