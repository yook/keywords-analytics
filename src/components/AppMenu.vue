<template>
  <div class="menu-container">
    <el-menu
      :default-active="project.activePage"
      collapse
      class="el-menu"
      @select="handleMenuSelect"
      :router="false"
    >
      <!-- Keywords menu with nested submenu groups -->
      <el-sub-menu
        :index="'2'"
        :class="{
          'is-active':
            project.activePage === '2' ||
            project.activePage === 'filter' ||
            project.activePage === 'typing' ||
            project.activePage === 'clustering' ||
            project.activePage === 'consistency',
        }"
      >
        <template #title>
          <el-icon><PriceTag /></el-icon>
          <span>{{ i18n.global.t("menu.keywords") }}</span>
        </template>
        <el-menu-item
          :index="'2-0'"
          :class="{ 'is-active': project.activePage === '2' }"
        >
          <el-icon><Plus /></el-icon>
          <span>Добавить запросы</span>
        </el-menu-item>
        <el-menu-item-group title="Морфолгический поиск">
          <el-menu-item
            :index="'2-1'"
            :class="{ 'is-active': project.activePage === 'filter' }"
          >
            <el-icon><Filter /></el-icon>
            <span>Фильтр по стоп-словам</span>
          </el-menu-item>
          <el-menu-item
            :index="'2-2'"
            :class="{ 'is-active': project.activePage === 'consistency' }"
          >
            <el-icon><CircleCheck /></el-icon>
            <span>Проверка согласованности</span>
          </el-menu-item>
        </el-menu-item-group>

        <el-menu-item-group title="Векторный поиск">
          <el-menu-item
            :index="'2-3'"
            :class="{ 'is-active': project.activePage === 'typing' }"
          >
            <el-icon
              ><img src="/icons8-sparkling-24.png" style="width: 18px"
            /></el-icon>
            <span>Определение класса</span>
          </el-menu-item>
          <el-menu-item
            :index="'2-4'"
            :class="{ 'is-active': project.activePage === 'clustering' }"
          >
            <el-icon
              ><img src="/icons8-sparkling-24.png" style="width: 18px"
            /></el-icon>
            <span>Распределение на кластеры</span>
          </el-menu-item>
          <el-menu-item :index="'2-5'" disabled>
            <el-icon
              ><img src="/icons8-sparkling-24.png" style="width: 18px"
            /></el-icon>
            <span>Присвоение категории</span>
          </el-menu-item>
        </el-menu-item-group>
      </el-sub-menu>

      <!-- Add Settings item next for progressive testing -->
      <el-menu-item index="5">
        <el-icon><Setting /></el-icon>
        <template #title>{{ i18n.global.t("menu.settings") }}</template>
      </el-menu-item>

      <!-- Integrations removed for debugging -->
    </el-menu>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { i18n } from "../i18n";
import { useProjectStore } from "../stores/project";
import { Setting, PriceTag, Plus, Filter, CircleCheck } from "@element-plus/icons-vue";
const project = useProjectStore();

onMounted(() => {
  console.log("[AppMenu] mounted, activePage=", project.activePage);
});

const handleMenuSelect = (index) => {
  // If a submenu under Keywords selected (indices like "2-1"),
  // open Keywords page and request proper tab.
  if (typeof index === "string" && index.startsWith("2-")) {
    // If user clicked the main 'Keywords' entry (2-0), open Keywords page
    if (index === "2-0") {
      project.activePage = "2";
      localStorage.setItem("activeMenuItem", "2");
      return;
    }
    // Special case: open KeywordsFilter page for stopwords
    if (index === "2-1") {
      project.activePage = "filter";
      localStorage.setItem("activeMenuItem", "filter");
      return;
    }
    // Special case: open consistency-check page
    if (index === "2-2") {
      project.activePage = "consistency";
      localStorage.setItem("activeMenuItem", "consistency");
      return;
    }
    // Special case: open typing page for определение класса
    if (index === "2-3") {
      project.activePage = "typing";
      localStorage.setItem("activeMenuItem", "typing");
      return;
    }
    // Special case: open clustering page for распределение на кластеры
    if (index === "2-4") {
      project.activePage = "clustering";
      localStorage.setItem("activeMenuItem", "clustering");
      return;
    }
    // Default: open config dialog for other tabs
    project.activePage = "2";
    const map = {
      "2-4": "clustering",
      "2-5": "categorization",
    };
    const tab = map[index];
    if (tab) {
      project.crawlerConfigTab = tab;
      project.crawlerConfigDialog = true;
    }
    localStorage.setItem("activeMenuItem", "2");
    return;
  }

  project.activePage = index;
  localStorage.setItem("activeMenuItem", index);
};
</script>

<style>
.menu-container {
  height: 100%;
  overflow-x: hidden;
}
.el-menu {
  min-width: 65px;
  overflow-x: hidden;
  max-width: 100%;
  box-sizing: border-box;
  height: 100%;
}
.menu-container {
  background-color: var(--el-bg-color, #fff);
  min-height: 0;
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
