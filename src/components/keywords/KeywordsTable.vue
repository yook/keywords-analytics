<template>
  <el-card shadow="never" class="table-cart">
    <el-row class="mb-4">
      <el-col :span="12">
        <el-input
          ref="searchInputRef"
          v-model="input3"
          style="width: 240px"
          size="small"
          placeholder="Введите запрос"
          :prefix-icon="Search"
          clearable
          @keyup.enter="handleSearch"
          @clear="handleClear"
        />
        <span class="mx-3">
          <el-text type="info">{{ keywordsStore.totalCount }}</el-text></span
        >
      </el-col>
      <el-col :span="12" class="text-right text-sm">
        <!-- Settings button (table columns) -->
        <el-button
          size="small"
          type="primary"
          plain
          @click="tableSettingsDialog = true"
        >
          <el-icon><Grid /></el-icon>
        </el-button>

        <!-- Export to XLS -->
        <el-button
          size="small"
          @click="handleDownloadKeywords"
          :disabled="keywordsStore.keywordCount === 0"
        >
          <el-icon><Download /></el-icon>
          .xls
        </el-button>

        <!-- Delete all keywords -->
        <el-button
          size="small"
          type="danger"
          plain
          @click="handleDeleteAll"
          :disabled="keywordsStore.keywordCount === 0"
        >
          <el-icon><Delete /></el-icon>
        </el-button>
      </el-col>
    </el-row>

    <!-- Table settings dialog -->
    <el-dialog
      width="900px"
      :title="t('keywords.tableSettingsTitle')"
      v-model="tableSettingsDialog"
    >
      <div class="text-center">
        <el-transfer
          v-model="currentTableColumns"
          :titles="[
            t('keywords.tableSettingsOff'),
            t('keywords.tableSettingsOn'),
          ]"
          :props="{ key: 'prop', label: 'name', disabled: 'disabled' }"
          :data="transferColumns"
        />
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button type="primary" @click="tableSettingsDialog = false">{{
            t("keywords.tableSettingsConfirm")
          }}</el-button>
        </span>
      </template>
    </el-dialog>
    <DataTableFixed
      :tableColumns="tableColumns"
      :data="keywords"
      :totalCount="totalCount"
      :loading="loading"
      :loadingMore="loadingMore"
      :sort="sort"
      :loadWindow="loadWindow"
      :sortData="sortData"
      :loadData="loadData"
      :windowStart="keywordsStore.windowStart"
      :fixedColumns="2"
      dbKey="keywords"
      @delete-row="handleDeleteRow"
      @delete-all="handleDeleteAll"
      :heightOffset="270"
      @columns-reorder="onColumnsReorder"
    />
  </el-card>
</template>
<script setup>
import DataTableFixed from "../DataTableFixed.vue";
import { ref, computed, onMounted, watch, nextTick, defineProps } from "vue";
import { useKeywordsStore } from "../../stores/keywords";
import { useProjectStore } from "../../stores/project";
import { Search, Delete, Download, Grid } from "@element-plus/icons-vue";
import { ElMessageBox, ElMessage } from "element-plus";
import { markRaw } from "vue";
import { useI18n } from "vue-i18n";
import { downloadKeywords } from "../../stores/export";
import saveColumnOrder from "../../utils/columnOrder";

const keywordsStore = useKeywordsStore();
const project = useProjectStore();
const { t } = useI18n();

// Search input model
const input3 = ref(keywordsStore.searchQuery);
const searchTimeout = ref(null);
const skipNextInputWatcher = ref(false);
const searchInputRef = ref(null);

// Диалог настроек таблицы
const tableSettingsDialog = ref(false);

// Полный список доступных колонок (с метаданными)
const allColumns = [
  // Ключевой запрос — обязательная колонка, не даём отключать
  { prop: "keyword", name: "Ключевой запрос", width: 400, disabled: true },
  { prop: "target_query", name: "Фильтр по стоп-словам", width: 240 },
  { prop: "blocking_rule", name: "Правило исключения", width: 240 },
  { prop: "created_at", name: t("table.date"), width: 180 },
  { prop: "category_info", name: "Категория", width: 240 },
  { prop: "classification_label", name: "Классификация (ML)", width: 180 },
  {
    prop: "classification_score",
    name: "Уверенность классификации",
    width: 160,
  },
  { prop: "cluster_label", name: "Кластер", width: 150 },
  { prop: "cluster_score", name: "Уверенность кластера", width: 160 },
  { prop: "lemma", name: "Лемма", width: 200 },
  { prop: "tags", name: "Теги", width: 200 },
  { prop: "is_valid_headline", name: "Проверка согласованности", width: 140 },
  { prop: "validation_reason", name: "Правило согласованности", width: 320 },
  { prop: "_actions", name: "Actions", width: 50 },
];

