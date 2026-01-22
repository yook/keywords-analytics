<template>
  <div class="clustering-config-container">
    <div class="mb-3">
      <el-button type="primary" link size="small" @click="drawer = true">
        Как это работает?
      </el-button>
    </div>

    <div class="mt-4">
      <el-form :model="form" label-position="left" label-width="250px">
        <el-form-item label="Алгоритм кластеризации">
          <el-select v-model="form.algorithm" placeholder="Выберите алгоритм">
            <el-option label="Связные компоненты" value="components" />
            <el-option
              label="DBSCAN (плотностная кластеризация)"
              value="dbscan"
            />
          </el-select>
        </el-form-item>

        <el-form-item
          v-if="form.algorithm === 'components'"
          label="Порог сходства (threshold)"
        >
          <el-slider
            class="clustering-slider"
            v-model="thresholdValue"
            :step="0.01"
            :min="0"
            :max="1"
            show-input
          />
          <div class="text-xs text-gray-500 mt-1">
            Минимальное косинусное сходство для создания связи между фразами.
            Рекомендуется 0.7–0.85 для строгих кластеров.
          </div>
        </el-form-item>

        <el-form-item
          v-if="form.algorithm === 'dbscan'"
          label="Радиус окрестности (eps)"
        >
          <el-slider
            class="clustering-slider"
            v-model="dbscanEps"
            :step="0.01"
            :min="0.05"
            :max="0.95"
            show-input
          />
          <div class="text-xs text-gray-500 mt-1">
            Чем больше eps → тем больше точек будут объединяться в один кластер.
          </div>
        </el-form-item>

        <el-form-item
          v-if="form.algorithm === 'dbscan'"
          label="Минимум точек (minPts)"
        >
          <el-input-number
            v-model="dbscanMinPts"
            :min="1"
            :max="10"
            :step="1"
          />
          <div class="form-helper text-xs text-gray-500 mt-1">
            Минимальное количество соседей для формирования плотной области.
            Обычно 2–5.
          </div>
        </el-form-item>
      </el-form>

      <!-- Кнопка запуска кластеризации -->
      <div class="clustering-action-row">
        <el-button
          type="primary"
          size="large"
          @click="handleClusteringRun"
          :loading="isClusteringRunning"
        >
          Запустить кластеризацию
        </el-button>
      </div>
    </div>

    <el-drawer v-model="drawer" direction="rtl" :size="1000">
      <template #header>
        <div class="title-wrapper">
          <span>Как работает кластеризация запросов</span>
        </div>
      </template>
      <div class="text-sm" style="overflow-y: auto">
        <div class="mb-4">
          <h3 class="font-bold mb-2">
            Связные компоненты (Connected Components)
          </h3>
          <p class="mb-2">
            Простой и быстрый, но может слить всё в один кластер при низком
            пороге.
          </p>
          <p class="mb-2">
            <strong>Описание</strong><br />
            Строится граф, где каждый запрос — вершина, а ребро между двумя
            вершинами появляется, если их эмбеддинги имеют косинусное сходство
            выше порога (threshold). Кластерами считаются связанные компоненты
            графа, содержащие как минимум две вершины.
          </p>
          <p class="mb-2">
            <strong>Когда использовать</strong><br />
            Быстрый и понятный метод для ситуаций с явными семантическими
            группами. Контролируется одним параметром — порогом сходства.
          </p>
          <p class="mb-2">
            <strong>Плюсы:</strong>
            простота и скорость.
          </p>
          <p class="mb-2">
            <strong>Минусы:</strong>
            при низком пороге возможен эффект «цепочки», когда несколько
            промежуточных фраз связывают большие группы в один кластер.
          </p>
        </div>

        <div class="mb-4">
          <h3 class="font-bold mb-2">
            DBSCAN (Density-Based Spatial Clustering)
          </h3>

          <p class="mb-2">
            Учитывает локальную плотность, защищает от эффекта цепочки, но
            сложнее настроить.
          </p>
          <p class="mb-2">
            <strong>Описание</strong><br />
            Кластеры формируются вокруг плотных областей в пространстве
            эмбеддингов. Точка становится ядром, если в окружности радиуса eps
            находится не менее minPts соседей по мере косинусного расстояния (1
            - сходство). Кластеры растут от таких ядер, а редкие точки считаются
            выбросами.
          </p>
          <p class="mb-2">
            <strong>Когда использовать</strong><br />
            Подходит, если нужно избежать эффекта цепочки и фильтровать
            одиночные, нерелевантные запросы. Требует настройки двух параметров
            (eps, minPts).
          </p>
          <p class="mb-2">
            <strong>Плюсы:</strong>
            устойчивость к эффекту цепочки и фильтрация шумовых точек.
          </p>
          <p class="mb-2">
            <strong>Минусы:</strong>
            требует подбора параметров, некоторые релевантные одиночные точки
            могут остаться не кластеризованными.
          </p>
        </div>

        <div class="text-xs text-gray-400 mt-2">
          <strong>Совет:</strong> для строгих кластеров попробуйте связные
          компоненты с threshold ≈ 0.8. Если кластеры получаются слишком
          большими — протестируйте DBSCAN с eps ≈ 0.2 и minPts = 2.
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { ElMessage } from "element-plus";
import { useProjectStore } from "../../../stores/project";
import { useKeywordsStore } from "../../../stores/keywords";
import { useClusteringWorker } from "../../../composables/useClusteringWorker";
import { useDexie } from "../../../composables/useDexie";
import OpenAI from "openai";

