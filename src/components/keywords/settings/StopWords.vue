<template>
  <div>
    <div class="demo-collapse mb-4">
      <el-collapse accordion>
        <el-collapse-item name="2">
          <template #title="{ isActive }">
            <div :class="['title-wrapper', { 'is-active': isActive }]">
              <span>Стоп-слова</span>
              <el-tag type="primary" effect="plain" round>
                {{ stopwordsCount }}
              </el-tag>
            </div>
          </template>
          <div class="mt-4">
            <el-form>
              <div class="flex flex-col gap-3 mb-3">
                <div style="width: 100%">
                  <el-select
                    v-model="inputMode"
                    placeholder="Текст / Регулярное выражение"
                    size="small"
                    style="width: 100%"
                  >
                    <el-option label="Текст" value="text" />
                    <el-option label="Регулярное выражение" value="regex" />
                  </el-select>
                </div>
                <div style="width: 100%">
                  <el-input
                    v-model="stopWordsText"
                    type="textarea"
                    :placeholder="textareaPlaceholder"
                    :rows="4"
                    :disabled="isAddingWithProgress"
                    style="width: 100%"
                  />
                </div>
                <div v-if="inputMode === 'regex'" class="text-xs text-gray-500">
                  Пример: <code>\bfree\b</code> или <code>^test</code>.
                </div>
              </div>
              <div
                v-if="invalidRegexLines.length"
                class="mt-2 text-sm text-red-600"
              >
                Неверные регулярные выражения:
                <ul class="list-disc">
                  <li v-for="(r, idx) in invalidRegexLines" :key="idx">
                    {{ r }}
                  </li>
                </ul>
              </div>
              <div class="flex items-center justify-between mt-4">
                <el-button
                  type="primary"
                  link
                  size="small"
                  @click="drawer = true"
                >
                  Как это работает?
                </el-button>
                <div class="ml-auto flex gap-2">
                  <el-button
                    v-if="!isAddingWithProgress"
                    type="primary"
                    plain
                    @click="addStopWords"
                  >
                    Добавить стоп-слова
                  </el-button>
                  <el-button
                    v-else
                    type="primary"
                    plain
                    :loading="isAddingWithProgress"
                    loading-text="Добавление..."
                  >
                    Добавить
                  </el-button>
                </div>
              </div>
            </el-form>

            <div class="mt-6">
              <DataTableFixed
                :tableColumns="tableColumns"
                :data="stopWords"
                :totalCount="stopwordsStore.totalCount"
                :loading="loading"
                :loadingMore="loadingMore"
                :sort="sort"
                :windowStart="stopwordsStore.windowStart"
                :loadWindow="loadWindow"
                :sortData="sortData"
                :loadData="loadData"
                dbKey="stopwords"
                @delete-row="removeRow"
                @delete-all="deleteAll"
                :fixedHeight="215"
                @columns-reorder="onColumnsReorder"
              />
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
      <el-drawer v-model="drawer" direction="rtl" :size="1000">
        <template #header>
          <div class="title-wrapper">
            <span>Как работает фильтрация по стоп-словам</span>
          </div>
        </template>
        <div class="text-sm" style="overflow-y: auto">
          <div class="mb-2">
            <strong>Цель:</strong><br />
            Автоматически убрать нерелевантные ключевые фразы из списка целевых.
          </div>

          <div class="mb-2">
            <strong>Описание:</strong><br />
            Стоп-слово — это слово или шаблон. Если ключевая фраза совпала со
            стоп-словом, она исключается из целевых.<br />
            Формат записи бывает двух типов:
            <ul class="list-disc">
              <li>
                Обычное слово — ищется как подстрока без учёта регистра (ввод
                приводится к нижнему регистру).
              </li>
              <li>Регулярное выражение — применяется по правилам regex.</li>
            </ul>
          </div>

          <div>
            <div class="mt-2">
              <strong>Что можно использовать в <code>pattern</code>:</strong>
              <ul class="list-disc">
                <li>
                  <strong>Символьные классы</strong> — набор символов в одной
                  позиции:
                  <ul class="list-disc">
                    <li><code>\d</code> — любая цифра (0-9).</li>
                    <li>
                      <code>\w</code> — буква/цифра/подчёркивание (эквивалент
                      <code>[A-Za-z0-9_]</code>, в Unicode-режиме включает
                      кириллицу).
                    </li>
                    <li>
                      <code>\s</code> — пробельный символ (пробел, таб, перевод
                      строки).
                    </li>
                    <li>
                      Отрицания <code>\D</code>, <code>\W</code>,
                      <code>\S</code> означают «не цифра», «не
                      буква/цифра/подчёркивание», «не пробел».
                    </li>
                  </ul>
                </li>
                <li>
                  <strong>Специальные символы:</strong>
                  <ul class="list-disc">
                    <li>
                      <code>.</code> — любой символ, кроме перевода строки.
                    </li>
                  </ul>
                </li>
                <li>
                  <strong>Диапазоны и наборы:</strong>
                  <ul class="list-disc">
                    <li><code>[abc]</code> — любой из символов a, b или c.</li>
                    <li>
                      <code>[а-яё]</code> — любая буква кириллицы от а до я,
                      включая ё.
                    </li>
                  </ul>
                </li>
                <li>
                  <strong>Квантификаторы</strong> — количество повторений:
                  <ul class="list-disc">
                    <li><code>?</code> — 0 или 1 раз (опционально).</li>
                    <li><code>*</code> — 0 и более раз (жадно).</li>
                    <li><code>+</code> — 1 и более раз.</li>
                    <li><code>{n}</code> — ровно n повторений.</li>
                    <li><code>{n,}</code> — n и больше.</li>
                    <li><code>{n,m}</code> — от n до m включительно.</li>
                  </ul>
                </li>
                <li>
                  <strong>Якоря</strong> — фиксируют позицию:
                  <ul class="list-disc">
                    <li><code>^</code> — начало строки.</li>
                    <li><code>$</code> — конец строки.</li>
                  </ul>
                </li>
                <li>
                  <strong>Группы и альтернативы:</strong>
                  <ul class="list-disc">
                    <li><code>(...)</code> — группировка.</li>
                    <li><code>a|b</code> — альтернатива (либо a, либо b).</li>
                  </ul>
                </li>
                <li>
                  <strong>Экранирование спецсимволов:</strong>
                  <ul class="list-disc">
                    <li>
                      <code>\.</code>, <code>\*</code>, <code>\+</code>,
                      <code>\?</code>, <code>\(</code>, <code>\)</code>,
                      <code>\[</code>, <code>\]</code>, <code>\/</code> и т.д.
                    </li>
                  </ul>
                </li>
              </ul>
            </div>

            <div class="mt-2">
              <strong>Флаги:</strong>
              <ul class="list-disc">
                <li>
                  <code>i</code> — регистронезависимый поиск; добавляется
                  автоматически.
                </li>
                <li>
                  <code>u</code> — Unicode-режим (рекомендуется для кириллицы);
                  добавляется автоматически.
                </li>
              </ul>
            </div>

            <div class="mt-2">
              <strong> Примеры (вводите только тело без //): </strong>
              <ul class="list-disc">
                <li>
                  <code>^test</code> — отключит ключи, начинающиеся с «test»
                  (без учёта регистра).
                </li>
                <li>
                  <code>\d{3,}</code> — отключит ключи, содержащие числа из 3 и
                  более цифр.
                </li>
                <li>
                  <code>\bfree\b</code> — отключит ключи, где «free» стоит
                  отдельным словом.
                </li>
                <li>
                  <code>[А-Яа-яЁё]{1,2}\s+оптом</code> — отключит ключи вида
                  «мясо оптом», «сахар оптом» и т.п.
                </li>
                <li>
                  <code>\s+бесплатно$</code> — отключит ключи, которые
                  заканчиваются словом «бесплатно».
                </li>
                <li>
                  <code>\.(ru|com|net)\b</code> — отключит ключи, содержащие
                  домены .ru, .com, .net.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </el-drawer>
      <div class="dialog-footer">
        <el-button
          type="primary"
          :loading="keywordsStore.stopwordsRunning"
          :disabled="!canRunStopwordsProcess"
          @click="runStopwordsProcess"
        >
          Запустить фильтрацию
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { markRaw } from "vue";
import { Delete, InfoFilled } from "@element-plus/icons-vue";
import DataTableFixed from "../../DataTableFixed.vue";
import saveColumnOrder from "../../../utils/columnOrder";
import { useProjectStore } from "../../../stores/project";
import { useKeywordsStore } from "../../../stores/keywords";
import { useStopwordsStore } from "../../../stores/stopwords";
import { useDexie } from "../../../composables/useDexie";

const project = useProjectStore();
const keywordsStore = useKeywordsStore();
const stopwordsStore = useStopwordsStore();

const stopWordsText = ref("");
const inputMode = ref<"text" | "regex">("text");
const drawer = ref(false);
const textareaPlaceholder = computed(() =>
  inputMode.value === "regex" ? "Введите шаблон" : "Введите значение",
);
// Use store data instead of local ref
const stopWords = computed(() => stopwordsStore.stopwords);

const isMounted = ref(true);

onMounted(async () => {
  if (project.currentProjectId) {
    currentProjectId.value = project.currentProjectId;
    stopwordsStore.setCurrentProjectId(project.currentProjectId);
    await loadData();
  }
});

onUnmounted(() => {
  isMounted.value = false;
});

// Computed helpers to show regex hints and validate regex lines
const inputLines = computed(() => {
  return stopWordsText.value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
});

const regexLines = computed(() => {
  return inputLines.value.filter(
    (l) => !!extractRegexParts(l, inputMode.value),
  );
});

const invalidRegexLines = computed(() => {
  return regexLines.value.filter((l) => {
    const candidate = extractRegexParts(l, inputMode.value);
    if (!candidate) return true;
    try {
      new RegExp(candidate.pattern, ensureIUFlags(candidate.flags));
      return false;
    } catch (e) {
      return true;
    }
  });
});

// UI / progress flags (use store values)
const isAddingWithProgress = computed(
  () => stopwordsStore.isAddingWithProgress,
);
const addProgress = computed(() => stopwordsStore.addProgress);
const addProgressText = computed(() => stopwordsStore.addProgressText);
const loading = computed(() => stopwordsStore.loading);
const loadingMore = computed(() => stopwordsStore.loadingMore);
const sort = computed(() => stopwordsStore.sort);
const stopwordsCount = computed(() => stopwordsStore.totalCount || 0);
const stopwordsProcessBusy = computed(
  () => keywordsStore.running || keywordsStore.stopwordsRunning,
);
const canRunStopwordsProcess = computed(
  () =>
    !!project.currentProjectId &&
    stopwordsCount.value > 0 &&
    !stopwordsProcessBusy.value,
);
const emit = defineEmits(["close-dialog"]);

// Настройка колонок для DataTableFixed
const tableColumns = ref([
  { prop: "word", name: "Слово" },
  // служебный столбец с действиями (удаление)
  { prop: "_actions", name: "", width: 40 },
]);

// Data loading helpers
async function loadWindow(start) {
  await stopwordsStore.loadWindow(start);
}
function sortData(newSort) {
  stopwordsStore.sortStopwords(newSort);
}
async function loadData() {
  if (!currentProjectId.value) return;
  await stopwordsStore.loadStopwords(currentProjectId.value);
}

const currentProjectId = ref(null);
const KEYWORDS_REFRESH_LIMIT = 300;
const PROGRESS_YIELD_INTERVAL = 50;

// Handle column reorder: update local tableColumns and persist via util
function onColumnsReorder(newOrder) {
  try {
    if (!Array.isArray(newOrder)) return;
    // Map props to existing ColumnDef objects when possible
    const existing = tableColumns.value || [];
    const remaining = [...existing];
    const ordered = [];
    for (const p of newOrder) {
      const idx = remaining.findIndex((c) => c.prop === p);
      if (idx !== -1) {
        ordered.push(remaining.splice(idx, 1)[0]);
      } else {
        // create minimal def if missing
        ordered.push({ prop: p, name: p });
      }
    }
    // append any leftovers (safety)
    for (const r of remaining) ordered.push(r);

    tableColumns.value = ordered;

    // Persist using shared util
    try {
      saveColumnOrder(project, "stopwords", newOrder);
    } catch (e) {
      console.error("saveColumnOrder stopwords failed", e);
    }
  } catch (e) {
    console.error("onColumnsReorder stopwords error", e);
  }
}

function parseInputText(text) {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

type InputMode = "text" | "regex";
const FLAG_ORDER = ["g", "i", "m", "s", "u", "y"];

function ensureIUFlags(flags: string) {
  const activeFlags = new Set(flags.split(""));
  activeFlags.add("i");
  activeFlags.add("u");
  return FLAG_ORDER.filter((flag) => activeFlags.has(flag)).join("");
}

function extractRegexParts(line: string, mode: InputMode) {
  const explicit = line.match(/^\/((?:\\.|[^\\\/])+?)\/([gimsuy]*)$/);
  if (explicit) {
    return { pattern: explicit[1], flags: explicit[2] || "" };
  }
  if (mode === "regex") {
    const body = line.replace(/^\/|\/$/g, "");
    if (!body) return null;
    return { pattern: body, flags: "" };
  }
  return null;
}

type StopwordMatcher =
  | { type: "plain"; value: string; raw: string }
  | { type: "regex"; regex: RegExp; raw: string };

function buildStopwordMatchers(list: Array<{ word?: string }>) {
  const matchers: StopwordMatcher[] = [];
  for (const item of list) {
    const rawValue = item?.word?.trim();
    if (!rawValue) continue;
    const regexMatch = rawValue.match(/^\/((?:\\.|[^\\\/])+?)\/([gimsuy]*)$/);
    if (regexMatch) {
      try {
        const pattern = regexMatch[1];
        const flags = regexMatch[2] || "";
        matchers.push({
          type: "regex",
          regex: new RegExp(pattern, flags),
          raw: rawValue,
        });
      } catch (error) {
        console.warn("Invalid stopword regex", rawValue, error);
      }
    } else {
      matchers.push({
        type: "plain",
        value: rawValue.toLowerCase(),
        raw: rawValue,
      });
    }
  }
  return matchers;
}

function findMatchingStopword(text: string, matchers: StopwordMatcher[]) {
  if (!text || !matchers.length) return null;
  const normalized = text.toLowerCase();
  for (const matcher of matchers) {
    if (matcher.type === "regex") {
      try {
        if (matcher.regex.test(text)) {
          return matcher.raw;
        }
      } catch (error) {
        console.warn("Stopword regex failed", error);
      }
    } else if (normalized.includes(matcher.value)) {
      return matcher.raw;
    }
  }
  return null;
}

function updateStopwordsProgress(processed: number, total: number) {
  keywordsStore.currentProcessed = processed;
  keywordsStore.currentTotal = total;
  if (total > 0) {
    keywordsStore.stopwordsPercent = Math.min(
      100,
      Math.round((processed / total) * 100),
    );
  } else {
    keywordsStore.stopwordsPercent = 0;
  }
}

async function runStopwordsProcess() {
  if (!project.currentProjectId) {
    ElMessage.warning("Сначала выберите проект");
    return;
  }
  if (!stopwordsCount.value) {
    ElMessage.warning("Добавьте хотя бы одно стоп-слово");
    return;
  }
  if (stopwordsProcessBusy.value) {
    ElMessage.warning("Дождитесь завершения другого процесса");
    return;
  }

  const matchers = buildStopwordMatchers(stopwordsStore.stopwords);
  if (!matchers.length) {
    ElMessage.warning("Нет корректных стоп-слов для запуска фильтрации");
    return;
  }

  keywordsStore.currentProcessLabel = "Фильтр по стоп-словам";
  keywordsStore.stopwordsRunning = true;
  keywordsStore.running = true;
  keywordsStore.currentProcessed = 0;
  keywordsStore.currentTotal = 0;
  keywordsStore.stopwordsPercent = 0;

  try {
    emit("close-dialog");
  } catch (error) {
    console.warn("close-dialog emit failed", error);
  }

  try {
    const dexie = useDexie();
    const db = await dexie.init();
    const keywordsTable = db.keywords;
    const keywords = await keywordsTable
      .where("projectId")
      .equals(String(project.currentProjectId))
      .toArray();
    const total = keywords.length;
    keywordsStore.currentTotal = total;

    if (total === 0) {
      ElMessage.info("Нет ключевых запросов для фильтрации");
      return;
    }

    let processed = 0;
    let matched = 0;
    let lastYield = Date.now();

    for (const keyword of keywords) {
      processed += 1;
      const wordText = keyword?.keyword ? String(keyword.keyword) : "";
      const matchedRule = findMatchingStopword(wordText, matchers);
      const targetValue = !matchedRule;
      const intendedRule = matchedRule || "";

      if (keyword.id) {
        const currentTarget = keyword.target_query;
        const currentRule = keyword.blocking_rule || "";
        if (currentTarget !== targetValue || currentRule !== intendedRule) {
          try {
            await keywordsTable.put({
              ...keyword,
              target_query: targetValue,
              blocking_rule: intendedRule,
            });
          } catch (updateError) {
            console.error("Ошибка обновления ключевого запроса", updateError);
          }
        }
      }

      if (matchedRule) {
        matched += 1;
      }
      updateStopwordsProgress(processed, total);
      if (Date.now() - lastYield >= PROGRESS_YIELD_INTERVAL) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        lastYield = Date.now();
      }
    }

    if (matched > 0) {
      ElMessage.success(
        `Фильтрация по стоп-словам завершена, совпадений ${matched}`,
      );
    } else {
      ElMessage.info(
        "Фильтрация по стоп-словам завершена, совпадений не найдено",
      );
    }
  } catch (error) {
    console.error("runStopwordsProcess failed", error);
    ElMessage.error("Ошибка при запуске фильтрации по стоп-словам");
  } finally {
    if (project.currentProjectId) {
      await keywordsStore.loadKeywords(String(project.currentProjectId), {
        offset: 0,
        limit: KEYWORDS_REFRESH_LIMIT,
      });
    }
    keywordsStore.stopwordsRunning = false;
    keywordsStore.running = false;
    keywordsStore.currentProcessLabel = "";
    keywordsStore.stopwordsPercent = 0;
    keywordsStore.currentProcessed = 0;
    keywordsStore.currentTotal = 0;
  }
}

async function addStopWords() {
  const items = parseInputText(stopWordsText.value);
  console.log("[StopWords] addStopWords called with items:", items);
  console.log("[StopWords] currentProjectId:", currentProjectId.value);

  if (items.length === 0) {
    ElMessage.warning("Ничего не введено");
    return;
  }
  // Prevent submission if any regex lines are invalid
  if (invalidRegexLines.value && invalidRegexLines.value.length > 0) {
    ElMessage.error(
      "Есть неверные регулярные выражения. Исправьте их перед отправкой.",
    );
    return;
  }

  try {
    // Normalize stop-words: lowercase plain words, wrap regex bodies and ensure i/u
    const normalized = items.map((it) => {
      const trimmed = String(it).trim();
      const regexParts = extractRegexParts(trimmed, inputMode.value);
      if (regexParts) {
        const flags = ensureIUFlags(regexParts.flags);
        return `/${regexParts.pattern}/${flags}`;
      }
      return trimmed.toLowerCase();
    });

    // Join back to text format for the store
    const text = normalized.join("\n");

    // Use store method
    await stopwordsStore.addStopwords(text);
    stopWordsText.value = "";
  } catch (error) {
    console.error("Error adding stopwords:", error);
    ElMessage.error("Ошибка добавления стоп-слов");
  }
}

async function removeRow(row) {
  try {
    await ElMessageBox.confirm(
      `Удалить стоп-слово "${row.word}"?`,
      "Подтверждение удаления",
      {
        confirmButtonText: "Удалить",
        cancelButtonText: "Отмена",
        type: "error",
        icon: markRaw(Delete),
        customClass: "delete-msgbox-class",
      },
    );

    await stopwordsStore.deleteStopword(row.id);

    // Перезагружаем данные keywords, чтобы обновились колонки "Целевой запрос" и "Правило исключения"
    if (keywordsStore.currentProjectId) {
      console.log("[StopWords] Reloading keywords after stopword deleted");
      await keywordsStore.loadKeywords(keywordsStore.currentProjectId, {
        skip: 0,
        limit: keywordsStore.windowSize,
        sort: keywordsStore.sort,
      });
    }
  } catch (error) {
    if (error !== "cancel") {
      console.error("Error deleting stopword:", error);
      ElMessage.error("Ошибка удаления");
    }
  }
}

async function deleteAll() {
  try {
    await ElMessageBox.confirm(
      `Удалить все стоп-слова для проекта?`,
      "Подтверждение удаления",
      {
        confirmButtonText: "Удалить все",
        cancelButtonText: "Отмена",
        type: "error",
        icon: markRaw(Delete),
        customClass: "delete-msgbox-class",
      },
    );

    await stopwordsStore.deleteAllStopwords();

    // Перезагружаем данные keywords, чтобы обновились колонки "Целевой запрос" и "Правило исключения"
    if (keywordsStore.currentProjectId) {
      console.log("[StopWords] Reloading keywords after all stopwords deleted");
      await keywordsStore.loadKeywords(keywordsStore.currentProjectId, {
        skip: 0,
        limit: keywordsStore.windowSize,
        sort: keywordsStore.sort,
      });
    }
  } catch (error) {
    if (error !== "cancel") {
      console.error("Error deleting all stopwords:", error);
      ElMessage.error("Ошибка удаления");
    }
  }
}

// Watch project changes
watch(
  () => project.data?.id,
  async (newId) => {
    if (!isMounted.value) return;

    // Очищаем поле при смене проекта
    stopWordsText.value = "";
    currentProjectId.value = newId;
    stopwordsStore.setCurrentProjectId(newId);
    if (newId) {
      await loadData();
    } else {
      stopwordsStore.initializeState();
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.mt-3 {
  margin-top: 12px;
}
.mt-4 {
  margin-top: 16px;
}
.mt-6 {
  margin-top: 24px;
}
.flex {
  display: flex;
}
.items-center {
  align-items: center;
}
.justify-between {
  justify-content: space-between;
}
.ml-auto {
  margin-left: auto;
}
.text-sm {
  font-size: 0.875rem;
}
/* Removed forced color rules to inherit global theme colors */

.title-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.title-wrapper.is-active {
  color: var(--el-color-primary);
}

/* Ограничение ширины таблицы */
:deep(.table-container) {
  position: relative;
  width: 100%;
  max-width: 100% !important;
  overflow-x: auto !important;
  box-sizing: border-box;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-base);
}
</style>