// Ключи всех доступных колонок
const allColumnKeys = allColumns.map((c) => c.prop);

const getDefaultColumnsForScope = (scope) => {
  switch (scope) {
    case "keywords-filter":
      return ["target_query", "blocking_rule"];
    case "keywords-typing":
      return ["classification_label", "classification_score"];
    case "keywords-clustering":
      return ["cluster_label", "cluster_score"];
    case "keywords-consistency":
      return ["is_valid_headline", "validation_reason"];
    default:
      return ["created_at", "lemma", "tags"];
  }
};

const props = defineProps({
  activeColumns: {
    type: Array,
    default: null,
  },
  columnsKey: {
    type: String,
    default: "keywords",
  },
});

const columnsStorageKey = computed(() => {
  const key = props.columnsKey;
  if (key && typeof key === "string" && key.trim()) {
    return key.trim();
  }
  return "keywords";
});

// Инициализация currentTableColumns: если есть props.activeColumns — используем их, иначе — hydrateColumns
function isValidColumns(arr) {
  return (
    Array.isArray(arr) &&
    arr.length > 0 &&
    arr.every((k) => typeof k === "string")
  );
}
const currentTableColumns = ref([]);
if (isValidColumns(props.activeColumns)) {
  applyColumns(props.activeColumns);
} else {
  hydrateColumns();
}

// Watch for changes in activeColumns prop и обновляем currentTableColumns
watch(
  () => props.activeColumns,
  (newVal) => {
    if (isValidColumns(newVal)) {
      applyColumns(newVal);
    }
  },
  { deep: true },
);

const getStorageKey = () => {
  const pid = project.currentProjectId || "anon";
  const scope = columnsStorageKey.value || "keywords";
  return `keywords-table-columns-${scope}-${pid}`;
};

const getLegacyStorageKey = () => {
  const pid = project.currentProjectId || "anon";
  const scope = columnsStorageKey.value || "keywords";
  return `table-columns-${pid}-${scope}`;
};

function applyColumns(source) {
  if (!Array.isArray(source)) return;
  let next = source.filter((k) => allColumnKeys.includes(k));
  if (!next.includes("keyword")) next.unshift("keyword");
  currentTableColumns.value = Array.from(new Set(next));
}

function hydrateColumns() {
  // Приоритет: данные проекта (БД) -> localStorage (на проект) -> дефолт
  const fromProject = project.data?.columns?.[columnsStorageKey.value];
  if (Array.isArray(fromProject) && fromProject.length) {
    applyColumns(fromProject);
    return;
  }

  try {
    const saved = localStorage.getItem(getStorageKey());
    if (saved) {
      const arr = JSON.parse(saved);
      applyColumns(arr);
      return;
    }
    const legacy = localStorage.getItem(getLegacyStorageKey());
    if (legacy) {
      const arr = JSON.parse(legacy);
      applyColumns(arr);
      return;
    }
    const scope = columnsStorageKey.value || "keywords";
    if (scope === "keywords" || scope === "keywords-main") {
      const legacyGlobal = localStorage.getItem(
        `keywords-table-columns-${project.currentProjectId || "anon"}`,
      );
      if (legacyGlobal) {
        const arr = JSON.parse(legacyGlobal);
        applyColumns(arr);
        return;
      }
    }
  } catch (e) {
    // ignore
  }

  applyColumns(getDefaultColumnsForScope(columnsStorageKey.value));
}

// hydrateColumns(); // Больше не вызываем здесь, чтобы не перезаписывать currentTableColumns при маунте

// Сохраняем настройки при изменении
watch(
  () => currentTableColumns.value.slice(),
  (val) => {
    try {
      // Avoid recursive save: if project already has same columns, skip persisting
      const projCols =
        project.data &&
        project.data.columns &&
        project.data.columns[columnsStorageKey.value];
      try {
        if (
          Array.isArray(projCols) &&
          JSON.stringify(projCols) === JSON.stringify(val)
        ) {
          // still update localStorage for UI consistency, but don't call saveColumnOrder
          try {
            localStorage.setItem(getStorageKey(), JSON.stringify(val));
            localStorage.setItem(getLegacyStorageKey(), JSON.stringify(val));
          } catch (_) {}
          return;
        }
      } catch (_) {}

      localStorage.setItem(getStorageKey(), JSON.stringify(val));
      // Persist to project and legacy key to keep backward compatibility
      saveColumnOrder(project, columnsStorageKey.value, val);
      try {
        localStorage.setItem(getLegacyStorageKey(), JSON.stringify(val));
      } catch (_) {}
    } catch (e) {
      // ignore
    }
  },
  { deep: false },
);

