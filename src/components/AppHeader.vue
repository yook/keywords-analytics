<template>
  <div id="custom-titlebar">
    <div class="head-content">
      <el-select
        v-model="project.currentProjectId"
        class="header-select no-drag"
        :placeholder="t('header.selectProject')"
        @change="changeProject"
      >
        <el-option
          v-for="item in project.projectsList"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
        <el-option
          v-if="project.projectsList.length === 0"
          value=""
          :label="t('header.noProjects')"
          disabled
        />
      </el-select>

      <AddNewProject />
    </div>

    <div class="header-actions no-drag">
      <el-switch
        class="header-theme-toggle"
        size="large"
        v-model="isLight"
        :active-action-icon="Sunny"
        :inactive-action-icon="Moon"
        @change="toggleTheme"
      />
      <el-button
        class="header-action-button"
        circle
        @click="openIntegrations"
        title="Интеграции"
      >
        <el-icon><Connection /></el-icon>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Sunny, Moon, Connection } from "@element-plus/icons-vue";
import AddNewProject from "./AddNewProject.vue";
import { useProjectStore } from "../stores/project";

const project = useProjectStore();
const { t } = useI18n();

const isLight = ref(!document.documentElement.classList.contains("dark"));

onMounted(() => {
  const savedTheme = localStorage.getItem("theme") || "light";
  const html = document.documentElement;
  if (savedTheme === "dark") {
    html.classList.add("dark");
  } else {
    html.classList.remove("dark");
  }
  isLight.value = !html.classList.contains("dark");
  project.getProjects();
});

function toggleTheme(value?: boolean) {
  const desiredLight = typeof value === "boolean" ? value : !isLight.value;
  const html = document.documentElement;
  if (desiredLight) html.classList.remove("dark");
  else html.classList.add("dark");
  isLight.value = !html.classList.contains("dark");
  localStorage.setItem("theme", isLight.value ? "light" : "dark");
}

function changeProject(id: string | null) {
  project.changeProject(id);
}

function openIntegrations() {
  // Integrations feature removed in PWA; route to Settings instead
  project.activePage = "5";
}
</script>

<style>
#custom-titlebar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  box-sizing: border-box;
  -webkit-app-region: drag;
  height: 55px;
  background-color: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  z-index: 50;
}

.head-content {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  padding: 2rem 5rem;
  height: 100%;
}

.header-select {
  width: 300px !important;
  flex: 0 0 300px;
  max-width: 300px;
}

.header-select .el-select__wrapper {
  width: 100% !important;
  height: 32px;
  display: inline-flex;
  align-items: center;
}

.add-project-btn {
  height: 32px;
  display: inline-flex;
  align-items: center;
}

.add-project-btn {
  height: 32px;
  font-size: 14px;
}

.no-drag {
  -webkit-app-region: no-drag;
}

html.dark #custom-titlebar {
  background-color: var(--el-bg-color-page) !important;
  border-bottom: 1px solid var(--el-border-color) !important;
}

html.dark .header-select .el-select__wrapper {
  background-color: var(--el-bg-color) !important;
  border-color: var(--el-border-color) !important;
  color: var(--el-text-color-primary) !important;
}

html.dark .header-select .el-select__wrapper:hover {
  border-color: var(--el-border-color-light) !important;
  background-color: var(--el-bg-color) !important;
}

html.dark .header-select .el-select__wrapper.is-focused {
  border-color: var(--el-color-primary) !important;
  box-shadow: 0 0 0 2px var(--el-color-primary-light-8) !important;
}

html.dark .header-select .el-input__inner {
  color: var(--el-text-color-primary) !important;
  background-color: transparent !important;
}

html.dark .header-select .el-input__inner::placeholder {
  color: var(--el-text-color-placeholder) !important;
}

html.dark #custom-titlebar,
html.dark #custom-titlebar .head-content,
html.dark #custom-titlebar .header-actions {
  color: var(--el-text-color-primary) !important;
}

html.dark .header-actions .el-switch .el-switch__core {
  background-color: var(--el-bg-color) !important;
  border: 1px solid var(--el-border-color) !important;
}

html.dark .header-actions .el-switch.is-checked .el-switch__core {
  background-color: var(--el-bg-color) !important;
  border: 1px solid var(--el-border-color) !important;
}

html.dark .header-actions .el-switch .el-switch__action {
  background-color: var(--el-bg-color) !important;
  border: 1px solid var(--el-border-color) !important;
}

html.dark .header-actions .el-switch:hover .el-switch__core {
  background-color: var(--el-fill-color) !important;
  border-color: var(--el-border-color-light) !important;
}

html.dark .header-actions .el-switch:hover .el-switch__action {
  background-color: var(--el-fill-color) !important;
  border-color: var(--el-border-color-light) !important;
}

html.dark .add-project-btn {
  background-color: var(--el-fill-color) !important;
  border-color: var(--el-border-color) !important;
  color: var(--el-text-color-primary) !important;
}

html.dark .add-project-btn:hover {
  background-color: var(--el-fill-color-light) !important;
  border-color: var(--el-border-color-light) !important;
}

html.dark .add-project-btn:active,
html.dark .add-project-btn:focus {
  background-color: var(--el-fill-color-darker) !important;
  border-color: var(--el-color-primary) !important;
}

.header-actions {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-actions.no-drag {
  -webkit-app-region: no-drag;
}

.header-action-button {
  padding: 6px;
}

html:not(.dark) .header-actions .el-switch {
  --el-switch-on-color: #ffffff;
  --el-switch-off-color: #ffffff;
}

html:not(.dark) .header-actions .el-switch .el-switch__core {
  background-color: var(--el-switch-off-color) !important;
  border: 1px solid var(--el-border-color) !important;
}

html:not(.dark) .header-actions .el-switch.is-checked .el-switch__core {
  background-color: var(--el-switch-on-color) !important;
  border: 1px solid var(--el-border-color) !important;
}

html:not(.dark) .header-actions .el-switch .el-switch__action {
  background-color: #ffffff !important;
  border: 1px solid var(--el-border-color) !important;
}

html:not(.dark) .header-actions .el-switch .el-switch__action .el-icon {
  color: var(--el-text-color-regular) !important;
}

html:not(.dark) .header-actions .el-switch:hover .el-switch__core {
  background-color: var(--el-fill-color-light) !important;
  border-color: var(--el-border-color-hover) !important;
}

html:not(.dark) .header-actions .el-switch:hover .el-switch__action {
  background-color: #ffffff !important;
  border-color: var(--el-border-color-hover) !important;
}
</style>
