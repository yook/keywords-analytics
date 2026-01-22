<template>
  <el-card shadow="never" class="">
    <div class="flex items-center justify-between">
      <h1>{{ h1 }}</h1>
      <div class="flex items-center">
        <div
          v-if="showProcessInfo"
          class="flex flex-col items-end mr-3 text-sm text-gray-600 dark:text-gray-400 leading-tight"
          style="min-width: 140px"
        >
          <span class="font-medium">{{ processLabel }}</span>
          <span class="text-xs">{{ processedText || "\u00A0" }}</span>
        </div>
        <el-progress
          v-if="showProcessInfo"
          :text-inside="true"
          :stroke-width="40"
          :percentage="currentProgress"
          class="ml-3"
          striped
          :striped-flow="
            keywordsStore.isAddingWithProgress || keywordsStore.running
          "
          :duration="7"
        />
        <!-- <el-dropdown
          v-if="!keywordsStore.running && !keywordsStore.stopwordsRunning"
          class="ml-3"
        >
          <el-button type="primary" size="large">
            <el-icon class="text-4xl pr-3"><VideoPlay /> </el-icon>
            <span class="el-icon--right ml-2">▾</span>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="startStopWordsOnly">
                Фильтр по стоп-словам
              </el-dropdown-item>
              <el-dropdown-item @click="startTypingOnly">
                Определение класса
              </el-dropdown-item>
              <el-dropdown-item @click="startClusteringOnly">
                Распределение на кластеры
              </el-dropdown-item>
              <el-dropdown-item @click="startCategorizationOnly">
                Присвоение категории
              </el-dropdown-item>
              <el-dropdown-item @click="startMorphologyCheckOnly">
                Проверка согласованности
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown> -->
        <el-button
          :icon="pageType === 'isAddingWithProgress' ? CirclePlus : VideoPlay"
          type="primary"
          :plain="buttonPlain"
          size="large"
          class="ml-3 add-start large-icon-btn"
          @click="handlePrimaryAction"
          :disabled="keywordsStore[pageType] || keywordsStore.running"
        >
          {{
            pageType === "isAddingWithProgress"
              ? "Добавить ключевые запросы"
              : pageType === "stopwordsRunning"
                ? "Фильтровать по стоп-словам"
                : pageType === "categorizationRunning"
                  ? "Запустить категоризацию"
                  : pageType === "typingRunning"
                    ? "Определение класса"
                    : pageType === "clusteringRunning"
                      ? "Запустить кластеризацию"
                      : pageType === "morphologyRunning"
                        ? "Запустить лемматизацию"
                        : pageType === "morphologyCheckRunning"
                          ? "Запустить проверку согласованности"
                          : "Запустить процесс"
          }}
        </el-button>
      </div>
    </div>
    <el-dialog
      v-model="stopWordsDialogVisible"
      title="Фильтровать по стоп-словам"
      width="500px"
    >
      <StopWords @close-dialog="stopWordsDialogVisible = false" />
    </el-dialog>
    <el-dialog
      v-model="typingConfigDialogVisible"
      title="Определение класса"
      width="500px"
    >
      <TypingConfig @close-dialog="typingConfigDialogVisible = false" />
    </el-dialog>
    <el-dialog
      v-model="clusteringConfigDialogVisible"
      title="Распределение на кластеры"
      width="500px"
    >
      <ClusteringConfig @close-dialog="clusteringConfigDialogVisible = false" />
    </el-dialog>
    <el-dialog
      v-model="dialogVisible"
      title="Добавить ключевые запросы"
      width="900px"
      :close-on-click-modal="!keywordsStore.isAddingWithProgress"
      :close-on-press-escape="!keywordsStore.isAddingWithProgress"
      :show-close="!keywordsStore.isAddingWithProgress"
    >
      <el-form>
        <el-input
          v-model="keywords"
          type="textarea"
          placeholder="Введите ключевые запросы, разделенные запятыми или новой строкой"
          :rows="5"
          :disabled="keywordsStore.isAddingWithProgress"
        />
      </el-form>
      <template #footer>
        <div class="flex items-center justify-between w-full">
          <!-- Прогресс-бар в левой части -->
          <div class="flex items-center" style="min-width: 300px">
            <div
              v-if="keywordsStore.isAddingWithProgress"
              class="flex items-center mr-4"
              style="gap: 12px"
            >
              <el-progress
                :percentage="keywordsStore.addProgress"
                :text-inside="true"
                :stroke-width="20"
                style="width: 200px"
              />
            </div>
          </div>

          <!-- Кнопки в правой части -->
          <div class="flex gap-2 ml-auto">
            <el-button
              @click="dialogVisible = false"
              :disabled="keywordsStore.isAddingWithProgress"
            >
              Отмена
            </el-button>
            <el-button
              v-if="!keywordsStore.isAddingWithProgress"
              type="primary"
              @click="addKeywords"
            >
              Добавить
            </el-button>
            <el-button
              v-else
              type="primary"
              :loading="keywordsStore.isAddingWithProgress"
              loading-text="Добавление ключевых запросов..."
            >
              Добавить
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
const keywords = ref("");
import { ref, watch, computed, defineProps } from "vue";
import { ElMessage } from "element-plus";
import { useI18n } from "vue-i18n";
import { CirclePlus, VideoPlay, VideoPause } from "@element-plus/icons-vue";
import { useProjectStore } from "../../stores/project";
import { useKeywordsStore } from "../../stores/keywords";
import StopWords from "./settings/StopWords.vue";
import TypingConfig from "./settings/ClassificationConfig.vue";
import ClusteringConfig from "./settings/ClusteringConfig.vue";

