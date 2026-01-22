<template>
  <div>
    <!-- Training Section -->
    <el-collapse class="mb-4">
      <el-collapse-item name="training">
        <template #title>
          <div style="display: flex; align-items: center; gap: 8px">
            <span>{{ t("classification.training_title") }}</span>
            <el-tag v-if="typingStore.isTraining" type="info">
              {{ trainingProgress }}%
            </el-tag>
          </div>
        </template>

        <div class="p-4">
          <p class="text-sm text-gray-500 mb-4">
            {{ t("classification.training_description") }}
          </p>

          <!-- Training Status -->
          <div v-if="trainingStatus" class="mb-4 p-3 bg-blue-50 rounded">
            <p class="text-sm text-blue-700">{{ trainingStatus }}</p>
          </div>

          <el-form :model="trainingOptions" label-width="120px" class="mb-4">
            <el-form-item label="Epochs">
              <el-input-number
                v-model="trainingOptions.epochs"
                :min="50"
                :max="2000"
                :step="50"
              />
            </el-form-item>
            <el-form-item label="Learning Rate">
              <el-input-number
                v-model="trainingOptions.lr"
                :min="0.001"
                :max="1"
                :step="0.01"
              />
            </el-form-item>
            <el-form-item label="Batch Size">
              <el-input-number
                v-model="trainingOptions.batchSize"
                :min="4"
                :max="128"
                :step="4"
              />
            </el-form-item>
            <el-form-item label="L2 Regularization">
              <el-input-number
                v-model="trainingOptions.reg"
                :min="0"
                :max="0.1"
                :step="0.0001"
              />
            </el-form-item>
          </el-form>

          <el-button
            type="primary"
            :loading="typingStore.isTraining"
            :disabled="!canTrain"
            @click="startTraining"
          >
            {{
              typingStore.isTraining
                ? t("classification.training")
                : t("classification.train_button")
            }}
          </el-button>

          <el-button v-if="typingStore.model" text @click="clearModel">
            {{ t("classification.clear_model") }}
          </el-button>

          <el-button text @click="closeDialog">
            {{ t("close") || "Закрыть" }}
          </el-button>

          <div v-if="typingStore.model" class="mt-4 p-3 bg-green-50 rounded">
            <p class="text-sm font-semibold text-green-700">
              {{ t("classification.model_ready") }}
            </p>
            <p class="text-xs text-green-600 mt-1">
              Classes: {{ typingStore.model.labels.join(", ") }}
            </p>
          </div>

          <div v-if="trainingError" class="mt-4 p-3 bg-red-50 rounded">
            <p class="text-sm font-semibold text-red-700">
              {{ t("classification.training_error") }}
            </p>
            <p class="text-xs text-red-600 mt-1">{{ trainingError }}</p>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>

    <!-- Prediction Section -->
    <el-collapse v-if="typingStore.model" class="mb-4">
      <el-collapse-item name="prediction">
        <template #title>
          <span>{{ t("classification.prediction_title") }}</span>
        </template>

        <div class="p-4">
          <p class="text-sm text-gray-500 mb-4">
            {{ t("classification.prediction_description") }}
          </p>

          <div class="flex gap-2 mb-4">
            <el-input
              v-model="predictionInput"
              :placeholder="t('classification.prediction_placeholder')"
              @keyup.enter="makePrediction"
            />
            <el-button
              type="primary"
              :loading="isPredicting"
              @click="makePrediction"
            >
              {{ t("classification.predict_button") }}
            </el-button>
          </div>

          <div v-if="predictionResult" class="p-3 bg-blue-50 rounded">
            <p class="text-sm font-semibold text-blue-700">
              {{ t("classification.prediction_result") }}:
              <span class="text-lg">{{ predictionResult.label }}</span>
            </p>
            <p class="text-xs text-blue-600 mt-2">
              Confidence: {{ (predictionResult.score * 100).toFixed(1) }}%
            </p>
            <div class="mt-3">
              <p class="text-xs font-semibold text-blue-700 mb-2">
                Probabilities:
              </p>
              <div
                v-for="(prob, idx) in predictionResult.probs"
                :key="idx"
                class="flex items-center gap-2 text-xs"
              >
                <span class="w-20">{{ typingStore.model?.labels[idx] }}:</span>
                <el-progress
                  :percentage="Math.round(prob * 100)"
                  :color="getProgressColor(prob)"
                />
              </div>
            </div>
          </div>

          <div v-if="predictionError" class="mt-4 p-3 bg-red-50 rounded">
            <p class="text-sm font-semibold text-red-700">
              {{ t("classification.prediction_error") }}
            </p>
            <p class="text-xs text-red-600 mt-1">{{ predictionError }}</p>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "../../../stores/project";
