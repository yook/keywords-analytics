<template>
  <div
    ref="tableCardRef"
    :style="{
      '--table-height': tableHeight,
      '--second-column-left': secondColumnLeft,
    }"
  >
    <div class="table-container">
      <div
        class="virtual-scroll-container"
        @wheel.prevent="mousewheel"
        @dragover.prevent="handleBodyDragOver"
        @drop.prevent="handleBodyDrop"
        @dragleave.prevent="handleBodyDragLeave"
      >
        <table class="custom-table" ref="tableRef">
          <thead>
            <tr>
              <th
                v-for="(column, columnIndex) in tableColumnsWithRowNumber"
                :key="column.prop"
                :class="[
                  column.prop === '_rowNumber' ? 'row-number-header' : '',
                  dragOverIndex === columnIndex ? 'drag-over' : '',
                  // Mark header cell as fixed when it belongs to fixedColumns
                  columnIndex < props.fixedColumns ? 'fixed-column' : '',
                ]"
                :style="{
                  minWidth:
                    (getColumnWidth(column.prop) || column.width || 200) + 'px',
                  width:
                    (getColumnWidth(column.prop) || column.width || 200) + 'px',
                }"
                :draggable="
                  columnIndex >= props.fixedColumns &&
                  column.prop !== '_rowNumber' &&
                  column.prop !== '_actions'
                "
                @dragstart="(event) => onDragStart(event, column, columnIndex)"
                @dragover.prevent="(event) => onDragOver(event, columnIndex)"
                @dragleave.prevent="(event) => onDragLeave(event, columnIndex)"
                @drop.prevent="(event) => onDrop(event, columnIndex)"
                @dragend="onDragEnd"
                :data-prop="column.prop"
              >
                <div
                  v-if="insertBeforeIndex === columnIndex"
                  class="insert-line insert-left"
                ></div>
                <div
                  v-if="insertBeforeIndex === columnIndex + 1"
                  class="insert-line insert-right"
                ></div>
                <div
                  :class="[
                    'header-content',
                    column.prop === '_rowNumber' ||
                    column.prop === '_actions' ||
                    column.prop === 'target_query'
                      ? 'center-header'
                      : '',
                  ]"
                  @click="
                    column.prop !== '_rowNumber' && column.prop !== '_actions'
                      ? handleSort(column.prop)
                      : null
                  "
                >
                  <span v-if="column.prop !== '_actions'">{{
                    safeColumnName(column)
                  }}</span>
                  <el-icon
                    v-else
                    @click.stop="emit('delete-all')"
                    style="cursor: pointer; color: var(--el-color-danger)"
                    title="Удалить все записи"
                  >
                    <DeleteFilled />
                  </el-icon>
                  <span
                    v-if="
                      column.prop !== '_rowNumber' && column.prop !== '_actions'
                    "
                    class="sort-indicator"
                  >
                    <i
                      class="sort-arrow"
                      :class="getSortClass(column.prop)"
                    ></i>
                  </span>
                </div>
                <div
                  class="column-resizer"
                  v-if="column.prop !== '_actions'"
                  @mousedown.prevent="startResize($event, column.prop)"
                  title="Drag to resize column"
                ></div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in visiblePage"
              :key="row.id || start + index"
              :class="{
                'even-row': (start + index) % 2 === 1,
                'odd-row': (start + index) % 2 === 0,
              }"
            >
              <td
                v-for="(column, columnIndex) in tableColumnsWithRowNumber"
                :key="column.prop"
                :class="[
                  'table-cell',
                  column.prop === 'keyword' ? 'url-cell' : '',
                  column.prop !== '_actions' && columnIndex < props.fixedColumns
                    ? 'fixed-column'
                    : '',
                  column.prop === '_rowNumber' &&
                  column.prop !== '_actions' &&
                  columnIndex < props.fixedColumns
                    ? 'row-number-cell'
                    : '',
                ]"
                :style="{
                  minWidth:
                    (getColumnWidth(column.prop) || column.width || 200) + 'px',
                  width:
                    (getColumnWidth(column.prop) || column.width || 300) + 'px',
                }"
              >
                <div
                  class="cell-content"
                  @dblclick="selectCellText"
                  :class="{
                    'center-cell':
                      column.prop === '_actions' ||
                      column.prop === 'target_query',
                  }"
                  :style="{
                    textAlign: column.prop === '_rowNumber' ? 'center' : 'left',
                  }"
                >
                  <template v-if="column.prop === '_rowNumber'">
                    <span>{{ (start || 0) + index + 1 }}</span>
                  </template>
                  <template v-else-if="column.prop === '_actions'">
                    <el-icon
                      @click="emit('delete-row', row)"
                      style="cursor: pointer; color: var(--el-color-danger)"
                    >
                      <Delete />
                    </el-icon>
                  </template>
                  <template
                    v-else-if="
                      column.prop === 'category_info' ||
                      column.prop === 'class_info'
                    "
                  >
                    <span class="category-info-inline">
                      <span
                        class="category-name"
                        :title="
                          column.prop === 'category_info'
                            ? row.category_name
                            : row.class_name
                        "
                        >{{
                          column.prop === "category_info"
                            ? row.category_name
                            : row.class_name
                        }}</span
                      >
                      <el-tooltip
                        v-if="
                          column.prop === 'category_info'
                            ? row.category_similarity
                            : row.class_similarity
                        "
                        content="достоверность"
                        placement="top"
                        trigger="click"
                      >
                        <el-tag
                          :type="
                            getConfidenceTagType(
                              column.prop === 'category_info'
                                ? row.category_similarity
                                : row.class_similarity,
                            )
                          "
                          size="small"
                          style="cursor: pointer"
                        >
                          {{
                            formatSimilarity(
                              column.prop === "category_info"
                                ? row.category_similarity
                                : row.class_similarity,
                            )
                          }}
                        </el-tag>
                      </el-tooltip>
                    </span>
                  </template>
                  <template v-else-if="column.prop === 'classification_label'">
                    <span
                      v-if="row.classification_label"
                      class="classification-label"
                    >
                      {{ row.classification_label }}
                    </span>
                    <span v-else style="color: #909399">—</span>
                  </template>
                  <template v-else-if="column.prop === 'classification_score'">
                    <div class="cell-center">
                      <el-tag
                        v-if="
                          row.classification_score !== null &&
                          typeof row.classification_score !== 'undefined'
                        "
                        size="small"
                        :type="getConfidenceTagType(row.classification_score)"
                      >
                        {{ formatSimilarity(row.classification_score) }}
                      </el-tag>
                      <span v-else style="color: #909399">—</span>
                    </div>
                  </template>
                  <template v-else-if="column.prop === 'cluster_label'">
                    <span
                      v-if="
                        row.cluster_label !== null &&
                        typeof row.cluster_label !== 'undefined' &&
                        row.cluster_label !== ''
                      "
                    >
                      {{ row.cluster_label }}
                    </span>
                    <span
                      v-else-if="
                        row.cluster !== null &&
                        typeof row.cluster !== 'undefined'
                      "
                    >
                      {{ row.cluster }}
                    </span>
                    <span v-else style="color: #909399">—</span>
                  </template>
                  <template v-else-if="column.prop === 'cluster_score'">
                    <div class="cell-center">
                      <el-tag
                        v-if="
                          row.cluster_score !== null &&
                          typeof row.cluster_score !== 'undefined'
                        "
                        size="small"
                        :type="getConfidenceTagType(row.cluster_score)"
                      >
                        {{ formatSimilarity(row.cluster_score) }}
                      </el-tag>
                      <span v-else style="color: #909399">—</span>
                    </div>
                  </template>
                  <template v-else-if="column.prop === 'target_query'">
                    <div class="cell-center">
                      <el-icon
                        v-if="
                          row.target_query === 1 || row.target_query === true
                        "
                        style="color: var(--el-color-success); font-size: 18px"
                      >
                        <Check />
                      </el-icon>
                      <el-icon
                        v-else-if="
                          row.target_query === 0 || row.target_query === false
                        "
                        style="color: var(--el-color-danger); font-size: 18px"
                      >
                        <Close />
                      </el-icon>
                      <span v-else>{{ row.target_query }}</span>
                    </div>
                  </template>
                  <template v-else-if="column.prop === 'is_valid_headline'">
                    <div class="cell-center">
                      <el-icon
                        v-if="
                          row.is_valid_headline === 1 ||
                          row.is_valid_headline === true
                        "
                        style="color: var(--el-color-success); font-size: 18px"
                      >
                        <Check />
                      </el-icon>
                      <el-icon
                        v-else-if="
                          row.is_valid_headline === 0 ||
                          row.is_valid_headline === false
                        "
                        style="color: var(--el-color-danger); font-size: 18px"
                      >
                        <Close />
                      </el-icon>
                      <span v-else>{{ row.is_valid_headline }}</span>
                    </div>
                  </template>
                  <template v-else>
                    {{
                      formatCellValue(
                        row[column.prop],
                        column.prop,
                        start + index,
                        row,
                      )
                    }}
                  </template>
                </div>
              </td>
            </tr>
            <tr
              v-if="
                ((dataComp.length === 0 && props.totalCount === 0) ||
                  !props.data ||
                  props.data.length === 0) &&
                !props.loading &&
                !props.loadingMore
              "
              class="no-data-row"
            >
              <td
                :colspan="tableColumnsWithRowNumber.length"
                class="no-data-cell"
              >
                <el-empty
                  description="Нет данных для отображения"
                  :image-size="80"
                />
              </td>
            </tr>
          </tbody>
        </table>
        <div
          class="table-body-container"
          v-loading="showLoadingMore"
          :class="{ 'background-loading': isPreloading }"
        >
          <!-- Скрытая область для имитации общей высоты всех строк -->
          <div
            v-if="props.totalCount > 0"
            class="total-height-spacer"
            :style="{ height: totalTableHeight + 'px' }"
          ></div>
          <!-- Фоновая подгрузка: не показываем лоудер, но можно добавить индикатор если нужно -->
          <!-- <div v-if="isPreloading" class="background-preload-indicator"></div> -->
        </div>
      </div>
      <!-- Вертикальный ползунок вынесен за пределы прокручиваемого контейнера -->
      <div
        v-if="dataComp.length && needsScrolling"
        class="vertical-scroller-container"
      >
        <div ref="scroller" class="vertical-scroller">
          <div
            class="vertical-handle"
            :style="{
              top: htop + 'px',
              height: handleHeight,
            }"
            @mousedown="startHandle"
            @pointerdown="startHandle"
            @touchstart.prevent="startHandle"
            @click="handleScrollbarClick"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import moment from "moment";
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useKeywordsStore } from "../stores/keywords";
import { storeToRefs } from "pinia";
import { useProjectStore } from "../stores/project";
import { useDexie } from "../composables/useDexie";
import { Delete, DeleteFilled, Check, Close } from "@element-plus/icons-vue";

const emit = defineEmits(["delete-row", "delete-all", "columns-reorder"]);