// При смене проекта или загрузке списка проектов поднимаем порядок колонок
watch([() => project.currentProjectId, () => project.projectsLoaded], () => {
  hydrateColumns();
});

// Когда из БД приезжают настройки колонок нового проекта (project.data.columns),
// повторно применяем порядок/видимость, чтобы не брать кеш от предыдущего проекта.
watch(
  () =>
    project.data &&
    project.data.columns &&
    project.data.columns[columnsStorageKey.value],
  () => {
    hydrateColumns();
  },
  { deep: false },
);

// Transfer data ordered to match currentTableColumns (so settings dialog shows same order)
const transferColumns = computed(() => {
  try {
    const orderMap = new Map();
    currentTableColumns.value.forEach((p, i) => orderMap.set(p, i));

    return allColumns.slice().sort((a, b) => {
      const aIdx = orderMap.has(a.prop)
        ? orderMap.get(a.prop)
        : 1000 + allColumns.findIndex((c) => c.prop === a.prop);
      const bIdx = orderMap.has(b.prop)
        ? orderMap.get(b.prop)
        : 1000 + allColumns.findIndex((c) => c.prop === b.prop);
      return aIdx - bIdx;
    });
  } catch (e) {
    return allColumns;
  }
});

// Вычисляемый список колонок для таблицы в соответствии с настройками
// Preserve explicit user order from `currentTableColumns`
const tableColumns = computed(() =>
  currentTableColumns.value
    .map((prop) => allColumns.find((c) => c.prop === prop))
    .filter(Boolean),
);

// Данные для передачи в таблицу
const keywords = computed(() => keywordsStore.keywords);
const totalCount = computed(() => keywordsStore.totalCount);
const loading = computed(() => keywordsStore.loading);
const loadingMore = computed(() => keywordsStore.loadingMore);
const sort = computed(() => keywordsStore.sort);

const loadWindow = (newWindowStart) => keywordsStore.loadWindow(newWindowStart);
const sortData = (options) => keywordsStore.sortKeywords(options);
const loadData = (projectId, options) =>
  keywordsStore.loadKeywords(projectId, options);

// Обработчики для действий с таблицей
const handleDeleteRow = (row) => {
  if (!row || !row.id) return;

  ElMessageBox.confirm(
    `Удалить ключевой запрос "${row.keyword || row.id}"?`,
    "Подтверждение удаления",
    {
      confirmButtonText: "Удалить",
      cancelButtonText: "Отмена",
      type: "error",
      icon: markRaw(Delete),
      customClass: "delete-msgbox-class",
    },
  )
    .then(() => {
      console.log("Delete keyword:", row.id);
      // Делегируем удаление в стор (он вызовет socket.emit и проверит соединение)
      keywordsStore.deleteKeyword(row.id);
    })
    .catch(() => {
      // Пользователь отменил удаление
    });
};

const handleDeleteAll = () => {
  ElMessageBox.confirm(
    "Вы уверены, что хотите удалить все ключевые фразы и связанные с ними данные для этого проекта? Это действие необратимо.",
    "Удаление всех данных",
    {
      confirmButtonText: "Удалить все",
      cancelButtonText: "Отмена",
      type: "error",
      icon: markRaw(Delete),
      customClass: "delete-msgbox-class",
    },
  )
    .then(async () => {
      if (project.currentProjectId) {
        try {
          await keywordsStore.deleteAllKeywords(
            String(project.currentProjectId),
          );
          ElMessage.success("Все данные успешно удалены");
        } catch (e) {
          ElMessage.error("Ошибка при удалении данных");
        }
      }
    })
    .catch(() => {
      // Отмена
    });
};

// Экспорт ключевых слов в XLSX
const handleDownloadKeywords = () => {
  // Используем текущие столбцы как экспортные колонки
  downloadKeywords(tableColumns.value);
};

onMounted(() => {
  if (project.currentProjectId) {
    keywordsStore.loadKeywords(project.currentProjectId, { resetSearch: true });
  }
});