const props = defineProps({});
const emit = defineEmits(["close-dialog"]);

const project = useProjectStore();
const keywordsStore = useKeywordsStore();
const clusteringWorker = useClusteringWorker();
const dexie = useDexie();

const drawer = ref(false);
const isClusteringRunning = ref(false);

const embeddingProgress = ref({
  fetched: 0,
  total: 0,
  percent: 0,
  source: "cache" as "cache" | "openai",
});
const clusteringProgress = ref({
  processed: 0,
  total: 0,
  percent: 0,
});

const form = ref({
  algorithm: "components", // 'components' or 'dbscan'
});

// Slider values
const thresholdValue = ref(0.8);
const dbscanEps = ref(0.3);
const dbscanMinPts = ref(2);

// Locale-safe number coercion [0,1]
function toNumber01(x) {
  const n =
    typeof x === "number" ? x : Number(String(x ?? "").replace(",", "."));
  if (!isFinite(n) || isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// Persist settings changes
watch(
  () => [
    form.value.algorithm,
    thresholdValue.value,
    dbscanEps.value,
    dbscanMinPts.value,
  ],
  () => {
    persistToProject();
  },
  { deep: true },
);

function persistToProject() {
  const projectId =
    project.currentProjectId || (project.data && project.data.id);
  if (!projectId) return;
  try {
    if (!project.data) project.data = {};
    project.data.clustering_threshold = toNumber01(thresholdValue.value);
    project.data.clustering_algorithm = form.value.algorithm;
    project.data.clustering_dbscan_eps = toNumber01(dbscanEps.value);
    project.data.clustering_dbscan_minPts = Number(dbscanMinPts.value);
    project.updateProject();
  } catch (e) {
    console.warn("Failed to persist clustering params to project", e);
  }
}

// Initialize form from current project settings if available
if (project && project.data) {
  try {
    const threshold = toNumber01(project.data.clustering_threshold);
    const algorithm = project.data.clustering_algorithm;
    const dbscan_eps = project.data.clustering_dbscan_eps;
    const dbscan_minPts = project.data.clustering_dbscan_minPts;

    if (threshold) thresholdValue.value = threshold;
    if (algorithm) form.value.algorithm = String(algorithm);
    if (dbscan_eps) dbscanEps.value = Number(dbscan_eps);
    if (dbscan_minPts) dbscanMinPts.value = Number(dbscan_minPts);
  } catch (e) {
    // ignore
  }
}

// Update form when current project changes
watch(
  () => project.currentProjectId,
  (newId) => {
    if (!newId) return;
    try {
      const threshold = toNumber01(
        project.data && project.data.clustering_threshold,
      );
      const algorithm = project.data && project.data.clustering_algorithm;
      const dbscan_eps = project.data && project.data.clustering_dbscan_eps;
      const dbscan_minPts =
        project.data && project.data.clustering_dbscan_minPts;

      if (threshold) thresholdValue.value = threshold;
      if (algorithm) form.value.algorithm = String(algorithm);
      if (dbscan_eps) dbscanEps.value = Number(dbscan_eps);
      if (dbscan_minPts) dbscanMinPts.value = Number(dbscan_minPts);
    } catch (e) {}
  },
);

// Helper function to fetch embeddings with OpenAI
async function fetchEmbeddings(
  texts: string[],
  apiKey: string,
  onProgress?: (progress: {
    fetched: number;
    total: number;
    percent: number;
  }) => void,
): Promise<(number[] | null)[]> {
  const model = "text-embedding-3-small";
  const batchSize = 64;
  const results = new Array(texts.length).fill(null);
  let processedCount = 0;

  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  for (let start = 0; start < texts.length; start += batchSize) {
    const chunkTexts = texts.slice(start, start + batchSize);

    try {
      const response = await openai.embeddings.create({
        model,
        input: chunkTexts,
      });

      for (let i = 0; i < response.data.length; i++) {
        results[start + i] = response.data[i].embedding;
      }

      processedCount += chunkTexts.length;
      if (onProgress) {
        onProgress({
          fetched: processedCount,
          total: texts.length,
          percent: Math.round((processedCount / texts.length) * 100),
        });
      }
    } catch (error) {
      console.error("Failed to fetch embeddings batch:", error);
      throw error;
    }

    // Small delay between batches to avoid rate limiting
    if (start + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  return results;
}

// Load embeddings with cache (reused from ClassificationConfig pattern)
async function loadEmbeddingsWithCache(
  texts: string[],
  apiKey: string,
  onProgress?: (progress: {
    fetched: number;
    total: number;
    percent: number;
    source: "cache" | "openai";
  }) => void,
): Promise<(number[] | null)[]> {
  const model = "text-embedding-3-small";
  const results = new Array(texts.length).fill(null);
  const missingIndices: number[] = [];
  const missingTexts: string[] = [];
  let cachedCount = 0;

  // Step 1: Check cache first
  for (let i = 0; i < texts.length; i++) {
    const cached = await dexie.embeddingsCacheGet(texts[i], model);
    if (cached) {
      results[i] = cached;
      cachedCount++;
    } else {
      missingIndices.push(i);
      missingTexts.push(texts[i]);
    }
  }

  // Report initial cache hits
  if (onProgress && cachedCount > 0) {
    onProgress({
      fetched: cachedCount,
      total: texts.length,
      percent: Math.round((cachedCount / texts.length) * 100),
      source: "cache",
    });
  }

  // If all found in cache, return
  if (missingTexts.length === 0) {
    return results;
  }

  // Step 2: Fetch missing embeddings from OpenAI
  const missingEmbeddings = await fetchEmbeddings(
    missingTexts,
    apiKey,
    (progress) => {
      const totalFetched = cachedCount + progress.fetched;
      if (onProgress) {
        onProgress({
          fetched: totalFetched,
          total: texts.length,
          percent: Math.round((totalFetched / texts.length) * 100),
          source: "openai",
        });
      }
    },
  );

  // Step 3: Save fetched embeddings to cache and assign to results
  const toCache: Array<{ key: string; embedding: number[] }> = [];
  for (let i = 0; i < missingEmbeddings.length; i++) {
    const idx = missingIndices[i];
    const embedding = missingEmbeddings[i];
    if (embedding && Array.isArray(embedding)) {
      results[idx] = embedding;
      toCache.push({
        key: missingTexts[i],
        embedding,
      });
    }
  }

  // Bulk save to cache
  if (toCache.length > 0) {
    try {
      await dexie.embeddingsCacheBulkPut(toCache, model);
    } catch (e) {
      console.warn("Failed to save embeddings to cache:", e);
    }
  }

  return results;
}

// Обработчик запуска кластеризации
async function handleClusteringRun() {
  if (!project.currentProjectId) {
    ElMessage.error("Выберите проект");
    return;
  }

  // Get OpenAI API key for current project (same as ClassificationConfig)
  const apiKey = await project.getOpenaiApiKey();

  if (!apiKey) {
    ElMessage.error("Укажите OpenAI API ключ в настройках проекта");
    return;
  }

  const db = useDexie();
  await db.init();

  // Get ALL keywords for clustering from database (not just the visible store slice)
  const allProjectKeywords = await db.getKeywordsByProject(
    String(project.currentProjectId),
    {
      limit: 1000000, // Large enough to get all
    },
  );

  const targetKeywords = allProjectKeywords.filter(
    (kw) => kw.keyword && kw.keyword.trim().length > 0,
  );

  if (targetKeywords.length === 0) {
    ElMessage.warning("Нет ключевых слов для кластеризации");
    return;
  }

  console.log(
    `Clustering ${targetKeywords.length} keywords out of ${allProjectKeywords.length} total`,
  );

  // Close dialog and show progress
  await nextTick();
  emit("close-dialog");
  isClusteringRunning.value = true;

  try {
    // Reset progress
    embeddingProgress.value = {
      fetched: 0,
      total: targetKeywords.length,
      percent: 0,
      source: "cache",
    };
    clusteringProgress.value = {
      processed: 0,
      total: targetKeywords.length,
      percent: 0,
    };

    // Update keywords store progress
    keywordsStore.progress = {
      stage: "embeddings",
      fetched: 0,
      total: targetKeywords.length,
      percent: 0,
    };

    // Step 1: Get embeddings with caching
    const texts = targetKeywords.map((kw) => kw.keyword);
    const embeddings = await loadEmbeddingsWithCache(
      texts,
      apiKey,
      (progress) => {
        embeddingProgress.value = progress;
        keywordsStore.progress = {
          stage: "embeddings",
          fetched: progress.fetched,
          total: progress.total,
          percent: progress.percent,
        };
      },
    );

    // Prepare items for clustering
    const clusteringItems = targetKeywords
      .map((kw, idx) => ({
        id: String(kw.id),
        keyword: kw.keyword,
        embedding: embeddings[idx],
      }))
      .filter((item) => item.embedding && Array.isArray(item.embedding));

    if (clusteringItems.length === 0) {
      throw new Error("Не удалось получить эмбеддинги для ключевых слов");
    }

    // Update progress to clustering stage
    keywordsStore.progress = {
      stage: "clustering",
      processed: 0,
      total: clusteringItems.length,
      percent: 0,
    };

    // Step 2: Run clustering algorithm with progress tracking
    let clusterResults;
    if (form.value.algorithm === "dbscan") {
      clusterResults = await clusteringWorker.clusterWithDBSCAN(
        clusteringItems,
        dbscanEps.value,
        dbscanMinPts.value,
        (progress) => {
          // Update clustering progress from worker
          clusteringProgress.value = {
            processed: progress.processed || 0,
            total: progress.total || clusteringItems.length,
            percent: progress.percent || 0,
          };
          keywordsStore.progress = {
            stage: "clustering",
            processed: progress.processed || 0,
            total: progress.total || clusteringItems.length,
            percent: progress.percent || 0,
          };
        },
      );
    } else {
      clusterResults = await clusteringWorker.clusterWithComponents(
        clusteringItems,
        thresholdValue.value,
        (progress) => {
          // Update clustering progress from worker
          clusteringProgress.value = {
            processed: progress.processed || 0,
            total: progress.total || clusteringItems.length,
            percent: progress.percent || 0,
          };
          keywordsStore.progress = {
            stage: progress.stage === "graph" ? "building_graph" : "clustering",
            processed: progress.processed || progress.comparisons || 0,
            total: progress.total || clusteringItems.length,
            percent: progress.percent || 0,
          };
        },
      );
    }

    // Step 3: Update keywords with cluster results (batched for performance)
    const BATCH_SIZE = 100;
    const updateBatches = [];

    for (let i = 0; i < clusterResults.length; i += BATCH_SIZE) {
      updateBatches.push(clusterResults.slice(i, i + BATCH_SIZE));
    }

    let updatedCount = 0;
    keywordsStore.progress = {
      stage: "saving",
      processed: 0,
      total: clusterResults.length,
      percent: 0,
    };

    // Create a lookup map for faster processing
    const keywordMap = new Map();
    for (const kw of targetKeywords) {
      keywordMap.set(String(kw.id), kw);
    }

    for (const batch of updateBatches) {
      // Prepare keywords for batch update
      const keywordsToUpdate = batch
        .map((result) => {
          const keyword = keywordMap.get(String(result.id));
          if (keyword) {
            // Create a plain object copy to avoid Vue reactivity issues with IndexedDB
            return {
              ...keyword,
              cluster_label: result.cluster_label,
              cluster_score:
                result.cluster_score ?? (result.cluster > 0 ? 0.95 : 0.0),
            };
          }
          return null;
        })
        .filter((kw) => kw !== null);

      // Update batch in database
      for (const kw of keywordsToUpdate) {
        await db.updateKeyword(kw);
      }

      updatedCount += batch.length;
      keywordsStore.progress = {
        stage: "saving",
        processed: updatedCount,
        total: clusterResults.length,
        percent: Math.round((updatedCount / clusterResults.length) * 100),
      };
    }

    // Reload keywords to reflect changes in UI
    if (project.currentProjectId) {
      await keywordsStore.loadKeywords(String(project.currentProjectId), {
        offset: 0,
        limit: 300,
      });
    }

    // Clear progress
    keywordsStore.progress = null;

    ElMessage.success(
      `Кластеризация завершена. Создано ${Math.max(...clusterResults.map((r) => r.cluster))} кластеров`,
    );
  } catch (error) {
    console.error("Clustering error:", error);
    keywordsStore.progress = null;

    // Check for rate limiting
    if (error instanceof Error && error.message.includes("429")) {
      ElMessage.error("Превышен лимит запросов к OpenAI. Попробуйте позже.");
    } else {
      ElMessage.error(
        "Ошибка при кластеризации: " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  } finally {
    isClusteringRunning.value = false;
  }
}
</script>

<style scoped>
.clustering-config-container {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.clustering-slider :deep(.el-slider__runway) {
  background-color: var(--el-slider-main-bg-color) !important;
}

.clustering-slider :deep(.el-slider__bar) {
  background-color: var(--el-slider-runway-bg-color) !important;
}

.form-helper {
  width: 100%;
}

.clustering-action-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 24px;
  box-sizing: border-box;
  width: 100%;
}

.clustering-action-row .el-button {
  min-width: 200px;
}
</style>