const props = defineProps({
  tableColumns: {
    type: Array,
    required: true,
  },
  data: {
    type: Array,
    default: () => [],
  },
  totalCount: {
    type: Number,
    default: 0,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  loadingMore: {
    type: Boolean,
    default: false,
  },
  sort: {
    type: Object,
    default: () => ({}),
  },
  loadWindow: {
    type: Function,
    required: true,
  },
  sortData: {
    type: Function,
    required: true,
  },
  loadData: {
    type: Function,
    required: true,
  },
  // start index of the data window provided in props.data
  windowStart: {
    type: Number,
    default: 0,
  },
  fixedHeight: {
    type: Number,
    required: false,
    default: 0,
  },
  // Vertical offset subtracted from window height when computing available table area
  heightOffset: {
    type: Number,
    default: 250,
  },
  fixedColumns: {
    type: Number,
    default: 0,
  },
  // Optional explicit key for storing per-table column widths
  // If not provided, falls back to project.currentDb
  dbKey: {
    type: String,
    default: undefined,
  },
});

const project = useProjectStore();
const projectAny = project as any;

// Helper to determine which table key to use for storage and width mapping
function getDbKey() {
  try {
    return props.dbKey || projectAny.currentDb;
  } catch (e) {
    return projectAny.currentDb;
  }
}

// Локальные переменные для виртуальной прокрутки
const windowStart = ref(0);
const bufferSize = 200;
const prefetchThreshold = 2 / 3; // Предзагрузка при прокрутке на 2/3 окна

const resizing = ref(false);
const currentColumn = ref<string | null>(null);
const startX = ref(0);
const startWidth = ref(0);
const columnWidths = ref<Record<string, number>>({});
// Drag & drop state for column reordering
const draggingProp = ref(null);
const dragOverIndex = ref(-1);
const insertBeforeIndex = ref(-1);
const tableCardRef = ref<HTMLElement | null>(null);
const tableRef = ref(null);
const windowHeight = ref(window.innerHeight);

// --- Виртуальный скролл с windowed-логикой ---
const scroller = ref<HTMLElement | null>(null);
const rowHeight = 35;
const pageSize = ref(20); // вычисляется динамически ниже
const scrollTop = ref(0);
const start = ref(0);
const htop = ref(0);
const handleDragging = ref(false);
const lastScrollTime = ref(0);
const lastWindowStart = ref<number | null>(null);
const isPreloading = ref(false);
const WINDOW_SIZE = 300; // всегда максимум 300 строк в props.data
let pendingLastWindowClear: any = null;
function scheduleLastWindowStart(start: number) {
  lastWindowStart.value = start;
  try {
    if (pendingLastWindowClear) {
      clearTimeout(pendingLastWindowClear);
      pendingLastWindowClear = null;
    }
  } catch (e) {}
  // If the window doesn't materialize within 5s, allow retries
  pendingLastWindowClear = setTimeout(() => {
    try {
      if (lastWindowStart.value === start) lastWindowStart.value = null;
    } catch (e) {}
    pendingLastWindowClear = null;
  }, 5000);
}
const waitingForWindowData = ref(false);
// Track outstanding parent page requests to avoid showing locally-prefetched
// cache when a parent (store) window/page request is in-flight for the same page.
const pendingPageRequests = new Set<number>();
const debugPrefetch = true; // TEMP: enable lightweight prefetch/debug logs while diagnosing double-rendering
function addPendingPageRequest(pageIdx: number, ttl = 5000) {
  try {
    if (debugPrefetch)
      console.debug("[prefetch] addPendingPageRequest", pageIdx);
    pendingPageRequests.add(pageIdx);
    setTimeout(() => {
      try {
        if (debugPrefetch)
          console.debug("[prefetch] auto-clear pending", pageIdx);
        pendingPageRequests.delete(pageIdx);
      } catch (e) {}
    }, ttl);
  } catch (e) {}
}

function calcInitialPageSize() {
  try {
    const hdr = rowHeight;
    const avail =
      props.fixedHeight && props.fixedHeight > 0
        ? props.fixedHeight
        : Math.max(
            270,
            (typeof window !== "undefined" ? window.innerHeight : 800) -
              props.heightOffset,
          );
    const bodyH = Math.max(0, avail - hdr);
    let sz = Math.floor(bodyH / rowHeight);
    if (!isFinite(sz) || sz <= 0) sz = 10;
    return sz;
  } catch (e) {
    return 20;
  }
}
pageSize.value = calcInitialPageSize();

// --- Windowed scroll core logic ---
function maybeRequestWindowByScroll() {
  const windowStartRow = props.windowStart || 0;
  const windowLength = props.data?.length || 0;
  const totalRows = props.totalCount || 0;
  const currentRow = Math.floor(scrollTop.value / rowHeight);
  // Порог для подгрузки вниз (2/3 окна)
  const downThreshold = windowStartRow + Math.floor((WINDOW_SIZE * 2) / 3);
  // Порог для подгрузки вверх (1/3 окна)
  const upThreshold = windowStartRow + Math.floor((WINDOW_SIZE * 1) / 3);

  // Прокрутка вниз — подгружаем следующее окно
  if (
    currentRow >= downThreshold &&
    windowStartRow + windowLength < totalRows &&
    !isPreloading.value
  ) {
    const nextStart = windowStartRow + WINDOW_SIZE;
    const pageIdx = Math.floor(nextStart / pageSize.value);
    try {
      addPendingPageRequest(pageIdx);
    } catch (e) {}
    if (typeof props.loadWindow === "function") {
      isPreloading.value = true;
      Promise.resolve(props.loadWindow(nextStart)).finally(() => {
        isPreloading.value = false;
        try {
          pendingPageRequests.delete(pageIdx);
        } catch (e) {}
      });
    }
    return;
  }
  // Прокрутка вверх — подгружаем предыдущее окно
  if (currentRow <= upThreshold && windowStartRow > 0 && !isPreloading.value) {
    const prevStart = Math.max(0, windowStartRow - WINDOW_SIZE);
    const pageIdx = Math.floor(prevStart / pageSize.value);
    try {
      addPendingPageRequest(pageIdx);
    } catch (e) {}
    if (typeof props.loadWindow === "function") {
      isPreloading.value = true;
      Promise.resolve(props.loadWindow(prevStart)).finally(() => {
        isPreloading.value = false;
        try {
          pendingPageRequests.delete(pageIdx);
        } catch (e) {}
      });
    }
    return;
  }
  // Резкий переход за пределы окна — центрируем окно вокруг текущей строки
  if (
    (currentRow < windowStartRow ||
      currentRow >= windowStartRow + windowLength) &&
    !isPreloading.value
  ) {
    let newWindowStart = Math.max(0, currentRow - Math.floor(WINDOW_SIZE / 2));
    if (newWindowStart + WINDOW_SIZE > totalRows) {
      newWindowStart = Math.max(0, totalRows - WINDOW_SIZE);
    }
    if (typeof props.loadWindow === "function") {
      const pageIdx = Math.floor(newWindowStart / pageSize.value);
      try {
        addPendingPageRequest(pageIdx);
      } catch (e) {}
      isPreloading.value = true;
      Promise.resolve(props.loadWindow(newWindowStart)).finally(() => {
        isPreloading.value = false;
        try {
          pendingPageRequests.delete(pageIdx);
        } catch (e) {}
      });
    }
    return;
  }
}

// Вызовем при каждом scroll/mousewheel/drag
watch(scrollTop, () => {
  maybeRequestWindowByScroll();
});

// --- STORE LOGIC ---
const keywordsStore = useKeywordsStore();
const { keywords, totalCount, loading, loadingMore, sort } =
  storeToRefs(keywordsStore);

// Аналоги методов для передачи в props (используются в DataTableFixed copy.vue)
function loadWindow(newWindowStart: number) {
  // Аналогично loadWindow из keywords copy.ts
  return keywordsStore.loadWindow(newWindowStart);
}

function sortData(sortOptions: any) {
  // Аналогично sortKeywords из keywords copy.ts
  return keywordsStore.sortKeywords(sortOptions);
}

function loadData(projectId: string | null, options?: any) {
  // Аналогично loadKeywords из keywords copy.ts
  return keywordsStore.loadKeywords(projectId, options);
}

// Для передачи в props (если компонент используется напрямую)
// Можно заменить props.loadWindow, props.sortData, props.loadData на эти методы при необходимости

// Update CSS variable --header-height based on actual thead height so overlay positions correctly
function updateHeaderHeight() {
  try {
    const root = tableCardRef.value;
    if (!root) return;
    const tbl =
      tableRef.value || (root.querySelector && root.querySelector("table"));
    const thead = tbl && tbl.querySelector && tbl.querySelector("thead");
    const h = thead ? thead.offsetHeight : 35;
    root.style.setProperty("--header-height", h + "px");
  } catch (e) {
    // ignore
  }
}

function recalcPageSize() {
  try {
    // Always measure actual DOM height of the table card to compute page size
    let totalPx = 0;
    const root = tableCardRef.value;
    if (root) {
      const el = root;
      const rect = el && el.getBoundingClientRect && el.getBoundingClientRect();
      totalPx = (rect && rect.height) || 0;
    }
    if (!totalPx || totalPx < 10) {
      // fallback to CSS var or window-derived available height
      const cssTableH = root
        ? getComputedStyle(root).getPropertyValue("--table-height")
        : "";
      const totalStr = String(cssTableH || "")
        .replace("px", "")
        .trim();
      totalPx =
        Number(totalStr) ||
        Math.max(270, windowHeight.value - props.heightOffset);
    }
    const headerStr =
      (tableCardRef.value &&
        getComputedStyle(tableCardRef.value).getPropertyValue(
          "--header-height",
        )) ||
      `${rowHeight}px`;
    const headerPx = Number(String(headerStr).replace("px", "")) || rowHeight;
    const bodyH = Math.max(0, totalPx - headerPx);
    let newSize = Math.max(1, Math.floor(bodyH / rowHeight));
    pageSize.value = newSize;
  } catch (e) {
    // ignore
  }
}

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  updateHeaderHeight();
  recalcPageSize();
  window.addEventListener("resize", updateHeaderHeight);
  window.addEventListener("resize", recalcPageSize);
  // Use ResizeObserver for any container size change
  if (tableCardRef.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      recalcPageSize();
    });
    resizeObserver.observe(tableCardRef.value);
  }
});
onUnmounted(() => {
  window.removeEventListener("resize", updateHeaderHeight);
  window.removeEventListener("resize", recalcPageSize);
  if (resizeObserver && tableCardRef.value) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

// defer watch for tableHeight until it's declared (moved below)

// Set cursor style for the entire document during resizing
const documentStyle = computed(() => {
  return resizing.value ? { cursor: "col-resize" } : {};
});

const dataComp = computed(() => {
  try {
    // Проверяем, что keywords существует и является массивом
    if (!props.data || !Array.isArray(props.data)) {
      return [];
    }

    // Preserve original item fields (so tables using other props like category_name work)
    const result = props.data.map((item, index) => {
      // If item is an object, spread it and ensure id exists
      if (item && typeof item === "object") {
        return {
          ...item,
          id: (item as any).id || windowStart.value + index + 1,
        };
      }

      // For primitive values, keep as value field
      return {
        id: windowStart.value + index + 1,
        value: item,
      };
    });

    return result;
  } catch (error) {
    return [];
  }
});

// Computed property для видимой страницы виртуальной прокрутки
const lastRenderedPage = ref<any[]>([]);
const lastRenderedAt = ref(0);
// Lightweight in-memory cache for prefetched pages (non-persistent)
const pageCache = ref(new Map<number, any[]>());
const cursorForPage = ref<Record<number, any>>({});
function renderAndCache(arr: any[]) {
  try {
    lastRenderedPage.value = Array.isArray(arr) ? arr.slice() : [];
    lastRenderedAt.value = Date.now();
  } catch (e) {}
  return arr;
}

// Try to assemble up to `count` rows from the pageCache starting at `startRowGlobal`.
// Returns an array of items (may be shorter than count) and the actual start index used.
function assembleFromCache(startRowGlobal: number, count: number) {
  try {
    const out: any[] = [];
    let remaining = count;
    const startPageIdx = Math.floor(startRowGlobal / pageSize.value);
    let cursorRow = startRowGlobal;

    for (let pi = startPageIdx; remaining > 0; pi++) {
      const p = pageCache.value.get(pi);
      if (!p || !p.length) break;
      const pageStart = pi * pageSize.value;
      const s = Math.max(0, cursorRow - pageStart);
      for (let i = s; i < p.length && remaining > 0; i++) {
        const val = p[i];
        // If we encounter a hole in the cached page, stop assembling to avoid
        // returning non-contiguous rows (which would leave blanks in the UI).
        if (val === undefined || val === null) {
          if (debugPrefetch)
            console.debug(
              "[prefetch] hole in cache at page",
              pi,
              "index",
              i,
              "startRow",
              startRowGlobal,
            );
          remaining = 0; // stop outer loop as well
          break;
        }
        out.push(val);
        remaining--;
      }
      cursorRow = pageStart + p.length;
    }

    return { items: out, start: startRowGlobal };
  } catch (e) {
    return { items: [], start: startRowGlobal };
  }
}

const visiblePage = computed(() => {
  try {
    // Не очищаем таблицу при загрузке - показываем текущие данные
    // if (props.loading || props.loadingMore) {
    //   return [];
    // }

    // Рассчитываем видимые строки на основе scrollTop
    const startRow = Math.floor(scrollTop.value / rowHeight);
    const endRow = Math.min(startRow + pageSize.value, props.totalCount);

    // Если массив данных пустой и загрузка не идет — попытаться найти закешированную страницу
    if ((!props.data || props.data.length === 0) && !props.loading) {
      try {
        const pageIdxForStart = Math.floor(startRow / pageSize.value);
        const cached = pageCache.value.get(pageIdxForStart);
        if (cached && Array.isArray(cached) && cached.length) {
          const pageStartGlobal = pageIdxForStart * pageSize.value;

          // If we recently requested this window from parent (lastWindowStart),
          // avoid immediately rendering the cached page to prevent a double-change
          // (cache -> props.data). Prefer to wait a short time for parent data.
          if (
            (lastWindowStart.value === pageStartGlobal &&
              pendingLastWindowClear) ||
            pendingPageRequests.has(pageIdxForStart)
          ) {
            // If we have a recent render, keep it briefly, otherwise fallthrough
            try {
              const now = Date.now();
              if (
                lastRenderedPage.value &&
                lastRenderedPage.value.length > 0 &&
                now - lastRenderedAt.value < 500
              ) {
                return lastRenderedPage.value;
              }
            } catch (e) {}
          }

          const startInPage = Math.max(0, startRow - pageStartGlobal);
          const endInPage = Math.min(cached.length, endRow - pageStartGlobal);
          if (startInPage < endInPage) {
            if (debugPrefetch)
              console.debug("[prefetch] render cached page", pageIdxForStart, {
                startInPage,
                endInPage,
              });
            return renderAndCache(
              cached
                .slice(startInPage, endInPage)
                .map((item: any, index: number) => ({
                  ...item,
                  _rowNumber: pageStartGlobal + startInPage + index + 1,
                })),
            );
          }
        }
      } catch (err) {
        // ignore and fallthrough to return empty
      }

      // If we have a recent non-empty render, return it to avoid momentary blank
      try {
        const now = Date.now();
        if (
          lastRenderedPage.value &&
          lastRenderedPage.value.length > 0 &&
          now - lastRenderedAt.value < 500
        ) {
          return lastRenderedPage.value;
        }
      } catch (e) {}

      return renderAndCache([]);
    }

    // Проверяем доступность dataComp
    if (
      !dataComp.value ||
      !Array.isArray(dataComp.value) ||
      dataComp.value.length === 0
    ) {
      // If we recently rendered something, keep showing it briefly to avoid flicker
      try {
        const now = Date.now();
        if (
          lastRenderedPage.value &&
          lastRenderedPage.value.length > 0 &&
          now - lastRenderedAt.value < 500
        ) {
          return lastRenderedPage.value;
        }
      } catch (e) {}
      return renderAndCache([]);
    }

    // Если видимый диапазон пустой, возвращаем пустой массив
    if (endRow <= startRow) {
      return [];
    }

    // Определяем, какие данные из окна показать
    const windowStartRow = windowStart.value;
    const windowEndRow = windowStartRow + (props.data?.length || 0);

    // Если данные еще загружаются для этой позиции, показываем лоудер
    // if (props.loadingMore) {
    //   return [];
    // }

    // Если видимая область находится в текущем окне
    if (
      startRow >= windowStartRow &&
      endRow <= windowEndRow &&
      props.data?.length > 0
    ) {
      const startInWindow = startRow - windowStartRow;
      const endInWindow = Math.min(endRow - windowStartRow, props.data.length);

      // Дополнительная проверка границ
      if (
        startInWindow < 0 ||
        endInWindow <= startInWindow ||
        startInWindow >= dataComp.value.length
      ) {
        console.warn("visiblePage: Invalid window bounds", {
          startInWindow,
          endInWindow,
          dataLength: dataComp.value.length,
          startRow,
          endRow,
          windowStartRow,
          windowEndRow,
        });
        return [];
      }

      const result = dataComp.value
        .slice(startInWindow, endInWindow)
        .map((item, index) => ({
          ...item,
          _rowNumber: startRow + index + 1, // Глобальный номер строки на основе scrollTop
        }));

      // Debug log removed to reduce client console noise

      return renderAndCache(result);
    }

    // Если видимая область частично перекрывается с окном, показываем доступную часть
    if (
      startRow < windowEndRow &&
      endRow > windowStartRow &&
      props.data?.length > 0
    ) {
      const overlapStart = Math.max(startRow, windowStartRow);
      const overlapEnd = Math.min(endRow, windowEndRow);

      if (overlapEnd > overlapStart) {
        const startInWindow = overlapStart - windowStartRow;
        const endInWindow = overlapEnd - windowStartRow;

        if (startInWindow >= 0 && endInWindow <= dataComp.value.length) {
          const result = dataComp.value
            .slice(startInWindow, endInWindow)
            .map((item, index) => ({
              ...item,
              _rowNumber: overlapStart + index + 1,
            }));

          // Partial-overlap debug log removed to reduce client console noise

          return renderAndCache(result);
        }
      }
    }

    // Если видимая область не в текущем окне, автоматически загружаем данные
    const newWindowStart = Math.max(0, startRow - bufferSize);

    // windowEndRow уже определён выше; используем его для решения о рецентрации
    const needRecenter = startRow < windowStartRow || startRow >= windowEndRow;

    // If current slice is smaller than the desired window, recenter around current row
    if (needRecenter && (props.data?.length || 0) < WINDOW_SIZE) {
      // First, try to satisfy the visible area immediately from our pageCache
      const wantedCount = pageSize.value;
      const assembled = assembleFromCache(startRow, wantedCount);
      if (assembled.items && assembled.items.length) {
        if (debugPrefetch)
          console.debug(
            "[prefetch] assembled from cache for startRow",
            startRow,
            "items",
            assembled.items.length,
          );
        // If assembled items are fewer than wanted, prefer recent lastRenderedPage to avoid partial fill
        if (assembled.items.length < wantedCount) {
          const now = Date.now();
          if (
            lastRenderedPage.value &&
            lastRenderedPage.value.length > 0 &&
            now - lastRenderedAt.value < 500
          ) {
            if (debugPrefetch)
              console.debug(
                "[prefetch] assembled partial; using lastRenderedPage to avoid partial fill",
              );
            return lastRenderedPage.value;
          }
        }

        // Build rendered array from assembled items and pad if necessary
        const rendered: any[] = [];
        for (
          let i = 0;
          i < Math.min(assembled.items.length, wantedCount);
          i++
        ) {
          const it = assembled.items[i];
          rendered.push({ ...it, _rowNumber: startRow + i + 1 });
        }
        if (rendered.length > 0 && rendered.length < wantedCount) {
          // pad by repeating the last available item to avoid empty rows
          const last = rendered[rendered.length - 1];
          while (rendered.length < wantedCount) {
            const clone = { ...last };
            clone._rowNumber = startRow + rendered.length + 1;
            rendered.push(clone);
          }
        }

        // Trigger background recenter request to ensure authoritative data arrives
        let recenterStart = Math.max(0, startRow - Math.floor(WINDOW_SIZE / 2));
        if (recenterStart + WINDOW_SIZE > props.totalCount) {
          recenterStart = Math.max(0, props.totalCount - WINDOW_SIZE);
        }
        if (
          recenterStart !== lastWindowStart.value &&
          !props.loadingMore &&
          !isPreloading.value
        ) {
          scheduleLastWindowStart(recenterStart);
          const pageIdxReq = Math.floor(recenterStart / pageSize.value);
          try {
            addPendingPageRequest(pageIdxReq);
          } catch (e) {}
          // fire parent load in background but do not block showing cache
          if (typeof props.loadWindow === "function") {
            Promise.resolve(props.loadWindow(recenterStart)).finally(() => {
              try {
                pendingPageRequests.delete(pageIdxReq);
              } catch (e) {}
            });
          }
        }

        // If we assembled fewer than wanted rows, try to fill the remainder from Dexie in background
        if (
          assembled.items.length < wantedCount &&
          project &&
          projectAny.currentProjectId
        ) {
          (async () => {
            try {
              const dexie = useDexie();
              await dexie.init();
              const missingOffset = startRow + assembled.items.length;
              const missingLimit = wantedCount - assembled.items.length;
              const extra = await dexie.getKeywordsByProject(
                String(projectAny.currentProjectId),
                { offset: missingOffset, limit: missingLimit },
              );
              if (extra && Array.isArray(extra) && extra.length) {
                // insert into pageCache appropriately
                let cursor = missingOffset;
                let i = 0;
                while (i < extra.length) {
                  const pi = Math.floor(cursor / pageSize.value);
                  const pageStart = pi * pageSize.value;
                  const page = pageCache.value.get(pi) || [];
                  const startInPage = Math.max(0, cursor - pageStart);
                  const fill = Math.min(
                    extra.length - i,
                    pageSize.value - startInPage,
                  );
                  for (let j = 0; j < fill; j++) {
                    page[startInPage + j] = extra[i + j];
                  }
                  pageCache.value.set(pi, page);
                  i += fill;
                  cursor += fill;
                }
                if (debugPrefetch)
                  console.debug(
                    "[prefetch] background filled missing rows from dexie",
                    missingOffset,
                    extra.length,
                  );
              }
            } catch (e) {
              // ignore
            }
          })();
        }

        return renderAndCache(rendered);
      }

      let recenterStart = Math.max(0, startRow - Math.floor(WINDOW_SIZE / 2));
      if (recenterStart + WINDOW_SIZE > props.totalCount) {
        recenterStart = Math.max(0, props.totalCount - WINDOW_SIZE);
      }

      if (
        recenterStart !== lastWindowStart.value &&
        !props.loadingMore &&
        !isPreloading.value
      ) {
        scheduleLastWindowStart(recenterStart);
        const pageIdxReq = Math.floor(recenterStart / pageSize.value);
        try {
          addPendingPageRequest(pageIdxReq);
        } catch (e) {}
        isPreloading.value = true;
        if (typeof props.loadWindow === "function") {
          Promise.resolve(props.loadWindow(recenterStart)).finally(() => {
            isPreloading.value = false;
            try {
              pendingPageRequests.delete(pageIdxReq);
            } catch (e) {}
          });
        } else {
          isPreloading.value = false;
        }
      }
    } else {
      // Improved guard: avoid requesting windowStart==0 while scrolling down
      // (this caused parent to set props.windowStart=0 and reset view).
      if (
        newWindowStart !== windowStart.value &&
        newWindowStart !== lastWindowStart.value && // Prevent duplicate calls
        !props.loadingMore &&
        !isPreloading.value
      ) {
        const isScrollingDown = startRow >= windowStart.value;
        // If desired start is 0 and user is scrolling downwards, only skip
        // when current props.data already covers a full WINDOW_SIZE.
        if (
          newWindowStart === 0 &&
          isScrollingDown &&
          (props.data?.length || 0) >= WINDOW_SIZE
        ) {
          // skip requesting 0 to avoid resetting the view while scrolling down
        } else {
          // Mark this start as requested so we don't request it again
          scheduleLastWindowStart(newWindowStart);
          const pageReqIdx = Math.floor(newWindowStart / pageSize.value);
          try {
            addPendingPageRequest(pageReqIdx);
          } catch (e) {}
          // Request new window from parent; do NOT overwrite local windowStart here
          if (typeof props.loadWindow === "function") {
            props.loadWindow(newWindowStart);
          }
        }

        // Determine page index and request page by cursor when possible.
        const pageIdx = Math.floor(newWindowStart / pageSize.value);
        const limit = Math.max(props.data?.length || 300, pageSize.value * 3);

        // If we have this page cached locally, skip requesting parent to avoid extra load
        if (pageCache.value.has(pageIdx)) {
          // nothing to do; parent will still have stale props.data until store syncs
        } else {
          isPreloading.value = true;
          (async () => {
            try {
              let after = cursorForPage.value[pageIdx];
              // If no 'after' cursor for this page but we have cursor for previous page,
              // use that to request this page (cursor points to start of next page)
              if (!after && cursorForPage.value[pageIdx - 1]) {
                after = cursorForPage.value[pageIdx - 1];
              }

              // If we have a cursor, prefer cursor-based request via parent (so store keeps state)
              if (
                after &&
                project &&
                projectAny.currentProjectId &&
                typeof props.loadData === "function"
              ) {
                try {
                  addPendingPageRequest(pageIdx);
                  await props.loadData(projectAny.currentProjectId, {
                    after,
                    limit,
                  });
                  pendingPageRequests.delete(pageIdx);
                } catch (e) {
                  try {
                    pendingPageRequests.delete(pageIdx);
                  } catch (ee) {}
                  // fallback to direct dexie fetch below
                }
              } else if (
                project &&
                projectAny.currentProjectId &&
                typeof props.loadData === "function"
              ) {
                // fallback to offset-based request to parent
                const offset = pageIdx * pageSize.value;
                try {
                  addPendingPageRequest(pageIdx);
                  await props.loadData(project.currentProjectId, {
                    offset,
                    limit,
                  });
                  pendingPageRequests.delete(pageIdx);
                } catch (e) {
                  try {
                    pendingPageRequests.delete(pageIdx);
                  } catch (ee) {}
                  // ignore and fallback to direct dexie
                }
              }

              // Ensure we have cache for next pages via direct dexie prefetch (non-blocking)
              try {
                const dexie = useDexie();
                await dexie.init();
                const page = await dexie.getKeywordsPage(
                  String(projectAny.currentProjectId),
                  { limit: limit, after: after || undefined },
                );
                if (page && Array.isArray(page.items)) {
                  pageCache.value.set(pageIdx, page.items);
                  // compute cursor for next page
                  if (page.nextCursor) {
                    cursorForPage.value[pageIdx + 1] = page.nextCursor;
                  } else if (page.items && page.items.length) {
                    const last = page.items[page.items.length - 1];
                    cursorForPage.value[pageIdx + 1] = {
                      created_at: last.created_at,
                      id: last.id,
                    };
                  }
                }
              } catch (e) {
                // ignore prefetch errors
              }
            } finally {
              isPreloading.value = false;
            }
          })();
        }
      }
    }

    // Пока данные загружаются, показываем текущие данные (не очищаем таблицу)
    // Возвращаем пустой массив только если данных совсем нет
    if (props.data && props.data.length > 0) {
      // Показываем хоть какие-то данные, даже если они частично не соответствуют видимой области
      const availableStart = Math.max(0, startRow - windowStartRow);
      const availableEnd = Math.min(
        dataComp.value.length,
        endRow - windowStartRow,
      );
      if (
        availableStart < availableEnd &&
        availableStart < dataComp.value.length
      ) {
        return renderAndCache(
          dataComp.value
            .slice(availableStart, availableEnd)
            .map((item, index) => ({
              ...item,
              _rowNumber: windowStartRow + availableStart + index + 1,
            })),
        );
      }

      // Fallback: если видимая область полностью за пределами окна и данных недостаточно,
      // покажем хвост текущего окна (до pageSize строк), чтобы не показывать пустой экран.
      try {
        // If we recently asked parent for a window and are waiting, prefer showing
        // the last rendered page to avoid a quick tail -> cache -> props.data transition.
        try {
          const pendingIdx = Math.floor(windowStartRow / pageSize.value);
          if (pendingPageRequests.has(pendingIdx)) {
            const now = Date.now();
            if (
              lastRenderedPage.value &&
              lastRenderedPage.value.length > 0 &&
              now - lastRenderedAt.value < 500
            ) {
              return lastRenderedPage.value;
            }
            return renderAndCache([]);
          }
        } catch (e) {}

        const tailCount = Math.min(pageSize.value, dataComp.value.length);
        if (tailCount > 0) {
          const tailStart = Math.max(0, dataComp.value.length - tailCount);
          if (debugPrefetch)
            console.debug(
              "[prefetch] rendering tail for windowStart",
              windowStartRow,
              "tailStart",
              tailStart,
              "tailCount",
              tailCount,
            );
          return renderAndCache(
            dataComp.value.slice(tailStart).map((item, index) => ({
              ...item,
              _rowNumber: windowStartRow + tailStart + index + 1,
            })),
          );
        }
      } catch (e) {}
    }

    return [];
  } catch (error) {
    return [];
  }
}); // Computed property для определения необходимости скроллинга
const needsScrolling = computed(() => {
  try {
    // Если данные еще загружаются, считаем что скроллинг нужен
    if (props.loading) {
      return true;
    }

    // Если данных нет вообще, скроллинг не нужен
    if (props.totalCount === 0) {
      return false;
    }

    // Скроллинг нужен если общее количество строк больше видимых
    return props.totalCount > pageSize.value;
  } catch (error) {
    return false;
  }
});

// Computed property для расчета высоты ползунка скроллера
const handleHeight = computed(() => {
  try {
    if (!needsScrolling.value || !scroller.value) return "20px"; // Минимальная высота по умолчанию

    const totalRows = props.totalCount || pageSize.value; // Если totalCount неизвестен, используем pageSize как минимум
    const visibleRows = pageSize.value;

    if (totalRows <= visibleRows) {
      return `${(scroller.value as HTMLElement).clientHeight - 10}px`; // Ползунок на всю высоту скроллера
    }

    // Пропорциональная высота: (видимые строки / общее количество строк) * высота скроллера
    const proportion = visibleRows / totalRows;
    const calculatedHeight = Math.max(
      20,
      Math.floor(
        ((scroller.value as HTMLElement).clientHeight - 10) * proportion,
      ),
    ); // Минимум 20px

    return `${calculatedHeight}px`;
  } catch (error) {
    return "20px";
  }
});

// Computed property для расчета высоты таблицы.
// Если props.fixedHeight передан и >0 — используем его, иначе вычисляем как
// floor((window.innerHeight - 400) / rowHeight) * rowHeight — чтобы высота была кратна rowHeight.
const tableHeight = computed(() => {
  try {
    // 1) Явно заданная высота имеет приоритет
    if (
      props.fixedHeight &&
      typeof props.fixedHeight === "number" &&
      props.fixedHeight > 0
    ) {
      // Если явно задана fixedHeight, но записей мало (<5), подстраиваем высоту под контент
      const totalRowsFixed = Number(props.totalCount) || 0;
      if (totalRowsFixed > 0 && totalRowsFixed < 5) {
        const headerHeightFallback = rowHeight; // используем высоту строки как оценку шапки
        const contentH = headerHeightFallback + totalRowsFixed * rowHeight;
        return contentH + "px";
      }
      return props.fixedHeight + "px";
    }

    // Базируем высоту на количестве строк: каждая строка 35px + высота заголовка ≈ 35px
    const totalRows = Number(props.totalCount) || 0;
    const header = rowHeight; // приблизительная высота заголовка
    const contentHeight =
      totalRows > 0
        ? totalRows * rowHeight + header
        : Math.max(270, header + rowHeight * 3); // минимальная комфортная высота, если данных нет

    // Treat loading with unknown/zero total as empty content: apply same minimal height
    const isEmptyLike = totalRows === 0 || (props.loading && totalRows === 0);

    // Если окно доступно — ограничиваем только сверху: если контента мало, роли не играет
    if (typeof window !== "undefined" && windowHeight.value) {
      const availableRaw = windowHeight.value - props.heightOffset;
      const available = Math.max(0, availableRaw);
      // Для пустой таблицы или во время загрузки применяем минимальную комфортную высоту (270px)
      if (isEmptyLike) {
        const final = Math.min(contentHeight, Math.max(270, available));
        return final + "px";
      }
      // Для непустых таблиц используем общую логику: не принудительно увеличиваем контейнер,
      // но гарантируем минимум для заголовка + 1 строки, чтобы не обрезать интерфейс
      const minForOneRow = header + rowHeight;
      const final = Math.min(contentHeight, Math.max(minForOneRow, available));
      return final + "px";
    }
  } catch (e) {
    return "600px";
  }
});

// Watch tableHeight after it's initialized to recalc page size
watch(
  () => tableHeight.value,
  () => {
    recalcPageSize();
  },
);

// Computed property для общей высоты таблицы (все строки)
const totalTableHeight = computed(() => {
  try {
    // Если данные еще загружаются и totalCount неизвестен, используем минимальную высоту
    if (props.loading && props.totalCount === 0) {
      return pageSize.value * rowHeight; // Минимальная высота для видимой области
    }

    // Базовая логика: суммарная высота контента = количество строк * высота строки
    if (props.totalCount > 0) {
      return props.totalCount * rowHeight;
    }

    // Если данных нет, возвращаем 0
    return 0;
  } catch (error) {
    return 0;
  }
});

// Computed property для позиции второго фиксированного столбца
const secondColumnLeft = computed(() => {
  const firstColumnWidth = getColumnWidth("_rowNumber");
  return firstColumnWidth + "px";
});

// Computed property для отображения лоудера только при полной загрузке (не при фоновой подгрузке)
const showLoadingMore = computed(() => {
  try {
    // Показываем лоадер только если данных совсем нет И идет загрузка
    // При инкрементальной подгрузке (isPreloading) лоадер не показываем
    return (
      visiblePage.value.length === 0 && props.loadingMore && !isPreloading.value
    );
  } catch (error) {
    return false;
  }
});

// Новое вычисляемое свойство для столбцов таблицы с номером строки
const tableColumnsWithRowNumber = computed(() => {
  // Defensive: ensure props.tableColumns is iterable (array). If not, fall back to empty array.
  const cols = Array.isArray(props.tableColumns) ? props.tableColumns : [];
  return [
    {
      prop: "_rowNumber",
      name: "#",
      width: 35,
      formatter: (_: any, __: any, rowIndex: number) => rowIndex + 1, // Формируем номер строки
    },
    ...cols,
  ];
});

function formatCellValue(
  value: any,
  columnProp: string,
  rowIndex: number | null = null,
  row: any = null,
) {
  try {
    if (columnProp === "_rowNumber") {
      return rowIndex! + 1;
    }

    // Treat null/undefined/empty string as empty; allow numeric 0
    if (value === null || typeof value === "undefined" || value === "")
      return "";

    if (columnProp === "category_info") {
      try {
        // The template sometimes passes the whole row as the first argument
        // (formatCellValue(row, 'category_info')) and sometimes passes the
        // cell value as the first arg and row as the third param. Support both.
        const r = row || value;
        if (!r) return "";
        const name = typeof r.category_name === "string" ? r.category_name : "";
        const similarity = r.category_similarity;
        const simFormatted = similarity ? formatSimilarity(similarity) : "";
        // Use inline-flex wrapper so the tag can be right-aligned inside the cell.
        // Escape the category name to avoid accidental HTML injection.
        return `<span class="category-info-inline"><span class="category-name" title="${escapeHtml(
          name,
        )}">${escapeHtml(
          name,
        )}</span><span class="similarity-tag">${simFormatted}</span></span>`;
      } catch (e) {
        console.error("Error in category_info formatting:", e);
        return "";
      }
    }

    if (columnProp === "date" && value) {
      return moment(value).format("YYYY-MM-DD HH:mm:ss");
    }

    if (columnProp === "created_at" && value) {
      // Обрабатываем как ISO строку или как строку в формате YYYY-MM-DD HH:mm:ss
      const date = moment(value);
      if (date.isValid()) {
        return date.format("YYYY-MM-DD HH:mm:ss");
      }
      return value; // Если не удалось распарсить, возвращаем как есть
    }

    // Обработка classification_label — пропускаем, так как у него есть кастомный шаблон
    if (columnProp === "classification_label") {
      return "";
    }

    // Обработка classification_score и cluster_score — пропускаем, так как у них есть кастомные шаблоны
    if (
      columnProp === "classification_score" ||
      columnProp === "cluster_score"
    ) {
      return "";
    }

    // Display similarity fields as percent (0.0 - 1.0 => 0% - 100%) or numeric 0-100
    if (
      columnProp === "category_similarity" ||
      columnProp === "class_similarity"
    ) {
      // Accept values in [0,1] or [0,100]
      const num = Number(value);
      if (Number.isNaN(num)) return value;
      const v = num <= 1 ? num * 100 : num;
      return `${v.toFixed(2)}%`;
    }

    // Убрана жесткая обрезка URL - теперь обрезка происходит по ширине столбца через CSS
    // if (columnProp === "url" && value.length > 60) {
    //   return value.substring(0, 60) + "...";
    // }

    return value;
  } catch (error) {
    return value || "";
  }
}

function formatSimilarity(value: any) {
  const num = Number(value);
  if (Number.isNaN(num)) return "";
  const v = num <= 1 ? num * 100 : num;
  return `${v.toFixed(2)}%`;
}

function getConfidenceTagType(value: any) {
  const raw = Number(value);
  const num = raw <= 1 && raw >= 0 ? raw * 100 : raw;

  if (Number.isNaN(num)) return "info";
  if (num === 0) return "info";
  if (num > 90) return "success";
  if (num >= 70) return "primary";
  if (num >= 50) return "warning";
  return "danger";
}

// Sanitize column header names: remove accidental injected attribute-like text
function safeColumnName(column: any) {
  try {
    const name =
      column && column.name ? String(column.name) : String(column || "");
    // Remove anything starting with an equals sign followed by space and 'props' (defensive)
    let cleaned = name.replace(/\s*=\s*props\.[^\s]*/g, "");
    // Remove trailing attribute-like sequences starting with '@' or ':'
    cleaned = cleaned.replace(/\s+[@:][\w-]+=?.*$/g, "");
    // Trim leftover whitespace
    return cleaned.trim();
  } catch (e) {
    return column && column.name ? column.name : "";
  }
}

// Simple HTML escaper for values rendered via v-html
function escapeHtml(unsafe: any) {
  if (!unsafe && unsafe !== 0) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getSortClass(columnProp: string) {
  try {
    const currentSort = props.sort || {};

    // Two supported shapes:
    // 1) { field: 'col', direction: 'ascending' }
    // 2) { col: 1 } or { col: -1 }

    let field = null;
    let direction = null;

    if (currentSort.field) {
      field = currentSort.field;
      direction =
        currentSort.direction === "ascending" ? "ascending" : "descending";
    } else {
      const keys = Object.keys(currentSort || {});
      if (keys.length > 0) {
        field = keys[0];
        const val = currentSort[field];
        direction = val === 1 ? "ascending" : "descending";
      }
    }

    if (!field) return "";

    // Debugging: log current sort and column being checked
    // eslint-disable-next-line no-console
    console.debug(
      "getSortClass: column=",
      columnProp,
      "sort=",
      currentSort,
      "derivedField=",
      field,
      "direction=",
      direction,
    );

    // Учитываем маппинг _id <-> id
    // Также маппим логические столбцы на реальные поля: 'category_info' -> 'category_similarity', 'class_info' -> 'class_similarity'
    const mappedColumnProp =
      columnProp === "category_info"
        ? "category_similarity"
        : columnProp === "class_info"
          ? "class_similarity"
          : columnProp;
    const isCurrentColumn =
      field === mappedColumnProp ||
      (field === "id" && mappedColumnProp === "_id") ||
      (field === "_id" && mappedColumnProp === "id");

    if (!isCurrentColumn) return "";

    return direction === "ascending" ? "sort-asc" : "sort-desc";
  } catch (e) {
    return "";
  }
}

function handleSort(columnProp: string) {
  try {
    let sortField = columnProp;

    // Map logical columns to actual DB fields
    if (sortField === "category_info") {
      // sort by similarity value for category_info header
      sortField = "category_similarity";
    }
    if (sortField === "class_info") {
      // sort by similarity value for class_info header
      sortField = "class_similarity";
    }

    // Преобразуем _id в id для SQLite
    if (sortField === "_id") sortField = "id";

    // Detect current sort in both shapes
    const currentSort = props.sort || {};
    let currentField = null;
    let currentDir = null; // 'ascending' | 'descending'

    if (currentSort.field) {
      currentField = currentSort.field;
      currentDir =
        currentSort.direction === "ascending" ? "ascending" : "descending";
    } else {
      const keys = Object.keys(currentSort);
      if (keys.length > 0) {
        currentField = keys[0];
        currentDir =
          currentSort[currentField] === 1 ? "ascending" : "descending";
      }
    }

    // Toggle direction
    let newDir = "ascending";
    const isCurrentColumn =
      currentField === sortField ||
      (currentField === "id" && sortField === "_id");
    if (isCurrentColumn && currentDir === "ascending") {
      newDir = "descending";
    }

    // Reset scroll/virtual window and sync with store
    scrollTop.value = 0;
    start.value = 0;
    scheduleLastWindowStart(0);
    windowStart.value = 0;

    // Backend expects numeric sort object like { col: 1 } where 1 = ASC, -1 = DESC
    const numeric = newDir === "ascending" ? 1 : -1;
    const sortObj: Record<string, number> = {};
    sortObj[sortField] = numeric;

    // Debugging: log the sort being emitted
    // eslint-disable-next-line no-console
    console.debug(
      "handleSort: emitting sortObj=",
      sortObj,
      "from column=",
      columnProp,
      "props.sort=",
      props.sort,
    );

    props.sortData(sortObj);

    // Force window reload at 0 to avoid stale slice during rapid wheel scroll
    if (typeof props.loadWindow === "function") {
      props.loadWindow(0);
    }
    try {
      const limit = props.data?.length || 300;
      if (
        project &&
        projectAny.currentProjectId &&
        typeof props.loadData === "function"
      ) {
        props.loadData(projectAny.currentProjectId, { offset: 0, limit });
      }
    } catch (err) {
      // ignore
    }
  } catch (e) {
    console.error("handleSort error:", e);
  }
}

// Функция удалена, т.к. больше не используется пагинация
// Оставляем для совместимости, чтобы не было ошибок если вызывается где-то еще
function changeCurrentPage(val: any) {
  // Просто делегируем в getsortedDb без пагинации
  projectAny.tableLoading = true;
  projectAny.tableData = [];

  projectAny.getsortedDb({
    id: projectAny.data?.id,
    sort: projectAny.sort,
    skip: 0,
    limit: 0, // 0 означает "без лимита" - загрузить все
    db: projectAny.currentDb,
  });
}

function handleTableChange(selectedDb: any) {
  // debug: Changing table to: (removed console.log to reduce client noise)
  // Устанавливаем новую базу данных
  projectAny.currentDb = selectedDb;

  // Reset column widths when changing tables
  columnWidths.value = {};

  // Load stored column widths from localStorage first
  const storageKey = `table-column-widths-${
    projectAny.data?.id || "unknown"
  }-${selectedDb}`;
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    try {
      const storedWidths = JSON.parse(stored);
      columnWidths.value = { ...storedWidths };
    } catch (e) {
      // Ignore errors
    }
  } else if (
    projectAny.data &&
    projectAny.data.columnWidths &&
    projectAny.data.columnWidths[selectedDb]
  ) {
    // Fallback to project data
    columnWidths.value = { ...projectAny.data.columnWidths[selectedDb] };
  }

  projectAny.tableData = [];
  projectAny.tableLoading = true;
  projectAny.currentPage = 1;

  projectAny.getsortedDb({
    id: projectAny.data?.id,
    sort: projectAny.sort,
    skip: 0,
    limit: 0, // 0 означает "без лимита" - загрузить все
    db: selectedDb,
  });
}

function getsortedDb(sort: any) {
  projectAny.tableLoading = true;
  projectAny.tableData = [];
  projectAny.currentPage = 1;

  projectAny.getsortedDb({
    id: projectAny.data.id,
    sort: sort,
    skip: 0,
    limit: 0, // 0 означает "без лимита" - загрузить все
    db: projectAny.currentDb,
  });
}

// Функция для загрузки дополнительных данных (отключена в пользу mousewheel логики)
function loadMoreData() {
  // Эта функция отключена, так как загрузка данных теперь управляется
  // напрямую из функции mousewheel для лучшей синхронизации
  // debug: loadMoreData called but skipped - using mousewheel logic instead
  return;
}

// Ensure loadingMore is reset correctly after data loading
watch(
  () => props.loadingMore,
  (newVal) => {
    if (!newVal) {
      // debug: loadingMore reset to false (removed console.log)
    }
  },
);

// Watch props.data/windowStart to cache loaded pages and compute cursors for next pages
watch(
  () => [props.data, props.windowStart],
  (vals) => {
    try {
      const pData = props.data || [];
      const pWindowStart =
        typeof props.windowStart === "number"
          ? props.windowStart
          : windowStart.value;
      const pageIdx = Math.floor(pWindowStart / pageSize.value);
      if (Array.isArray(pData) && pData.length > 0) {
        // Cache a shallow copy
        pageCache.value.set(pageIdx, pData.slice());
        const last = pData[pData.length - 1];
        if (last) {
          cursorForPage.value[pageIdx + 1] = {
            created_at: (last as any).created_at,
            id: (last as any).id,
          };
        }
        // Remove pending request mark for this page (parent responded)
        try {
          pendingPageRequests.delete(pageIdx);
        } catch (e) {}
        if (debugPrefetch)
          console.debug(
            "[prefetch] cached props.data for pageIdx",
            pageIdx,
            "len",
            pData.length,
          );
        // If we were waiting for data for a recently-updated windowStart,
        // now that data arrived, sync internal windowStart and refresh handle.
        if (waitingForWindowData.value) {
          windowStart.value = pWindowStart;
          // Clear and schedule lastWindowStart through our helper to maintain TTL behavior
          scheduleLastWindowStart(pWindowStart);
          waitingForWindowData.value = false;
          // Clear any pending lastWindowStart auto-clear timer (we got data)
          try {
            if (pendingLastWindowClear) {
              clearTimeout(pendingLastWindowClear);
              pendingLastWindowClear = null;
            }
          } catch (e) {}
          nextTick(() => updateHandlePosition());
        }
      }
    } catch (e) {
      // ignore
    }
  },
);

// Column resizing functions
function getColumnWidth(columnProp: string) {
  // First check if we have a temporarily stored width from active resizing
  if (columnWidths.value[columnProp]) {
    // Применяем минимальную ширину для _rowNumber
    if (columnProp === "_rowNumber") {
      return Math.max(35, columnWidths.value[columnProp]);
    }
    return columnWidths.value[columnProp];
  }

  // Check if width is stored in project data for current table
  if (
    projectAny.data &&
    projectAny.data.columnWidths &&
    projectAny.data.columnWidths[getDbKey()] &&
    projectAny.data.columnWidths[getDbKey()][columnProp]
  ) {
    // Применяем минимальную ширину для _rowNumber
    if (columnProp === "_rowNumber") {
      return Math.max(35, projectAny.data.columnWidths[getDbKey()][columnProp]);
    }
    return projectAny.data.columnWidths[getDbKey()][columnProp];
  }

  // Find the column in tableColumns
  const column = props.tableColumns.find((col) => col.prop === columnProp);
  // Default widths: 35px for _rowNumber, otherwise 300px
  if (columnProp === "_rowNumber") return 35;
  return column?.width || 300;
}

function startResize(event: any, columnProp: string) {
  event.stopPropagation();
  // Do not allow resizing for action column only
  if (columnProp === "_actions") return;
  resizing.value = true;
  currentColumn.value = columnProp;
  startX.value = event.pageX;

  // Get current width
  startWidth.value = getColumnWidth(columnProp);

  // Add event listeners
  document.addEventListener("mousemove", handleResize);
  document.addEventListener("mouseup", stopResize);
}

function handleResize(event) {
  if (!resizing.value || !currentColumn.value) return;

  const diff = event.pageX - startX.value;
  // Minimum width depends on column type
  const minWidth = currentColumn.value === "_rowNumber" ? 35 : 80;
  const newWidth = Math.max(minWidth, startWidth.value + diff);

  // Update column width in local state for immediate visual feedback
  columnWidths.value = {
    ...columnWidths.value,
    [currentColumn.value]: newWidth,
  };
}

function stopResize() {
  if (resizing.value && currentColumn.value) {
    // First set resizing to false
    resizing.value = false;

    // Then save the final width to the project store
    saveColumnWidth(
      currentColumn.value,
      columnWidths.value[currentColumn.value],
    );
  }

  currentColumn.value = null;
  document.removeEventListener("mousemove", handleResize);
  document.removeEventListener("mouseup", stopResize);
}

// Drag & drop handlers for column reordering
function onDragStart(event, column, columnIndex) {
  try {
    // columnIndex is in tableColumnsWithRowNumber space (0 => _rowNumber)
    // Map to props.tableColumns index (real columns) for fixed-column checks
    const realColumnIndex = Math.max(0, columnIndex - 1);
    // Only allow dragging non-fixed, non-action, non-rowNumber columns
    if (
      column.prop === "_rowNumber" ||
      column.prop === "_actions" ||
      realColumnIndex < props.fixedColumns
    ) {
      event.preventDefault();
      return;
    }

    draggingProp.value = column.prop;
    // store prop in dataTransfer for cross-window support
    try {
      event.dataTransfer &&
        event.dataTransfer.setData("text/plain", column.prop);
      event.dataTransfer.effectAllowed = "move";
    } catch (e) {
      // ignore
    }
  } catch (e) {
    // ignore
  }
}

function _getHeaderRects() {
  const card = tableCardRef.value;
  if (!card) return [];
  const ths = Array.from(card.querySelectorAll("thead th")) || [];
  return ths.map((el) => el.getBoundingClientRect());
}

function _getInsertBeforeIndexFromX(x) {
  const rects = _getHeaderRects();
  const n = rects.length;
  if (n === 0) return -1;
  // If a column is being dragged, prefer using its CURRENT header center
  // so the indicator toggles when the dragged column's center crosses midpoints.
  try {
    // Use the pointer X position directly. For correct placement we must
    // compute midpoints between header centers and compare to the pointer
    // X; overriding X with the dragged header center causes the indicator
    // to snap incorrectly when reordering columns.
  } catch (e) {
    // ignore and continue with provided x
  }

  // compute centers
  const centers = rects.map((r) => r.left + r.width / 2);
  // compute midpoints between centers
  const midpoints = [];
  for (let i = 0; i < centers.length - 1; i++) {
    midpoints.push((centers[i] + centers[i + 1]) / 2);
  }

  // find first midpoint greater than x --> insert before header index = i+1
  for (let i = 0; i < midpoints.length; i++) {
    if (x < midpoints[i]) {
      return i + 1; // tableColumnsWithRowNumber index
    }
  }

  // if x is beyond last midpoint, insert after last header
  return n; // tableColumnsWithRowNumber index representing end
}

function _getHeaderUnderX(x: number) {
  const card = tableCardRef.value;
  if (!card) return -1;
  const ths = Array.from(card.querySelectorAll("thead th")) || [];
  for (let i = 0; i < ths.length; i++) {
    const r = ths[i].getBoundingClientRect();
    if (x >= r.left && x <= r.right) return i;
  }
  return -1;
}

function onDragOver(event, _columnIndex) {
  try {
    if (!draggingProp.value) return;

    const x = event.clientX;
    let insertThIndex = _getInsertBeforeIndexFromX(x);
    if (insertThIndex < 0) {
      dragOverIndex.value = -1;
      insertBeforeIndex.value = -1;
      return;
    }

    // Ensure we don't insert into fixed columns area.
    // props.fixedColumns counts fixed columns in props.tableColumns (no rowNumber),
    // so minimum allowed insert position in th-index space is 1 + props.fixedColumns
    const minAllowedTh = 1 + Math.max(0, props.fixedColumns);
    if (insertThIndex < minAllowedTh) insertThIndex = minAllowedTh;
    const maxTh = _getHeaderRects().length || 0;
    if (insertThIndex > maxTh) insertThIndex = maxTh;

    insertBeforeIndex.value = insertThIndex;

    const headerUnder = _getHeaderUnderX(x);
    dragOverIndex.value = headerUnder;
  } catch (e) {
    dragOverIndex.value = -1;
    insertBeforeIndex.value = -1;
  }
}

function onDragLeave(_event, _columnIndex) {
  // Clear hover/insert indicators when leaving header cell
  dragOverIndex.value = -1;
  insertBeforeIndex.value = -1;
}

function handleBodyDragOver(event) {
  // If nothing is being dragged, ignore
  if (!draggingProp.value) return;
  try {
    const card = tableCardRef.value?.$el || tableCardRef.value;
    if (!card) return;
    const ths = card.querySelectorAll("thead th");
    if (!ths || ths.length === 0) return;
    const x = event.clientX;
    let foundIndex = -1;
    for (let i = 0; i < ths.length; i++) {
      const r = ths[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right) {
        foundIndex = i;
        break;
      }
    }
    if (foundIndex === -1) {
      // If to the right of all headers, target the last header
      const lastRect = ths[ths.length - 1].getBoundingClientRect();
      if (x > lastRect.right) foundIndex = ths.length - 1;
      else if (x < ths[0].left) foundIndex = 0;
    }
    if (foundIndex >= 0) {
      onDragOver(event, foundIndex);
    }
  } catch (e) {
    // ignore
  }
}

function handleBodyDrop(event) {
  if (!draggingProp.value) {
    try {
      draggingProp.value = event.dataTransfer?.getData("text/plain") || null;
    } catch (e) {}
  }
  try {
    const card = tableCardRef.value?.$el || tableCardRef.value;
    if (!card) return;
    const ths = card.querySelectorAll("thead th");
    if (!ths || ths.length === 0) return;
    const x = event.clientX;
    let foundIndex = -1;
    for (let i = 0; i < ths.length; i++) {
      const r = ths[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right) {
        foundIndex = i;
        break;
      }
    }
    if (foundIndex === -1) {
      const lastRect = ths[ths.length - 1].getBoundingClientRect();
      if (x > lastRect.right) foundIndex = ths.length - 1;
      else if (x < ths[0].left) foundIndex = 0;
    }
    if (foundIndex >= 0) {
      onDrop(event, foundIndex);
    }
  } catch (e) {
    // ignore
  }
}

function handleBodyDragLeave(_event) {
  // Clear hover/insert when leaving the body area
  dragOverIndex.value = -1;
  insertBeforeIndex.value = -1;
}

function onDrop(event, columnIndex) {
  try {
    if (!draggingProp.value) {
      try {
        draggingProp.value = event.dataTransfer.getData("text/plain");
      } catch (e) {
        // nothing
      }
    }

    const fromProp = draggingProp.value;
    if (!fromProp) return;

    // Work on props.tableColumns copy of props
    const current = props.tableColumns.map((c) => c.prop);
    const fromIdx = current.indexOf(fromProp);
    if (fromIdx === -1) return;

    // Determine target insertion index based on insertBeforeIndex (th-index space)
    // Convert to props.tableColumns index space (subtract 1 for _rowNumber)
    let targetInsertProps = -1;
    if (
      typeof insertBeforeIndex.value === "number" &&
      insertBeforeIndex.value >= 0
    ) {
      targetInsertProps = insertBeforeIndex.value - 1;
    } else {
      // fallback to columnIndex derived method (columnIndex is th-index space)
      targetInsertProps = columnIndex - 1;
    }

    // Enforce that we don't insert into fixed columns area
    targetInsertProps = Math.max(props.fixedColumns || 0, targetInsertProps);

    // Remove the dragged item
    current.splice(fromIdx, 1);

    // After removal, if original index was before the target, the target shifts left by 1
    let insertAt = targetInsertProps;
    if (fromIdx < targetInsertProps)
      insertAt = Math.max(0, targetInsertProps - 1);

    // Ensure we don't insert into fixed columns area
    const minAllowed = Math.max(0, props.fixedColumns - 1);
    if (insertAt < minAllowed) insertAt = minAllowed;
    if (insertAt > current.length) insertAt = current.length;

    current.splice(insertAt, 0, fromProp);

    // Emit new order for parent to persist
    emit("columns-reorder", current);
  } catch (e) {
    // ignore
  } finally {
    draggingProp.value = null;
    dragOverIndex.value = -1;
    insertBeforeIndex.value = -1;
  }
}

function onDragEnd() {
  draggingProp.value = null;
  dragOverIndex.value = -1;
  insertBeforeIndex.value = -1;
}

function saveColumnWidth(columnProp, width) {
  // Применяем минимальную ширину для _rowNumber
  const finalWidth = columnProp === "_rowNumber" ? Math.max(35, width) : width;

  // Update columnWidths.value to include this new width
  columnWidths.value = {
    ...columnWidths.value,
    [columnProp]: finalWidth,
  };

  // Make sure columnWidths structure exists in project data
  if (!projectAny.data) {
    projectAny.data = {};
  }
  if (!projectAny.data.columnWidths) {
    projectAny.data.columnWidths = {};
  }

  // Initialize current DB column widths if not exist
  if (!projectAny.data.columnWidths[getDbKey()]) {
    projectAny.data.columnWidths[getDbKey()] = {};
  }

  // Save ALL current column widths to project data (not just one)
  projectAny.data.columnWidths[getDbKey()] = {
    ...projectAny.data.columnWidths[getDbKey()],
    ...columnWidths.value,
  };

  // Find the column in the default settings or parser columns and update there too
  if (!Array.isArray(projectAny.defaultColumns)) {
    projectAny.defaultColumns = [];
  }
  const defaultColumnIndex = projectAny.defaultColumns.findIndex(
    (col) => col.prop === columnProp,
  );
  if (defaultColumnIndex !== -1) {
    projectAny.defaultColumns[defaultColumnIndex].width = finalWidth;
  } else {
    // Try to find in the parser columns (only if parser exists and is an array)
    if (projectAny.data && Array.isArray(projectAny.data.parser)) {
      const parserColumnIndex = projectAny.data.parser.findIndex(
        (col) => col.prop === columnProp,
      );
      if (parserColumnIndex !== -1) {
        projectAny.data.parser[parserColumnIndex].width = finalWidth;
      }
    }
  }

  // Save ALL widths to localStorage (not just one)
  saveAllColumnWidthsToLocalStorage();

  // Only save to database when resizing is complete to avoid too many updates
  if (!resizing.value) {
    project.saveProjectData()
  }
}

// Функция сохранения ширины столбцов в localStorage
function saveColumnWidthsToLocalStorage(columnProp, width) {
  const storageKey = `table-column-widths-${project.data.id}-${getDbKey()}`;
  let storedWidths = {};

  // Загружаем существующие ширины из localStorage
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    try {
      storedWidths = JSON.parse(stored);
    } catch (e) {
      storedWidths = {};
    }
  }

  // Обновляем ширину для конкретного столбца
  storedWidths[columnProp] = width;

  // Сохраняем обратно в localStorage
  try {
    localStorage.setItem(storageKey, JSON.stringify(storedWidths));
  } catch (e) {
    // Ignore errors
  }
}

// Функция сохранения ВСЕХ ширин столбцов в localStorage
function saveAllColumnWidthsToLocalStorage() {
  const storageKey = `table-column-widths-${project.data.id}-${getDbKey()}`;

  // Сохраняем все текущие ширины
  try {
    localStorage.setItem(storageKey, JSON.stringify(columnWidths.value));
  } catch (e) {
    // Ignore errors
  }
}

// Функция загрузки ширины столбцов из localStorage
function loadColumnWidthsFromLocalStorage() {
  const storageKey = `table-column-widths-${project.data.id}-${getDbKey()}`;
  const stored = localStorage.getItem(storageKey);

  if (stored) {
    try {
      const storedWidths = JSON.parse(stored);

      // Применяем минимальную ширину для _rowNumber
      const processedWidths = { ...storedWidths };
      if (processedWidths["_rowNumber"]) {
        processedWidths["_rowNumber"] = Math.max(
          35,
          processedWidths["_rowNumber"],
        );
      }

      // Обновляем columnWidths в компоненте
      columnWidths.value = { ...processedWidths };

      // Также обновляем в project data, если нужно
      if (!project.data) {
        project.data = {};
      }
      if (!project.data.columnWidths) {
        project.data.columnWidths = {};
      }
      if (!project.data.columnWidths[getDbKey()]) {
        project.data.columnWidths[getDbKey()] = {};
      }
      Object.assign(project.data.columnWidths[getDbKey()], processedWidths);

      return processedWidths;
    } catch (e) {
      return {};
    }
  }

  return {};
}

// Функция для синхронизации ширины столбцов шапки и тела таблицы
const syncHeaderAndBodyColumns = () => {
  const headerCols = document.querySelectorAll(".table-header-container th");
  const bodyCols = document.querySelectorAll(
    ".table-body-container tr:first-child td",
  );

  if (headerCols.length === bodyCols.length) {
    headerCols.forEach((headerCol, index) => {
      const width = headerCol.offsetWidth;
      if (bodyCols[index]) {
        bodyCols[index].style.width = `${width}px`;
        bodyCols[index].style.minWidth = `${width}px`;
      }
    });
  }
};

// Clean up event listeners when component is unmounted
onMounted(async () => {
  try {
    // Ждем следующего тика для получения DOM элементов
    await nextTick();

    // Функция обновления высоты окна
    const updateWindowHeight = () => {
      windowHeight.value = window.innerHeight;
    };

    // Добавляем слушатель изменения размера окна
    window.addEventListener("resize", updateWindowHeight);

    // Загружаем ширину колонок из localStorage
    const localWidths = loadColumnWidthsFromLocalStorage();

    // Инициализация ширины колонок (сначала из localStorage, затем из project data)
    if (Object.keys(localWidths).length > 0) {
      columnWidths.value = { ...localWidths };
    } else if (
      project.data &&
      project.data.columnWidths &&
      project.data.columnWidths[getDbKey()]
    ) {
      const projectWidths = { ...project.data.columnWidths[getDbKey()] };
      // Применяем минимальную ширину для _rowNumber
      if (projectWidths["_rowNumber"]) {
        projectWidths["_rowNumber"] = Math.max(35, projectWidths["_rowNumber"]);
      }
      columnWidths.value = { ...projectWidths };
    }

    // Sync column widths from storage or project data for current DB
    const updateColumnWidthsFromStore = () => {
      // Если идет ресайз, не обновляем из стора (чтобы не потерять текущие изменения)
      if (resizing.value) {
        return;
      }

      // Сначала пробуем загрузить из localStorage
      const localWidths = loadColumnWidthsFromLocalStorage();
      if (Object.keys(localWidths).length > 0) {
        columnWidths.value = { ...localWidths };
      } else if (
        project.data &&
        project.data.columnWidths &&
        project.data.columnWidths[getDbKey()]
      ) {
        const projectWidths = {
          ...project.data.columnWidths[getDbKey()],
        };
        // Применяем минимальную ширину для _rowNumber
        if (projectWidths["_rowNumber"]) {
          projectWidths["_rowNumber"] = Math.max(
            35,
            projectWidths["_rowNumber"],
          );
        }
        columnWidths.value = { ...projectWidths };
      } else {
        // Reset column widths when switching to a table with no stored widths
        columnWidths.value = {};
      }
    };

    // Initialize virtual scroll
    const updatePageSize = () => {
      // window size and container height logging removed

      // Для фиксированной высоты рассчитываем pageSize на основе fixedHeight
      if (props.fixedHeight && props.fixedHeight > 0) {
        // Проверяем готовность tableCardRef
        if (!tableCardRef.value) {
          // tableCardRef not ready: keep default pageSize
          return;
        }

        // Вычисляем реальную высоту заголовка таблицы, вместо магической константы
        let headerHeight = 0;
        try {
          const cardElement = tableCardRef.value.$el || tableCardRef.value;
          const headerEl =
            cardElement.querySelector && cardElement.querySelector("thead");
          if (headerEl) {
            const hdrRect = headerEl.getBoundingClientRect();
            headerHeight = hdrRect.height || 0;
          }
        } catch (e) {
          headerHeight = 0;
        }

        // Фоллбек на разумное значение, если измерение не удалось
        // Используем высоту строки как разумную оценку высоты заголовка,
        // чтобы корректно умещать целое число строк без обрезания.
        if (!headerHeight || headerHeight < 24) headerHeight = rowHeight;

        // If there are very few rows, adapt pageSize to actual rows so container won't have big empty space
        const totalRowsFixed = Number(props.totalCount) || 0;
        if (totalRowsFixed > 0 && totalRowsFixed < 5) {
          pageSize.value = totalRowsFixed;
          return;
        }

        const availableHeight = props.fixedHeight - headerHeight;

        // Если доступная высота недостаточна, используем минимальное значение
        if (availableHeight <= headerHeight || availableHeight < rowHeight) {
          pageSize.value = 1;
          return;
        }

        // Более точный расчет высоты строки: padding + line-height + border
        const oldPageSize = pageSize.value;
        pageSize.value = Math.floor(availableHeight / rowHeight);
        // Для фиксированной высоты не форсируем минимум 5, чтобы не обрезать последнюю строку
        if (pageSize.value < 1) pageSize.value = 1;
        if (pageSize.value > 50) pageSize.value = 50;

        // Проверяем доступность dataComp перед использованием
        if (!dataComp.value || !Array.isArray(dataComp.value)) {
          return;
        }

        // После изменения pageSize нужно скорректировать start, если он стал слишком большим
        const maxStart = Math.max(0, props.totalCount - pageSize.value);
        if (start.value > maxStart) {
          start.value = maxStart;
        }
      } else {
        // Если fixedHeight не передан, рассчитываем pageSize, вычитая реальную высоту заголовка
        try {
          // Измеряем высоту thead, чтобы не переоценивать видимые строки
          let headerHeight = 0;
          try {
            const cardElement = tableCardRef.value?.$el || tableCardRef.value;
            const headerEl =
              cardElement?.querySelector && cardElement.querySelector("thead");
            if (headerEl) {
              const hdrRect = headerEl.getBoundingClientRect();
              headerHeight = hdrRect.height || 0;
            }
          } catch (e) {
            headerHeight = 0;
          }
          if (!headerHeight || headerHeight < 24) headerHeight = rowHeight; // фоллбек

          // Доступная высота под строки = высота окна минус отступы и высота заголовка
          const available = Math.max(
            0,
            windowHeight.value - props.heightOffset - headerHeight,
          );
          const rows = Math.floor(available / rowHeight);
          const effectiveRows = Math.max(1, rows);

          let newPageSize = effectiveRows;
          if (newPageSize < 3) newPageSize = 3;
          // On large screens prefer a larger minimum visible rows to fill space
          if (windowHeight.value > 700 && newPageSize < 12) newPageSize = 12;
          if (newPageSize > 50) newPageSize = 50;

          const oldPageSize = pageSize.value;
          pageSize.value = newPageSize;

          // После изменения pageSize нужно скорректировать start и scrollTop,
          // чтобы при изменении размера окна и нахождении у низа таблица не "растягивала" строки.
          // Рассчитываем новый максимально допустимый scrollTop и корректируем текущий.
          const newMaxScrollTop = Math.max(
            0,
            totalTableHeight.value - pageSize.value * rowHeight,
          );
          if (scrollTop.value > newMaxScrollTop) {
            scrollTop.value = newMaxScrollTop;
          }

          // Корректируем start на основе (возможно) обновлённого scrollTop
          const newStartFromScroll = Math.floor(scrollTop.value / rowHeight);
          start.value = Math.min(
            start.value,
            Math.max(0, props.totalCount - pageSize.value),
          );
          // Также убеждаемся, что start синхронизирован с scrollTop
          if (start.value !== newStartFromScroll) {
            start.value = newStartFromScroll;
          }

          // Обновляем позицию ползунка
          nextTick(() => {
            updateHandlePosition();
          });
        } catch (e) {
          // ignore
        }
      }
    };

    updatePageSize();

    // Запускаем синхронизацию при изменении размера окна
    window.addEventListener("resize", syncHeaderAndBodyColumns);
    window.addEventListener("resize", updatePageSize);

    // Add virtual scroll event listeners (support pointer events)
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("pointermove", handleMouseMove);
    window.addEventListener("mouseup", stopHandle);
    window.addEventListener("pointerup", stopHandle);
    // Ensure dragend clears any leftover state even if drag events are not fired on elements
    document.addEventListener("dragend", onDragEnd);

    // Запускаем синхронизацию после загрузки данных
    watch(
      () => props.data,
      () => {
        setTimeout(syncHeaderAndBodyColumns, 100);
        updatePageSize();
        // Only reset to top on initial window (windowStart === 0) or when no data
        try {
          if (props.windowStart === 0 || props.totalCount === 0) {
            start.value = 0;
          }
        } catch (e) {
          start.value = 0;
        }
        updateHandlePosition();
      },
      { deep: true },
    );

    // Следим за изменениями pageSize и количества данных для обновления позиции ползунка
    watch([pageSize, () => dataComp.value?.length || 0], () => {
      // Проверяем доступность dataComp
      if (!dataComp.value || !Array.isArray(dataComp.value)) {
        return;
      }

      // Если скроллинг больше не нужен, сбрасываем позицию
      if (!needsScrolling.value) {
        start.value = 0;
        htop.value = 0;
      } else {
        // Иначе корректируем позицию start
        const maxStart = Math.max(0, props.totalCount - pageSize.value);

        if (start.value > maxStart) {
          start.value = maxStart;
        }
        updateHandlePosition();
      }
    });

    // Отслеживаем изменения в start для отладки виртуального скроллинга
    watch(
      () => start.value,
      (newStart, oldStart) => {
        // Track start changes for debugging
      },
    );

    // Отслеживаем изменения в scrollTop для синхронизации с start
    watch(
      () => scrollTop.value,
      (newScrollTop) => {
        const newStart = Math.floor(newScrollTop / rowHeight);
        if (newStart !== start.value) {
          start.value = newStart;
        }
      },
    );

    // Следим за количеством данных и запрашиваем дополнительные, если их меньше 50

    // Отслеживаем изменения в visiblePage для отладки виртуального скроллинга
    watch(
      () => visiblePage.value,
      (newPage, oldPage) => {},
      { deep: true },
    );

    // Запускаем синхронизацию сразу после монтирования

    // Listen for project data changes
    const unwatch = project.$subscribe((mutation, state) => {
      if (mutation.type === "direct" && mutation.storeId === "project") {
        updateColumnWidthsFromStore();
      }
    });

    // Сохраняем ссылку на функцию для удаления в onUnmounted
    window.updateWindowHeight = updateWindowHeight;

    // Обеспечиваем правильный расчет pageSize после монтирования
    // Просто вызываем updatePageSize и загрузку данных сразу после await nextTick
    try {
      await nextTick();
      updatePageSize();
      // Если проект уже выбран, загружаем keywords
      if (project.currentProjectId) {
        props.loadData(project.currentProjectId);
      }
    } catch (error) {
      // Ignore errors
    }
  } catch (error) {
    // Ignore errors
  }
});

onUnmounted(() => {
  document.removeEventListener("mousemove", handleResize);
  document.removeEventListener("mouseup", stopResize);
  // Очищаем обработчик синхронизации при размонтировании компонента
  window.removeEventListener("resize", syncHeaderAndBodyColumns);
  // Remove virtual scroll event listeners
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseup", stopHandle);
  document.removeEventListener("dragend", onDragEnd);
  window.removeEventListener("pointermove", handleMouseMove);
  window.removeEventListener("pointerup", stopHandle);
  // Очищаем обработчик изменения высоты окна
  if (window.updateWindowHeight) {
    window.removeEventListener("resize", window.updateWindowHeight);
  }
});

// Следим за изменениями проекта для загрузки keywords
watch(
  () => project.currentProjectId,
  (newProjectId, oldProjectId) => {
    if (newProjectId) {
      props.loadData(newProjectId);
    }
  },
);

// Sync internal windowStart with prop from parent store so component
// reflects server-side window changes (e.g. when keywords store sets windowStart)
watch(
  () => props.windowStart,
  (newVal) => {
    try {
      if (typeof newVal === "number") {
        // If we already have data for this window, sync immediately.
        // Otherwise, wait until props.data is populated to avoid briefly
        // showing an empty view (store may set props.windowStart before
        // props.data arrives).
        if (props.data && Array.isArray(props.data) && props.data.length > 0) {
          windowStart.value = newVal;
          scheduleLastWindowStart(newVal);
          waitingForWindowData.value = false;
          nextTick(() => updateHandlePosition());
        } else {
          // Mark that we're awaiting data for this windowStart and
          // avoid overriding windowStart.value yet.
          waitingForWindowData.value = true;
          scheduleLastWindowStart(newVal);
        }
      }
    } catch (e) {}
  },
);

// Add logging for debugging scrollTop, windowStart, and newWindowStart
watch(
  [scrollTop, () => windowStart.value],
  ([newScrollTop, newWindowStart]) => {
    // debug: scrollTop/windowStart change (console.log removed)
  },
);

// Virtual scroll methods
function mousewheel(e) {
  if (!needsScrolling.value) return;

  // Throttling: ограничиваем частоту вызовов до 16ms (примерно 60fps)
  const now = Date.now();
  if (now - lastScrollTime.value < 16) return;
  lastScrollTime.value = now;

  // Уменьшаем чувствительность скроллинга для более стабильного поведения
  const scrollSpeed = 0.8; // Уменьшено для лучшего контроля
  const deltaY = e.deltaY * scrollSpeed;

  const oldScrollTop = scrollTop.value;
  scrollTop.value += deltaY;

  // Ограничиваем scrollTop в допустимых пределах
  const maxScrollTop = Math.max(
    0,
    totalTableHeight.value - pageSize.value * rowHeight,
  );

  if (scrollTop.value < 0) scrollTop.value = 0;
  if (scrollTop.value > maxScrollTop) {
    scrollTop.value = maxScrollTop;
  }

  // Snap scrollTop to whole-row multiples для избежания partial-row rendering
  scrollTop.value = Math.floor(scrollTop.value / rowHeight) * rowHeight;
  start.value = Math.floor(scrollTop.value / rowHeight);

  // Ограничиваем start в допустимых пределах
  const maxStart = Math.max(0, props.totalCount - pageSize.value);
  if (start.value > maxStart) start.value = maxStart;

  // debug: ScrollTop updated (console.log removed)

  // Delegate incremental prefetch logic to the central handler which uses
  // up-to-date props.windowStart/props.data (to avoid inconsistencies).
  // This ensures the trigger is based on the current visible position.
  maybeRequestWindowByScroll();

  // Принудительно обновляем компонент после изменения scrollTop
  nextTick(() => {
    updateHandlePosition();
  });
}

// Функция-заглушка для клика по скроллбару (предотвращает ошибки)
function handleScrollbarClick(e) {
  // Предотвращаем всплытие события, чтобы не вызвать нежелательные действия
  e.stopPropagation();
}

// Track drag start state for stable dragging
const dragStartY = ref(0);
const handleStartTop = ref(0);

function startHandle(e) {
  if (handleDragging.value) return;
  handleDragging.value = true;
  try {
    // Prefer pointer event coordinates, fallback to mouse/touch
    dragStartY.value =
      (e && (typeof e.pageY === "number" ? e.pageY : e.clientY || 0)) || 0;
    handleStartTop.value = htop.value || 0;
    e && e.preventDefault && e.preventDefault();
    try {
      // disable text selection while dragging
      document.body.style.userSelect = "none";
      if (
        e &&
        e.pointerId &&
        e.target &&
        typeof e.target.setPointerCapture === "function"
      ) {
        try {
          e.target.setPointerCapture(e.pointerId);
        } catch (er) {}
      }
    } catch (er) {}
  } catch (err) {
    dragStartY.value = 0;
    handleStartTop.value = htop.value || 0;
  }
  // Ensure we listen to move/up events while dragging (attach on start for reliability)
  try {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("pointermove", handleMouseMove);
    window.addEventListener("mouseup", stopHandle);
    window.addEventListener("pointerup", stopHandle);
  } catch (e) {}
}

function stopHandle() {
  if (!handleDragging.value) return;
  handleDragging.value = false;
  try {
    document.body.style.userSelect = "";
  } catch (e) {}
  try {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("pointermove", handleMouseMove);
    window.removeEventListener("mouseup", stopHandle);
    window.removeEventListener("pointerup", stopHandle);
  } catch (e) {}
}

function handleMouseMove(e) {
  if (!handleDragging.value || !needsScrolling.value) return;

  // Stable absolute delta from drag start instead of movementY to avoid jumps
  const deltaY =
    (e && typeof e.pageY === "number" ? e.pageY : 0) - dragStartY.value;
  let top = handleStartTop.value + deltaY;
  const scrollerHeight = scroller.value.clientHeight - 10;
  const handleHeightPx = parseInt(handleHeight.value);
  const maxTop = scrollerHeight - handleHeightPx;

  if (top < 0) top = 0;
  else if (top > maxTop) top = maxTop;

  htop.value = top;

  // Рассчитываем scrollTop на основе позиции ползунка
  const maxScrollTop = Math.max(
    0,
    totalTableHeight.value - pageSize.value * rowHeight,
  );
  const availableHeight = Math.max(1, scrollerHeight - handleHeightPx); // Избегаем деления на 0

  if (maxScrollTop > 0) {
    // Вычисляем и затем привязываем scrollTop к целому количеству строк
    const proportion = htop.value / availableHeight;
    const raw = Math.round(proportion * maxScrollTop);
    scrollTop.value = Math.round(raw / rowHeight) * rowHeight;
  } else {
    scrollTop.value = 0;
  }

  // Обновляем start на основе нового scrollTop
  start.value = Math.floor(scrollTop.value / rowHeight);
  const maxStart = Math.max(0, props.totalCount - pageSize.value);
  if (start.value > maxStart) start.value = maxStart;

  // Trigger data window loading when dragging near boundaries
  maybeRequestWindowByScroll();
}

function updateHandlePosition() {
  // Avoid fighting with manual drag updates
  if (handleDragging.value) return;
  if (!scroller.value || !needsScrolling.value) {
    htop.value = 0;
    return;
  }

  const scrollerHeight = scroller.value.clientHeight - 10; // Высота скроллера минус отступы
  const maxScrollTop = Math.max(
    0,
    totalTableHeight.value - pageSize.value * rowHeight,
  );

  if (maxScrollTop === 0) {
    htop.value = 0;
  } else {
    // Проверяем, что handleHeight.value существует
    if (!handleHeight.value) {
      console.warn("updateHandlePosition: handleHeight.value is not available");
      htop.value = 0;
      return;
    }

    // Рассчитываем позицию ползунка с учетом его высоты
    const handleHeightPx = parseInt(handleHeight.value);
    const availableHeight = scrollerHeight - handleHeightPx;
    htop.value = Math.floor(
      (availableHeight / maxScrollTop) * scrollTop.value + 0.5,
    );
  }
}

// Select text inside a cell on double-click. Overrides the global user-select:none
// set on the virtual scroll container. If the double-click target is an interactive
// control (icon/button/input) we ignore selection to avoid interfering.
function selectCellText(e) {
  try {
    const target = e && (e.currentTarget || e.target);
    if (!target) return;

    const tag =
      (e.target && e.target.tagName && e.target.tagName.toLowerCase()) || "";
    if (tag === "input" || tag === "textarea" || tag === "button") return;
    // If an Element Plus icon was clicked, avoid selecting icons
    if (e.target && e.target.closest && e.target.closest(".el-icon")) return;

    const sel = window.getSelection ? window.getSelection() : null;
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(target);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (err) {
    // ignore
  }
}
</script>

<style scoped>
/* Стили для столбца с номерами строк */
.row-number-header {
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color);
  text-align: center;
  font-weight: 600;
  position: sticky;
  left: 0;
  z-index: 10;
  padding-left: 0 !important;
  padding-right: 0 !important;
}

.row-number-cell {
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color);
  text-align: center;
  font-weight: 500;
  position: sticky;
  left: 0;
  z-index: 5;
  padding-left: 0 !important;
  padding-right: 0 !important;
}