const project = useProjectStore();
const keywordsStore = useKeywordsStore();
const { t } = useI18n();

const props = defineProps({
  h1: { type: String, default: "Ключевые запросы" },
  pageType: { type: String, default: "isAddingWithProgress" },
  buttonPlain: { type: Boolean, default: false },
});

const dialogVisible = ref(false);
const stopWordsDialogVisible = ref(false);
const typingConfigDialogVisible = ref(false);
const clusteringConfigDialogVisible = ref(false);
const handlePrimaryAction = () => {
  if (props.pageType === "stopwordsRunning") {
    stopWordsDialogVisible.value = true;
    return;
  }
  if (props.pageType === "typingRunning") {
    typingConfigDialogVisible.value = true;
    return;
  }
  if (props.pageType === "clusteringRunning") {
    clusteringConfigDialogVisible.value = true;
    return;
  }
  if (props.pageType === "morphologyCheckRunning") {
    startMorphologyCheckOnly();
    return;
  }
  dialogVisible.value = true;
};
const processLabel = computed(() => {
  if (keywordsStore.currentProcessLabel)
    return keywordsStore.currentProcessLabel;
  if (keywordsStore.isAddingWithProgress) return "Добавление ключевых запросов";
  if (keywordsStore.categorizationRunning) return "Категоризация";
  if (keywordsStore.typingRunning) return "Определение класса";
  if (keywordsStore.clusteringRunning) {
    // Detailed clustering stages
    if (keywordsStore.progress) {
      switch (keywordsStore.progress.stage) {
        case "embeddings":
          return keywordsStore.progress.source === "openai"
            ? "Получение эмбеддингов [OpenAI]"
            : "Загрузка эмбеддингов [кэш]";
        case "building_graph":
          return "Построение графа сходства";
        case "clustering":
          return "Кластеризация";
        case "dbscan":
          return "DBSCAN кластеризация";
        case "saving":
          return "Сохранение результатов";
        default:
          return "Кластеризация";
      }
    }
    return "Кластеризация";
  }
  if (keywordsStore.stopwordsRunning) return "Фильтр по стоп-словам";
  if (keywordsStore.morphologyRunning) return "Лемматизация";
  if (keywordsStore.morphologyCheckRunning) return "Проверка согласованности";
  return "";
});