// Handle column reorder from DataTableFixed: update local selection and persist to project
function onColumnsReorder(newOrder) {
  try {
    if (!Array.isArray(newOrder)) return;
    // Filter to valid columns and ensure 'keyword' exists
    const valid = newOrder.filter((p) => allColumnKeys.includes(p));
    if (!valid.includes("keyword")) valid.unshift("keyword");
    currentTableColumns.value = Array.from(new Set(valid));

    // Persist using shared util (saves to project and to localStorage)
    try {
      saveColumnOrder(
        project,
        columnsStorageKey.value,
        currentTableColumns.value,
      );
    } catch (e) {
      console.error("saveColumnOrder failed", e);
    }
  } catch (e) {
    console.error("onColumnsReorder (keywords) error", e);
  }
}

// Слушаем изменения currentProjectId и загружаем ключевые запросы для нового проекта
watch(
  () => project.currentProjectId,
  (newProjectId) => {
    if (newProjectId) {
      keywordsStore.loadKeywords(newProjectId, { resetSearch: true });
      // Очищаем поиск при переключении проекта
      input3.value = "";
    }
  },
);

// Debounce search
watch(
  () => input3.value,
  (newQuery) => {
    // If previous handler indicated we should skip the next watcher run (e.g. manual clear), skip scheduling
    if (skipNextInputWatcher.value) {
      skipNextInputWatcher.value = false;
      // ensure any existing timeout is cleared
      if (searchTimeout.value) {
        clearTimeout(searchTimeout.value);
        searchTimeout.value = null;
      }
      return;
    }

    if (searchTimeout.value) {
      clearTimeout(searchTimeout.value);
    }
    searchTimeout.value = setTimeout(() => {
      if (newQuery.trim()) {
        keywordsStore.searchKeywords(newQuery.trim());
      } else {
        // Если пустой запрос, загружаем все
        keywordsStore.loadKeywords(project.currentProjectId, {
          resetSearch: true,
        });
      }
    }, 2000);
  },
);

// Синхронизируем input с searchQuery из store
watch(
  () => keywordsStore.searchQuery,
  (newSearchQuery) => {
    if (newSearchQuery !== input3.value) {
      input3.value = newSearchQuery;
    }
  },
);

// Убираем фокус после обновления данных поиска
watch(
  () => keywordsStore.keywords,
  () => {
    // Убираем фокус только если есть поисковый запрос
    if (input3.value.trim()) {
      nextTick(() => {
        if (searchInputRef.value) {
          searchInputRef.value.blur();
        }
      });
    }
  },
);

// Обработчик поиска при нажатии Enter
const handleSearch = () => {
  // Отменяем debounce таймер
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value);
    searchTimeout.value = null;
  }

  const query = input3.value.trim();
  if (query) {
    keywordsStore.searchKeywords(query);
  } else {
    // Если пустой запрос, загружаем все
    keywordsStore.loadKeywords(project.currentProjectId);
  }

  // Убираем фокус из поля ввода
  nextTick(() => {
    if (searchInputRef.value) {
      searchInputRef.value.blur();
    }
  });
};

// Обработчик очистки поля поиска
const handleClear = () => {
  // Отменяем debounce таймер
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value);
    searchTimeout.value = null;
  }

  // Сбрасываем фильтр и обновляем таблицу
  skipNextInputWatcher.value = true;
  keywordsStore.searchQuery = "";
  keywordsStore.loadKeywords(project.currentProjectId, { resetSearch: true });
};
</script>

<style scoped>
.table-cart {
  min-height: 200px;
  display: flex;
  flex-direction: column;
}
</style>

<style>
/* Стили для поля поиска в темной теме */
html.dark .el-input--small .el-input__wrapper {
  background-color: var(--el-bg-color) !important;
  border-color: var(--el-border-color) !important;
  color: var(--el-text-color-primary) !important;
}

html.dark .el-input--small .el-input__inner {
  background-color: transparent !important;
  color: var(--el-text-color-primary) !important;
}

html.dark .el-input--small .el-input__wrapper:hover {
  border-color: var(--el-border-color-light) !important;
}

html.dark .el-input--small .el-input__wrapper.is-focus {
  border-color: var(--el-color-primary) !important;
  box-shadow: 0 0 0 2px var(--el-color-primary-light-8) !important;
}

html.dark .el-input--small .el-input__inner::placeholder {
  color: var(--el-text-color-placeholder) !important;
}

.delete-msgbox-class {
  width: 800px !important;
  max-width: 90%;
}
</style>