.row-number-cell .cell-content {
  text-align: center;
  justify-content: center;
}

/* Тени для фиксированных столбцов в теле таблицы (как в шапке) */
.table-cell.fixed-column {
  position: sticky;
  background: var(--el-bg-color);
  z-index: 5;
}

/* Первый фиксированный столбец (номер строки) */
.table-cell.fixed-column:nth-child(1) {
  left: 0;
  z-index: 12;
  box-shadow: 2px 0 6px rgba(0, 0, 0, 0.1);
}

/* Второй фиксированный столбец (обычно 2-я колонка) */
.table-cell.fixed-column:nth-child(2) {
  left: var(--second-column-left, 60px);
  z-index: 11;
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.08);
}

/* Общая лёгкая тень для остальных фиксированных столбцов */
.table-cell.fixed-column:not(:nth-child(1)):not(:nth-child(2)) {
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.06);
}

/* Тёмная тема: скорректировать тени */
html.dark .table-cell.fixed-column {
  box-shadow: 2px 0 6px rgba(0, 0, 0, 0.28);
  background: var(--el-bg-color) !important;
}
html.dark .table-cell.fixed-column:nth-child(1) {
  box-shadow: 2px 0 6px rgba(0, 0, 0, 0.32);
}

.filters-container {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.filter-input {
  flex: 1;
}

.table-cart {
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.table-container {
  position: relative;
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: 0px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* Use computed table height when provided (via --table-height), otherwise fill parent */
  height: var(--table-height, 100%);
  min-height: 200px;
}

/* Контейнер шапки таблицы */
.table-header-container {
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 20; /* Больше чем у фиксированного столбца */
  background-color: var(--el-bg-color);
  overflow: hidden; /* Шапка не должна скроллиться */
  height: auto; /* Высота по содержимому */
  min-height: 50px; /* Минимальная высота шапки */
  display: block; /* Гарантируем корректное отображение */
  margin-bottom: 0; /* Убираем отступ снизу */
  padding-bottom: 0; /* Убираем отступ снизу */
  border-bottom: 1px solid var(--el-border-color);
}

/* Контейнер шапки таблицы - таблица внутри */
.table-header-container .custom-table {
  display: table;
  width: 100%;
  table-layout: fixed;
  margin-bottom: 0; /* Убираем отступ снизу */
}

/* Контейнер тела таблицы */
.table-body-container {
  width: 100%;
  flex: 1;
  overflow-y: auto; /* Вертикальный скролл для данных */
  position: relative;
  /* Стили для скроллбара */
  scrollbar-width: thin; /* Firefox */
  scrollbar-color: var(--el-border-color-lighter) transparent; /* Firefox */
  /* Улучшаем фиксацию элементов при прокрутке */
  will-change: transform; /* Подсказка браузеру для оптимизации */
  margin-top: 0; /* Убираем отступ сверху */
  padding-top: 0; /* Убираем отступ сверху */
  scroll-margin-top: 80px; /* высота вашей шапки */
}

/* Контейнер тела таблицы - таблица внутри */
.table-body-container .custom-table {
  display: table;
  width: 100%;
  table-layout: fixed;
}

.cell-center {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

/* Стили для Firefox в темной теме */
html.dark .table-container {
  scrollbar-color: var(--el-border-color-darker) var(--el-bg-color); /* Firefox темная тема */
}

/* Visual indicator when a header is a drop target during drag-and-drop */
.drag-over {
  /* Make header highlight more transparent so the vertical insert indicator is more visible */
  background: linear-gradient(
    90deg,
    rgba(0, 123, 255, 0.03),
    rgba(0, 123, 255, 0.008)
  );
  box-shadow: inset 0 0 0 2px rgba(0, 123, 255, 0.06);
  transition:
    background-color 120ms ease,
    box-shadow 120ms ease;
}

.sortable-header[draggable="true"] {
  cursor: move;
}

/* Make cursor on hover for draggable headers match fixed-column hover (pointer) */
.sortable-header[draggable="true"]:hover {
  cursor: pointer;
}

/* Show grabbing cursor only while the header is pressed (active) */
th[draggable="true"]:active,
th[draggable="true"]:active .header-content {
  cursor: grabbing;
}

/* Thin vertical insert indicator shown between columns during drag */
.insert-line {
  position: absolute;
  top: 12%;
  height: 76%;
  width: 3px;
  background: var(--el-color-primary);
  opacity: 0.95;
  z-index: 220;
  border-radius: 2px;
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}
.insert-left {
  left: 0px;
  transform: translateX(-1px);
}
.insert-right {
  right: 0px;
  transform: translateX(1px);
}

/* Стили для скроллбара WebKit (Chrome, Safari, Edge) */
.table-body-container::-webkit-scrollbar {
  height: 8px;
  width: 8px;
  margin: 2px;
}

.table-body-container::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

.table-body-container::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-lighter);
  border-radius: 4px;
  border: 1px solid transparent;
  background-clip: padding-box;
}

.table-body-container::-webkit-scrollbar-thumb:hover {
  background-color: var(--el-border-color);
}

/* Темная тема для скроллбара */
html.dark .table-body-container::-webkit-scrollbar-track {
  background: var(--el-bg-color); /* Темный фон для трека скроллбара */
  border-radius: 4px;
}

html.dark .table-body-container::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-darker);
  border: 1px solid transparent;
  background-clip: padding-box;
}