import { useTypingStore } from "../../../stores/typing";
import { useKeywordsStore } from "../../../stores/keywords";
import { useClassificationWorker } from "../../../composables/useClassificationWorker";
import { ClassificationService } from "../../../services/classificationService";

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const project = useProjectStore();
const typingStore = useTypingStore();
const keywordsStore = useKeywordsStore();
const {
  train,
  predict: workerPredict,
  fetchEmbeddings,
} = useClassificationWorker();

const trainingOptions = ref({
  epochs: 500,
  lr: 0.1,
  batchSize: 32,
  reg: 1e-4,
});

const trainingProgress = ref(0);
const trainingError = ref<string | null>(null);
const trainingStatus = ref<string | null>(null);
const predictionInput = ref("");
const predictionResult = ref<any>(null);
const predictionError = ref<string | null>(null);
const isPredicting = ref(false);
const classificationService = ref<ClassificationService | null>(null);

// TODO: Get API key from settings
const apiKey = ref("");

const canTrain = computed(() => {
  // Требуем только достаточное число примеров и хотя бы два класса;
  // API-ключ подтягиваем внутри startTraining перед запуском.
  return (
    typingStore.samples.length > 0 &&
    new Set(typingStore.samples.map((s) => s.label)).size > 1
  );
});

const startTraining = async () => {
  if (!canTrain.value) {
    ElMessage.warning(t("classification.need_samples_and_key"));
    return;
  }

  // Get the current project's API key before starting
  const projectApiKey = await project.getOpenaiApiKey();
  if (!projectApiKey) {
    ElMessage.error(
      t("classification.api_key_required") || "Требуется API ключ OpenAI",
    );
    return;
  }
  apiKey.value = projectApiKey;

  typingStore.isTraining = true;
  typingStore.trainingProgress = 0;
  trainingError.value = null;
  trainingStatus.value = null;
  trainingProgress.value = 0;

  // Close the dialog immediately after starting
  closeDialog();

  // Update keywordsStore to show progress in parent component
  keywordsStore.typingRunning = true;
  keywordsStore.typingPercent = 0;
  keywordsStore.currentProcessLabel = "Определение класса";

  try {
    // Initialize service
    classificationService.value = new ClassificationService(apiKey.value);

    classificationService.value.setProgressCallback((update) => {
      trainingProgress.value = update.percent;
      typingStore.trainingProgress = update.percent;
      keywordsStore.typingPercent = update.percent;
      if (update.message) {
        trainingStatus.value = update.message;
        keywordsStore.currentProcessLabel = update.message;
      }
    });

    // Run full pipeline with worker
    const result = await classificationService.value.runFullPipeline(
      typingStore.samples,
      [], // no keywords for training phase
      { train, predict: workerPredict, fetchEmbeddings },
    );

    typingStore.model = result.model;

    // Classify all keywords in the current project
    if (project.currentProjectId && typingStore.model) {
      try {
        keywordsStore.currentProcessLabel = "Получение ключевых слов...";

        // Get all keywords for the project
        const keywords = await keywordsStore.getKeywordsByProject(
          project.currentProjectId,
        );

        if (keywords && keywords.length > 0) {
          keywordsStore.currentProcessLabel = `Классификация ключевых слов (0/${keywords.length})`;
          ElMessage.info(
            `Начало классификации ${keywords.length} ключевых слов...`,
          );

          // Classify each keyword
          const updatedKeywords = [];

          for (let i = 0; i < keywords.length; i++) {
            const keyword = keywords[i];
            try {
              const prediction = await workerPredict(
                keyword.keyword,
                typingStore.model,
                apiKey.value,
              );

              updatedKeywords.push({
                ...keyword,
                classification_label: prediction.label,
                classification_score: prediction.score,
              });

              // Update progress
              keywordsStore.currentProcessLabel = `Классификация ключевых слов (${i + 1}/${keywords.length})`;
              keywordsStore.typingPercent = Math.round(
                ((i + 1) / keywords.length) * 100,
              );
            } catch (e) {
              console.warn(
                `Failed to classify keyword "${keyword.keyword}":`,
                e,
              );
              updatedKeywords.push(keyword);
            }
          }

          // Save updated keywords to database
          if (updatedKeywords.length > 0) {
            keywordsStore.currentProcessLabel = "Сохранение результатов...";
            await keywordsStore.bulkUpdateKeywords(updatedKeywords);
            ElMessage.success(
              `Классифицировано ${updatedKeywords.length} ключевых слов`,
            );
          }
        } else {
          ElMessage.info("Нет ключевых слов для классификации");
        }
      } catch (classifyError) {
        console.warn("Error during keyword classification:", classifyError);
        ElMessage.warning(
          "Модель обучена, но не удалось классифицировать ключевые слова",
        );
      }
    }

    ElMessage.success(t("classification.training_complete"));
    predictionResult.value = null;
  } catch (error) {
    trainingError.value =
      error instanceof Error ? error.message : String(error);
    ElMessage.error(
      `${t("classification.training_error")}: ${trainingError.value}`,
    );
  } finally {
    typingStore.isTraining = false;
    keywordsStore.typingRunning = false;
    keywordsStore.typingPercent = 0;
    keywordsStore.currentProcessLabel = null;
    typingStore.trainingProgress = 0;
    trainingStatus.value = null;
  }
};