const processedText = computed(() => {
  if (!showProcessInfo.value) return "";

  // Clustering detailed progress
  if (keywordsStore.clusteringRunning && keywordsStore.progress) {
    const p = keywordsStore.progress;
    if (p.total && p.processed !== undefined) {
      return `${p.processed} из ${p.total}`;
    }
    if (p.total && p.fetched !== undefined) {
      return `${p.fetched} из ${p.total}`;
    }
    if (p.percent !== undefined) {
      return `${Math.round(p.percent)}%`;
    }
  }

  // For add-with-progress flow prefer the explicit addProgressText (n из m)
  if (keywordsStore.isAddingWithProgress && keywordsStore.addProgressText) {
    return keywordsStore.addProgressText;
  }
  if (keywordsStore.currentTotal > 0) {
    return `${keywordsStore.currentProcessed} из ${keywordsStore.currentTotal}`;
  }
  // Fallback: when total isn't reported yet, show percent as pseudo-count out of 100
  if (keywordsStore.stopwordsRunning && keywordsStore.stopwordsPercent >= 0) {
    const pct = Math.round(keywordsStore.stopwordsPercent);
    return `${pct} из 100`;
  }
  return "";
});

const showProcessInfo = computed(() => {
  return (
    keywordsStore.isAddingWithProgress ||
    keywordsStore.categorizationRunning ||
    keywordsStore.typingRunning ||
    keywordsStore.clusteringRunning ||
    keywordsStore.stopwordsRunning ||
    keywordsStore.morphologyRunning ||
    keywordsStore.morphologyCheckRunning
  );
});

const currentProgress = computed(() => {
  if (keywordsStore.isAddingWithProgress) return keywordsStore.addProgress;
  if (keywordsStore.typingRunning) return keywordsStore.typingPercent;
  if (keywordsStore.stopwordsRunning) return keywordsStore.stopwordsPercent;
  if (keywordsStore.morphologyCheckRunning)
    return keywordsStore.morphologyCheckPercent;
  if (keywordsStore.morphologyRunning) return keywordsStore.morphologyPercent;

  // Clustering progress from detailed progress object
  if (keywordsStore.clusteringRunning && keywordsStore.progress) {
    return keywordsStore.progress.percent || 0;
  }
  if (keywordsStore.clusteringRunning) return keywordsStore.clusteringPercent;

  return 0;
});

// Очищаем поле при закрытии диалога
watch(dialogVisible, (newVisible) => {
  if (!newVisible) {
    keywords.value = "";
  }
});

function freezeQueue() {
  keywordsStore.stopCurrentProcess();
}

async function addKeywords() {
  console.log("=== addKeywords called ===");
  console.log("Call timestamp:", new Date().toISOString());

  if (keywords.value.trim()) {
    try {
      // one-time watcher: when the store indicates adding with progress (or running),
      // close the dialog so top-level progress bar becomes visible
      const stopWatcher = watch(
        () => keywordsStore.isAddingWithProgress || keywordsStore.running,
        (val) => {
          if (val) {
            dialogVisible.value = false;
            try {
              stopWatcher();
            } catch (e) {}
          }
        },
      );

      // addKeywords теперь async, стор сам управляет флагом isAddingWithProgress
      await keywordsStore.addKeywords(keywords.value);

      // immediately start morphology after successful add
      try {
        keywordsStore.targetMorphology = true;
        // start in background so UI can continue (errors handled inside store)
        const pid = project.currentProjectId
          ? String(project.currentProjectId)
          : "anon";
        keywordsStore
          .startMorphology(pid)
          .then(() => {
            // Morphology completed successfully, refresh table to show lemmas
            console.log("[KeywordsAdd] morphology completed, refreshing table");
            refreshTable();
          })
          .catch((err) => {
            console.error(
              "[KeywordsAdd] startMorphology after add failed",
              err,
            );
            keywordsStore.targetMorphology = false;
            ElMessage.error("Ошибка при запуске лемматизации");
          });
      } catch (e) {
        console.error("[KeywordsAdd] failed to trigger morphology", e);
      }

      // Очищаем поле и закрываем диалог (в случае, если процесс завершился быстро)
      keywords.value = "";

      setTimeout(() => {
        dialogVisible.value = false;
        // Обновляем таблицу после закрытия диалога
        refreshTable();
      }, 500);
    } catch (error) {
      console.error("❌ Error adding keywords:", error);
      // ElMessage об ошибке уже показано в store
    }
  } else {
    console.log("❌ No keywords provided");
    ElMessage.warning("Введите ключевые запросы");
  }
}