html.dark .table-body-container::-webkit-scrollbar-thumb:hover {
  background-color: var(--el-text-color-secondary);
}

/* Стиль для угла пересечения скроллбаров */
.table-body-container::-webkit-scrollbar-corner {
  background: transparent; /* По умолчанию прозрачный */
}

/* Темная тема для угла скроллбаров */
html.dark .table-body-container::-webkit-scrollbar-corner {
  background: var(--el-bg-color); /* Темный фон для угла скроллбаров */
}

.custom-table {
  width: 100%;
  min-width: 100%; /* Минимальная ширина таблицы */
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
  background: var(--el-bg-color);
  table-layout: fixed; /* Фиксированная ширина столбцов для предотвращения расширения */
  position: relative; /* Необходимо для корректного позиционирования фиксированных элементов */
  /* Улучшаем контраст границ в светлой теме */
  border: none;
  margin: 0; /* Убираем отступы */
  height: auto; /* Не растягиваем таблицу на всю высоту контейнера — предотвращаем растягивание строк */
}

.custom-table tbody {
  margin-top: 0; /* Убираем отступы */
  border-top: 0; /* Убираем отступы */
  position: relative; /* Необходимо для корректного позиционирования loading overlay */
}

/* Ограничиваем loading overlay областью таблицы и центрируем по вертикали/горизонтали */
.custom-table .el-loading-mask {
  position: absolute;
  /* Position the overlay below the table header so spinner is centered in the body area */
  top: var(--header-height, 35px);
  left: 0;
  right: 0;
  /* Height equals total table height minus header */
  height: calc(var(--table-height, 100%) - var(--header-height, 35px));
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.8);
}