const makePrediction = async () => {
  if (!predictionInput.value.trim() || !typingStore.model) {
    ElMessage.warning(t("classification.enter_text"));
    return;
  }

  isPredicting.value = true;
  predictionError.value = null;

  try {
    predictionResult.value = await workerPredict(
      predictionInput.value,
      typingStore.model,
      apiKey.value,
    );
  } catch (error) {
    predictionError.value =
      error instanceof Error ? error.message : String(error);
    ElMessage.error(
      `${t("classification.prediction_error")}: ${predictionError.value}`,
    );
  } finally {
    isPredicting.value = false;
  }
};

const clearModel = () => {
  typingStore.model = null;
  classificationService.value = null;
  predictionResult.value = null;
  ElMessage.success(t("classification.model_cleared"));
};

const closeDialog = () => {
  emit("close");
};

const getProgressColor = (value: number) => {
  if (value > 0.7) return "#67C23A";
  if (value > 0.4) return "#E6A23C";
  return "#F56C6C";
};
</script>

<style scoped>
.p-4 {
  padding: 16px;
}

.p-3 {
  padding: 12px;
}

.rounded {
  border-radius: 4px;
}

.bg-green-50 {
  background-color: #f6ffed;
}

.bg-red-50 {
  background-color: #fef0f0;
}

.bg-blue-50 {
  background-color: #f0f9ff;
}

.text-green-700 {
  color: #52c41a;
}

.text-green-600 {
  color: #389e0d;
}

.text-red-700 {
  color: #f5222d;
}

.text-red-600 {
  color: #d9001b;
}

.text-blue-700 {
  color: #1890ff;
}

.text-blue-600 {
  color: #0050b3;
}

.text-gray-500 {
  color: #8c8c8c;
}

.text-xs {
  font-size: 12px;
}

.text-sm {
  font-size: 14px;
}

.text-lg {
  font-size: 18px;
}

.font-semibold {
  font-weight: 600;
}

.gap-2 {
  gap: 8px;
}

.gap-8 {
  gap: 32px;
}

.mb-2 {
  margin-bottom: 8px;
}

.mb-4 {
  margin-bottom: 16px;
}

.mt-1 {
  margin-top: 4px;
}

.mt-2 {
  margin-top: 8px;
}

.mt-3 {
  margin-top: 12px;
}

.mt-4 {
  margin-top: 16px;
}

.w-20 {
  width: 80px;
}

.flex {
  display: flex;
}

.items-center {
  align-items: center;
}
</style>