function refreshTable() {
  // Обновляем таблицу ключевых слов после успешного добавления
  if (keywordsStore.currentProjectId) {
    keywordsStore.loadKeywords(keywordsStore.currentProjectId);
  }
}

// Запуск процессов из выпадающего меню
function startAll() {
  keywordsStore.startAllProcesses();
}
function startCategorizationOnly() {
  keywordsStore.startCategorizationOnly();
}
function startTypingOnly() {
  keywordsStore.startTypingOnly();
}
function startStopWordsOnly() {
  console.log("KeywordsAdd: startStopWordsOnly clicked");
  keywordsStore.startStopwordsOnly();
}
function startClusteringOnly() {
  keywordsStore.startClusteringOnly();
}
async function startMorphologyOnly() {
  if (!keywordsStore.keywordCount) {
    ElMessage.warning("Нет ключевых слов для обработки");
    return;
  }
  try {
    keywordsStore.targetMorphology = true;
    await keywordsStore.startMorphology();
  } catch (e) {
    console.error("[KeywordsAdd] Error starting morphology:", e);
    ElMessage.error("Ошибка запуска лемматизации");
    keywordsStore.targetMorphology = false;
  }
}
async function startMorphologyCheckOnly() {
  if (!keywordsStore.keywordCount) {
    ElMessage.warning("Нет ключевых слов для обработки");
    return;
  }
  try {
    const pid = project.currentProjectId
      ? String(project.currentProjectId)
      : "anon";
    await keywordsStore.startMorphologyCheck(pid);
  } catch (e) {
    console.error("[KeywordsAdd] Error starting morphology check:", e);
  }
}

// TODO: IPC migration - socket listeners removed, using async/await now
/*
// Обработчик успешного добавления ключевых слов
function handleKeywordsAdded(data) {
  callCount++;
  console.log(`=== handleKeywordsAdded called (call #${callCount}) ===`);
  console.log("Call timestamp:", new Date().toISOString());
  console.log("Current progress:", keywordsStore.addProgress);
  console.log("Is adding with progress:", keywordsStore.isAddingWithProgress);
  console.log("Data:", JSON.stringify(data, null, 2));
  console.log("Current messageShown flag:", messageShown);

  // Предотвращаем дублирование сообщений
  if (messageShown) {
    console.log(
      `❌ Call #${callCount}: Message already shown, skipping duplicate`
    );
    console.log("messageShown is true, returning early");
    return;
  }

  // Дополнительная защита: если это не первый вызов, игнорируем
  if (callCount > 1) {
    console.log(
      `❌ Call #${callCount}: Multiple calls detected, this should not happen!`
    );
    return;
  }

  console.log(`✅ Call #${callCount}: Processing keywords addition`);
  addingKeywords.value = false;
  keywordsStore.resetAddProgress();
  ElMessage.success("Ключевые запросы добавлены");
  messageShown = true;
  keywords.value = "";

  // Небольшая задержка, чтобы прогресс успел обновиться до 100%

  // Небольшая задержка, чтобы прогресс успел обновиться до 100%
  setTimeout(() => {
    console.log("=== Closing dialog after delay ===");
    dialogVisible.value = false;
    // Обновляем таблицу после закрытия диалога
    refreshTable();
    // Сбрасываем флаг после закрытия диалога
    setTimeout(() => {
      console.log("Resetting messageShown flag to false");
      messageShown = false;
      callCount = 0; // Сбрасываем счетчик вызовов
    }, 1000);
  }, 200);
}

// Обработчик ошибки при добавлении ключевых слов
function handleKeywordsError(data) {
  console.log("Keywords add error:", data);
  addingKeywords.value = false;
  keywordsStore.resetAddProgress();
  ElMessage.error(mapErrorMessage(data) || "Ошибка при добавлении ключевых слов");

  // Не закрываем диалог при ошибке, чтобы пользователь мог попробовать снова
}
*/