/* Темная тема для loading overlay */
html.dark .custom-table tbody .el-loading-mask {
  background-color: rgba(0, 0, 0, 0.8);
}

/* Темная тема для заголовков таблицы */
html.dark .custom-table thead {
  background: var(--el-bg-color);
}

html.dark .custom-table th {
  border-right: 1px solid var(--el-border-color-darker);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box; /* Учитываем padding и border в ширине */
}

html.dark .custom-table th:last-child {
  border-right: none !important;
}

html.dark .custom-table td {
  border-bottom: 1px solid var(--el-border-color-darker);
  border-right: 1px solid var(--el-border-color-darker);
}

.custom-table thead {
  background: var(--el-bg-color) !important;
  z-index: 10; /* Увеличиваем z-index для шапки */
  border-bottom: 1px solid var(--el-border-color);
  display: table-header-group; /* Явно задаем как отображать заголовок */
  height: 35px; /* Фиксированная высота шапки */
  vertical-align: middle; /* Выравнивание по вертикали */
}

.custom-table thead th {
  position: sticky;
  top: 0; /* Фиксируем шапку сверху */
  z-index: 10; /* Увеличиваем z-index для корректного наложения */
  background-color: var(--el-bg-color); /* Фон для шапки */
  border-bottom: 1px solid var(--el-border-color); /* Граница снизу */
}

