<template>
  <div class="menu-container">
    <el-menu
      :default-active="currentMenuIndex"
      collapse
      class="el-menu"
      @select="handleMenuSelect"
      :router="false"
    >
      <!-- Keywords menu with nested submenu groups -->
      <el-sub-menu
        index="keywords"
        :class="{
          'is-active': isKeywordsActive,
        }"
      >
        <template #title>
          <el-icon><PriceTag /></el-icon>
          <span>{{ i18n.global.t("menu.keywords") }}</span>
        </template>
        <RouterLink to="/keywords" custom v-slot="{ navigate }">
          <el-menu-item
            index="keywords-main"
            :class="{ 'is-active': route.path === '/keywords' }"
            @click="navigate"
          >
            <el-icon><Plus /></el-icon>
            <span>Добавить запросы</span>
          </el-menu-item>
        </RouterLink>
        <el-menu-item-group title="Морфолгический поиск">
          <RouterLink to="/filter" custom v-slot="{ navigate }">
            <el-menu-item
              index="keywords-filter"
              :class="{ 'is-active': route.path === '/filter' }"
              @click="navigate"
            >
              <el-icon><Filter /></el-icon>
              <span>Фильтр по стоп-словам</span>
            </el-menu-item>
          </RouterLink>
          <RouterLink to="/consistency" custom v-slot="{ navigate }">
            <el-menu-item
              index="consistency"
              :class="{ 'is-active': route.path === '/consistency' }"
              @click="navigate"
            >
              <el-icon><CircleCheck /></el-icon>
              <span>Проверка согласованности</span>
            </el-menu-item>
          </RouterLink>
        </el-menu-item-group>

        <el-menu-item-group title="Векторный поиск">
          <RouterLink to="/moderation" custom v-slot="{ navigate }">
            <el-menu-item
              index="moderation"
              :class="{ 'is-active': route.path === '/moderation' }"
              @click="navigate"
            >
              <el-icon
                ><img src="/icons8-sparkling-24.png" style="width: 18px"
              /></el-icon>
              <span>AI модератор</span>
            </el-menu-item>
          </RouterLink>
          <RouterLink to="/classification" custom v-slot="{ navigate }">
            <el-menu-item
              index="classification"
              :class="{ 'is-active': route.path === '/classification' }"
              @click="navigate"
            >
              <el-icon
                ><img src="/icons8-sparkling-24.png" style="width: 18px"
              /></el-icon>
              <span>Определение класса</span>
            </el-menu-item>
          </RouterLink>
          <RouterLink to="/clustering" custom v-slot="{ navigate }">
            <el-menu-item
              index="clustering"
              :class="{ 'is-active': route.path === '/clustering' }"
              @click="navigate"
            >
              <el-icon
                ><img src="/icons8-sparkling-24.png" style="width: 18px"
              /></el-icon>
              <span>Распределение на кластеры</span>
            </el-menu-item>
          </RouterLink>
          <el-menu-item index="categorization" disabled>
            <el-icon
              ><img src="/icons8-sparkling-24.png" style="width: 18px"
            /></el-icon>
            <span>Присвоение категории</span>
          </el-menu-item>
        </el-menu-item-group>
      </el-sub-menu>

      <!-- Settings -->
      <RouterLink to="/settings" custom v-slot="{ navigate }">
        <el-menu-item
          index="settings"
          :class="{ 'is-active': route.path === '/settings' }"
          @click="navigate"
        >
          <el-icon><Setting /></el-icon>
          <template #title>{{ i18n.global.t("menu.settings") }}</template>
        </el-menu-item>
      </RouterLink>
    </el-menu>
    <div class="menu-footer">v{{ appVersion }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { i18n } from "../i18n";
import { useProjectStore } from "../stores/project";
import {
  Setting,
  PriceTag,
  Plus,
  Filter,
  CircleCheck,
} from "@element-plus/icons-vue";

const router = useRouter();
const route = useRoute();
const project = useProjectStore();

const appVersion =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

const isKeywordsActive = computed(() => {
  return route.path.startsWith("/keywords");
});

const currentMenuIndex = computed(() => {
  const path = route.path;
  if (path === "/filter") return "keywords-filter";
  if (path === "/keywords") return "keywords-main";
  if (path === "/consistency") return "consistency";
  if (path === "/moderation") return "moderation";
  if (path === "/classification") return "classification";
  if (path === "/clustering") return "clustering";
  if (path === "/settings") return "settings";
  if (path.startsWith("/keywords")) return "keywords-main";
  return "keywords-main";
});

const handleMenuSelect = (index: string) => {
  // Navigation is handled by RouterLink, this is for backward compatibility
  console.log("[AppMenu] Menu selected:", index);
};
</script>

<style>
.menu-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-x: hidden;
}
.el-menu {
  min-width: 65px;
  overflow-x: hidden;
  max-width: 100%;
  box-sizing: border-box;
  height: 100%;
  flex: 1 1 auto;
}
.menu-container {
  background-color: var(--el-bg-color, #fff);
  min-height: 0;
}

.menu-footer {
  padding: 6px 8px;
  text-align: center;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  border-top: 1px solid var(--el-border-color-light, #e5e7eb);
  user-select: none;
}

/* Уменьшаем вертикальные отступы между пунктами меню */
.el-menu .el-menu-item,
.el-menu .el-sub-menu__title {
  padding-top: 2px !important;
  padding-bottom: 2px !important;
  min-height: 20px !important;
  line-height: 1.1 !important;
}

/* Remove blue focus/hover ring and highlight for sub-menus */
.el-menu .el-sub-menu__title,
.el-menu .el-sub-menu__title:hover,
.el-menu .el-sub-menu__title:focus,
.el-menu .el-sub-menu.is-active > .el-sub-menu__title,
.el-menu .el-sub-menu .el-menu-item.is-active,
.el-menu .el-sub-menu .el-menu-item:hover {
  box-shadow: none !important;
  outline: none !important;
  background-color: transparent !important;
  border-color: transparent !important;
}

/* Ensure no left-border highlight on active items within the sub-menu */
.el-menu .el-menu-item.is-active {
  box-shadow: none !important;
  border-left: none !important;
}

/* Aggressive overrides for focus rings / outlines from browsers or Element Plus */
.el-menu .el-sub-menu__title,
.el-menu .el-sub-menu__title *,
.el-menu .el-menu-item,
.el-menu .el-menu-item * {
  outline: none !important;
  box-shadow: none !important;
  border: none !important;
}

/* Remove focus-visible rings (accessibility focus) when undesired visually */
.el-menu .el-sub-menu__title:focus,
.el-menu .el-sub-menu__title:focus-visible,
.el-menu .el-menu-item:focus,
.el-menu .el-menu-item:focus-visible {
  outline: none !important;
  box-shadow: none !important;
  background-color: transparent !important;
}

/* Specific hack for WebKit focus ring color */
.el-menu .el-sub-menu__title::-moz-focus-inner,
.el-menu .el-menu-item::-moz-focus-inner {
  border: 0 !important;
}

/* If Element Plus applies a pseudo-element for highlight, hide it */
.el-menu .el-sub-menu__title::after,
.el-menu .el-menu-item::after {
  display: none !important;
  content: none !important;
}
</style>