// TODO: IPC migration - socket listeners removed
/*
// Настройка socket listeners
onMounted(() => {
  console.log("=== KeywordsAdd onMounted - registering socket listeners ===");
  socket.on("keywords:added", handleKeywordsAdded);
  socket.on("keywords:error", handleKeywordsError);
});

onUnmounted(() => {
  console.log("=== KeywordsAdd onUnmounted - removing socket listeners ===");
  socket.off("keywords:added", handleKeywordsAdded);
  socket.off("keywords:error", handleKeywordsError);
});
*/
</script>

<style>
.el-input--large .el-input__wrapper {
  padding: 1px;
  border-color: #fafcff;
  /* border-radius: 0; */
}
.w-500 {
  width: 500px;
}

.large-icon-btn .el-icon {
  font-size: 1.3rem !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Стили для темной темы */
html.dark .el-input--large .el-input__wrapper {
  border-color: var(--el-border-color);
  background-color: var(--el-fill-color);
}

/* Apply background and border color to the wrapper only - Element Plus already has border structure */
html.dark .site-input .el-input__wrapper {
  background-color: var(--el-fill-color);
  color: var(--el-text-color-primary);
  border-color: var(--el-border-color);
}

html.dark .site-input input,
html.dark .site-input textarea {
  background-color: transparent;
  color: var(--el-text-color-primary);
  border: none;
}

html.dark .site-input .el-textarea__inner {
  background-color: var(--el-fill-color);
  color: var(--el-text-color-primary);
  border-color: var(--el-border-color);
}

/* Focus and placeholder styles should target the visible element (wrapper or textarea inner) */
html.dark .site-input .el-input__wrapper:focus-within {
  border-color: var(--el-color-primary);
  background-color: var(--el-fill-color-light);
}

html.dark .site-input .el-textarea__inner::placeholder,
html.dark .site-input input::placeholder,
html.dark .site-input textarea::placeholder {
  color: var(--el-text-color-placeholder);
}

/* Ensure inner input elements don't draw their own border or shadow -- keep only wrapper border */
.site-input .el-input__wrapper .el-input__inner {
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
  background: transparent !important;
}

.site-input input,
.site-input textarea {
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
}

.site-input .el-textarea__inner {
  box-shadow: none !important;
  outline: none !important;
  background: transparent !important;
}

html.dark .el-card {
  background-color: var(--el-bg-color);
  border-color: var(--el-border-color);
}

/* Стили для progress bar в темной теме */
html.dark .el-progress {
  --el-progress-text-color: var(--el-text-color-primary);
}

html.dark .el-progress-bar__outer {
  background-color: var(--el-bg-color) !important;
  border: 1px solid var(--el-border-color) !important;
}

html.dark .el-progress-bar__inner {
  background-color: #2d3748 !important;
  background-image: none !important;
}

html.dark .el-progress__text {
  color: var(--el-text-color-primary) !important;
}

html.dark .el-progress--line.el-progress--striped .el-progress-bar__inner {
  background-image: none !important;
  background-size: auto !important;
}
</style>