.custom-table th {
  padding: 4px; /* Чуть меньше padding для узких столбцов */
  text-align: left;
  font-weight: 600;
  white-space: nowrap; /* Запрещаем перенос текста */
  overflow: hidden;
  text-overflow: ellipsis;
  box-sizing: border-box; /* Учитываем padding и border в ширине */
  border-right: 1px solid var(--el-border-color); /* Добавляем правую границу (light theme uses same color as fixed columns) */
  position: relative; /* Ensure absolute children (resizer) are positioned inside the header cell */
}

.column-resizer {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  right: 0;
  width: 8px;
  height: 28px; /* ограничиваем высоту только шапкой */
  background-color: transparent;
  cursor: col-resize;
  z-index: 30; /* чуть выше шапки */
  transition: background-color 0.2s;
}

.column-resizer:hover {
  /* Use a subtle blue tint to indicate active resize area (Element Plus primary) */
  background-color: var(--el-color-primary-light-5);
}

.column-resizer:active {
  background-color: var(--el-color-primary-light-5);
}

/* Add a visual indicator for dark theme */
html.dark .column-resizer:hover {
  background-color: var(--el-color-primary-light-5);
}

html.dark .column-resizer:active {
  background-color: var(--el-color-primary-light-5);
}

.custom-table th:last-child {
  border-right: none !important;
}

.sortable-header {
  position: relative; /* Ensure absolute children (resizer) are positioned inside the header cell */
  cursor: pointer;
  transition: background-color 0.2s;
}

.sortable-header:hover {
  background-color: #f5f5f5 !important;
}

html.dark .sortable-header:hover {
  background-color: var(--el-fill-color-darker) !important;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.center-header {
  justify-content: center !important;
}

/* Make row-number header content tightly centered */
.row-number-header .header-content {
  justify-content: center;
  gap: 0;
}

.sort-indicator {
  display: flex;
  flex-direction: column;
  margin-left: 4px;
}

.sort-arrow {
  font-size: 10px;
  color: var(--el-text-color-placeholder);
}

.sort-arrow.sort-asc::before {
  content: "▲";
  color: var(--el-color-primary);
}

.sort-arrow.sort-desc::before {
  content: "▼";
  color: var(--el-color-primary);
}

.sort-arrow:not(.sort-asc):not(.sort-desc)::before {
  content: "⬍";
}

.custom-table td {
  padding: 4px 10px; /* Верх/низ 4px, лев/прав 5px */
  line-height: 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  border-right: 1px solid var(--el-border-color);
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box; /* Учитываем padding и border в ширине */
  /* Гарантируем, что высота строки не меньше 35px */
  height: 35px; /* для таблиц height на ячейке работает как минимум */
  vertical-align: middle;
}

/* Category inline layout and similarity tag */
.category-info-inline {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}
.category-info-inline .category-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1 1 auto;
}
.similarity-tag {
  flex: 0 0 auto;
  background: var(--el-color-primary-light-5, #eef6ff);
  color: var(--el-color-primary, #409eff);
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

/* Темная тема для ячеек таблицы */
html.dark .custom-table td {
  border-bottom: 1px solid var(--el-border-color-darker);
  border-right: 1px solid var(--el-border-color-darker);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box; /* Учитываем padding и border в ширине */
  /* Гарантируем, что высота строки не меньше 35px */
  height: 35px;
  vertical-align: middle;
}

.custom-table td:last-child {
  border-right: none !important;
}

/* Header cells padding: top/bottom 4px, left/right 5px to match data cells */
.custom-table thead th {
  padding: 4px 5px;
}

/* Показываем нижнюю границу у последней строки для визуального завершения таблицы */
.custom-table tbody tr:last-child td {
  border-bottom: 1px solid var(--el-border-color) !important;
}

/* Темная тема: нижняя граница у последней строки */
html.dark .custom-table tbody tr:last-child td {
  border-bottom: 1px solid var(--el-border-color-darker) !important;
}

/* Темная тема: убираем правую границу у последнего столбца */
html.dark .custom-table td:last-child {
  border-right: none !important;
}

/* Стили для нечетных и четных строк с высокой специфичностью */
.custom-table tbody tr.odd-row {
  background-color: var(--el-bg-color) !important;
}

.custom-table tbody tr.even-row {
  background-color: #f7f7f7 !important; /* light theme even row */
}

/* Темная тема для чередующихся строк */
html.dark .custom-table tbody tr.odd-row {
  background-color: var(--el-bg-color) !important;
}

html.dark .custom-table tbody tr.even-row {
  background-color: var(--el-fill-color) !important;
}

/* Стили для наведения с увеличенной специфичностью */
.custom-table tbody tr.odd-row:hover,
.custom-table tbody tr.even-row:hover {
  background: #f0f0f0 !important; /* light theme hover restored */
}

html.dark .custom-table tbody tr.odd-row:hover,
html.dark .custom-table tbody tr.even-row:hover {
  background: #2d3748 !important; /* dark theme hover */
}

/* Ховер для фиксированной колонки */
.custom-table tbody tr:hover .fixed-column {
  background-color: rgba(
    0,
    0,
    0,
    0.03
  ) !important; /* Точно такой же как у обычных ячеек */
}

.table-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 0; /* Позволяет ячейке сжиматься до минимума при table-layout: fixed */
}

/* Стили для фиксированного столбца */
.fixed-column {
  position: sticky;
  left: 0;
  z-index: 5;
  background-color: var(
    --el-bg-color
  ) !important; /* Устанавливаем непрозрачный фон */
  border-right: 1px solid var(--el-border-color);
  backdrop-filter: none !important; /* Отключаем эффекты прозрачности */
  opacity: 1 !important; /* Максимальная непрозрачность */
  /* Дополнительные свойства для полной непрозрачности */
  -webkit-backdrop-filter: none !important;
  background-blend-mode: normal !important;
  mix-blend-mode: normal !important;
}

/* Первый фиксированный столбец */
.fixed-column:nth-child(1) {
  left: 0;
  z-index: 10 !important; /* Более высокий z-index для первого столбца */
}

/* Второй фиксированный столбец */
.fixed-column:nth-child(2) {
  left: var(
    --second-column-left,
    60px
  ); /* Используем CSS переменную с fallback на 60px */
  z-index: 10 !important; /* Высокий z-index для второго столбца */
}

/* Третий и последующие столбцы не фиксированные */
.fixed-column:nth-child(n + 3) {
  position: static;
  left: auto;
}

/* Стили для заголовка третьего и последующих столбцов */
.custom-table thead th.fixed-column:nth-child(n + 3) {
  position: static;
  left: auto;
}

/* Дополнительные стили для четных и нечетных строк с фиксированным столбцом */
.custom-table tbody tr.odd-row .fixed-column {
  /* Фиксированная колонка использует тот же фон, что и строка */
  background-color: inherit !important;
  border-right: 1px solid var(--el-border-color);
}

.custom-table tbody tr.even-row .fixed-column {
  /* Тот же фон, что и строка */
  background-color: inherit !important;
  border-right: 1px solid var(--el-border-color);
}

/* Темная тема для фиксированного столбца */
html.dark .custom-table tbody tr.odd-row .fixed-column {
  background-color: inherit !important;
  border-right: 1px solid var(--el-border-color-darker);
}

html.dark .custom-table tbody tr.even-row .fixed-column {
  background-color: inherit !important;
  border-right: 1px solid var(--el-border-color-darker);
}

/* Стили для фиксированного заголовка */
.custom-table thead .fixed-column {
  background-color: var(--el-bg-color) !important;
  z-index: 15 !important; /* Выше, чем у шапки и обычных фиксированных ячеек */
  position: sticky;
  left: 0; /* Только горизонтальная фиксация для заголовка */
  border-right: 1px solid var(--el-border-color);
  border-bottom: 1px solid var(--el-border-color);
  opacity: 1 !important;
  /* Дополнительные свойства для полной непрозрачности */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background-blend-mode: normal !important;
  mix-blend-mode: normal !important;
  /* box-shadow: 2px 0 5px rgba(0, 0, 0, 0.1); Добавляем тень для визуального разделения */
}

/* Второй фиксированный столбец в заголовке */
.custom-table thead th.fixed-column:nth-child(2) {
  position: sticky !important;
  left: 60px; /* Ширина первого столбца (номера строк) */
  z-index: 20 !important; /* Высокий z-index для второго столбца */
  background-color: var(--el-bg-color) !important;
  border-right: 1px solid var(--el-border-color);
  border-bottom: 1px solid var(--el-border-color);
  opacity: 1 !important;
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.1);
  /* Дополнительные свойства для полной непрозрачности */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background-blend-mode: normal !important;
  mix-blend-mode: normal !important;
}

/* Первый фиксированный столбец в заголовке */
.custom-table thead th.fixed-column:nth-child(1) {
  position: sticky !important;
  left: 0;
  z-index: 25 !important; /* Самый высокий z-index для первого столбца */
  background-color: var(--el-bg-color) !important;
  border-right: 1px solid var(--el-border-color);
  border-bottom: 1px solid var(--el-border-color);
  opacity: 1 !important;
  /* Дополнительные свойства для полной непрозрачности */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background-blend-mode: normal !important;
  mix-blend-mode: normal !important;
}

/* Второй фиксированный столбец в заголовке */
.custom-table thead th.fixed-column:nth-child(2) {
  left: var(
    --second-column-left,
    60px
  ); /* Используем CSS переменную с fallback на 60px */
}

/* Третий и последующие столбцы в заголовке не фиксированные */
.custom-table thead th.fixed-column:nth-child(n + 3) {
  position: static;
  left: auto;
}

html.dark .custom-table thead .fixed-column {
  background-color: var(--el-bg-color) !important;
  z-index: 15 !important;
  border-right: 1px solid var(--el-border-color-darker);
  border-bottom: 1px solid var(--el-border-color-darker);
  opacity: 1 !important;
  /* Дополнительное визуальное выделение для темной темы */
  position: sticky;
  left: 0; /* Только горизонтальная фиксация */
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.3); /* Более темная тень для темной темы */
  /* Дополнительные свойства для полной непрозрачности */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background-blend-mode: normal !important;
  mix-blend-mode: normal !important;
}

/* Специальные z-index для первого и второго столбцов в темной теме */
html.dark .custom-table thead th.fixed-column:nth-child(1) {
  position: sticky !important;
  left: 0 !important;
  z-index: 25 !important;
  background-color: var(--el-bg-color) !important;
  border-right: 1px solid var(--el-border-color-darker);
  border-bottom: 1px solid var(--el-border-color-darker);
  opacity: 1 !important;
  /* Дополнительные свойства для полной непрозрачности */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background-blend-mode: normal !important;
  mix-blend-mode: normal !important;
}

html.dark .custom-table thead th.fixed-column:nth-child(2) {
  position: sticky !important;
  left: var(--second-column-left, 60px) !important;
  z-index: 20 !important;
  background-color: var(--el-bg-color) !important;
  border-right: 1px solid var(--el-border-color-darker);
  border-bottom: 1px solid var(--el-border-color-darker);
  opacity: 1 !important;
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.3);
  /* Дополнительные свойства для полной непрозрачности */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background-blend-mode: normal !important;
  mix-blend-mode: normal !important;
}

/* Hover для фиксированного столбца в шапке */
.custom-table thead .fixed-column:hover {
  background-color: #f5f5f5 !important;
}

html.dark .custom-table thead .fixed-column:hover {
  background-color: #2a2a2a !important;
}

/* Темная тема для столбца с номерами строк */
html.dark .row-number-header {
  background: var(--el-bg-color);
  border-right-color: var(--el-border-color-darker);
  color: var(--el-text-color-primary);
}

html.dark .row-number-cell {
  background: var(--el-bg-color);
  border-right-color: var(--el-border-color-darker);
  color: var(--el-text-color-regular);
}

/* Стили для ховера с фиксированным столбцом */
.custom-table tbody tr:hover .fixed-column {
  /* Hover наследует фон строки */
  background: inherit !important;
}

html.dark .custom-table tbody tr:hover .fixed-column {
  background: inherit !important;
}

.cell-content {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  /* Allow text selection inside cells even though the virtual scroll container
     disables selection globally to improve drag behaviors */
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
}

/* Центрируем контент для колонок с действиями */
.cell-content.center-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.cell-content.center-cell .el-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
}

/* Стили для строки "Нет данных" в таблице */
.no-data-row {
  background-color: var(--el-bg-color);
}

.no-data-cell {
  text-align: center;
  padding: 40px 20px;
  border: none;
  background-color: var(--el-bg-color);
}

.no-data-cell .el-empty {
  margin: 0;
}

/* Убрана жесткая ширина для URL - теперь обрезка происходит по ширине столбца через CSS */
/* .url-cell .cell-content {
    max-width: 400px;
  } */

.no-data {
  padding: 40px;
  text-align: center;
}

/* Контейнер виртуальной прокрутки */
.virtual-scroll-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow-x: auto; /* Горизонтальный скролл для широких таблиц */
  overflow-y: hidden; /* Вертикальный скролл через виртуальную прокрутку */
  user-select: none;
}

/* Ползунок для виртуальной прокрутки */
.scroller {
  position: absolute;
  top: 58px;
  bottom: 14px;
  right: 8px;
  width: 4px;
  background: #eee;
  border-radius: 2px;
}

.handle {
  position: absolute;
  width: 10px;
  height: 8px;
  top: 0;
  border: 1px solid #ccc;
  border-radius: 3px;
  left: -4px;
  background: #fff;
  cursor: ns-resize;
}

.handle:hover {
  background: #f0f0f0;
}

.handle:active {
  background: #f0f0f0;
}

/* Контейнер вертикального ползунка */
.vertical-scroller-container {
  position: absolute;
  top: 35px; /* уменьшен отступ от верха таблицы */
  bottom: 2px;
  right: 1px;
  width: 12px;
  pointer-events: auto; /* enable pointer events so handle receives mousedown */
  z-index: 10;
}

.vertical-scroller {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 12px;
  background: var(--el-bg-color);
  border-radius: 6px;
  /* border: 1px solid var(--el-border-color-lighter); */
  pointer-events: auto;
}

.vertical-handle {
  position: absolute;
  width: 8px;
  /* height: 20px; - убрана фиксированная высота, теперь динамическая */
  top: 0;
  left: 2px;
  border-radius: 4px;
  background: var(--el-border-color-lighter);
  cursor: ns-resize;
  transition: background-color 0.2s;
  touch-action: none;
}

.vertical-handle:hover {
  background: var(--el-border-color);
}

.vertical-handle:active {
  background: var(--el-border-color);
}

/* Темная тема для вертикального ползунка */
html.dark .vertical-scroller {
  background: var(--el-bg-color);
  border-color: var(--el-border-color-darker);
}

html.dark .vertical-handle {
  background: var(--el-border-color-darker);
}

html.dark .vertical-handle:hover {
  background: var(--el-text-color-secondary);
}

html.dark .vertical-handle:active {
  background: var(--el-text-color-secondary);
}

/* Стили для горизонтального скроллбара виртуального контейнера */
.virtual-scroll-container::-webkit-scrollbar {
  height: 8px;
  width: 8px;
}

.virtual-scroll-container::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

.virtual-scroll-container::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-lighter);
  border-radius: 4px;
  border: 1px solid transparent;
  background-clip: padding-box;
}

.virtual-scroll-container::-webkit-scrollbar-thumb:hover {
  background-color: var(--el-border-color);
}

/* Темная тема для горизонтального скроллбара */
html.dark .virtual-scroll-container::-webkit-scrollbar-track {
  background: var(--el-bg-color);
  border-radius: 4px;
}

html.dark .virtual-scroll-container::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-darker);
  border: 1px solid transparent;
  background-clip: padding-box;
}

html.dark .virtual-scroll-container::-webkit-scrollbar-thumb:hover {
  background-color: var(--el-text-color-secondary);
}

/* Firefox поддержка для горизонтального скроллбара */
.virtual-scroll-container {
  scrollbar-width: thin;
  scrollbar-color: var(--el-border-color-lighter) var(--el-bg-color);
}

/* Темная тема Firefox */
html.dark .virtual-scroll-container {
  scrollbar-color: var(--el-border-color-darker) var(--el-bg-color);
}

/* Скрытая область для имитации общей высоты таблицы */
.total-height-spacer {
  position: absolute;
  left: 0;

  top: 0;
  width: 1px;
  height: 1px; /* real height is kept in inline style for calculations, but spacer should not affect layout */
  visibility: hidden;
  pointer-events: none;
  overflow: hidden;
}

/* Loading overlay positioned over the table body area (below header) */
.table-body-container {
  position: absolute;
  top: var(--header-height, 35px);
  left: 0;
  right: 0;
  height: calc(var(--table-height, 100%) - var(--header-height, 35px));
  pointer-events: none;
}
.table-body-container .el-loading-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.8);
  z-index: 1200;
}

/* Стили для лоудера Element Plus */
.custom-table .el-loading-mask {
  z-index: 9;
}

/* Ограничиваем область загрузки и центрируем спиннер (повтор правила для надёжности) */
.custom-table .el-loading-mask {
  position: absolute;
  top: var(--header-height, 35px);
  left: 0;
  right: 0;
  height: calc(var(--table-height, 100%) - var(--header-height, 35px));
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Темная тема для загрузки tbody */
html.dark .custom-table .el-loading-mask {
  background-color: rgba(0, 0, 0, 0.8);
}

/* Стили для тега similarity */
.similarity-tag {
  display: inline-block;
  padding: 0 8px;
  height: 20px;
  line-height: 18px;
  font-size: 12px;
  color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-5);
  border: 1px solid rgba(64, 158, 255, 0.15);
  border-radius: 4px;
  margin-left: 8px;
}

/* Темная тема для similarity-tag */
html.dark .similarity-tag {
  color: var(--el-color-primary-light-2);
  background-color: var(--el-fill-color-darker);
  border: 1px solid var(--el-border-color-darker);
}
/* Лоудер поверх таблицы, не перекрывает sticky-столбцы */
</style>
