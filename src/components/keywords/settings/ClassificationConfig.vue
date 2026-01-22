<template>
  <div class="classification-config-container">
    <div class="mt-2">
      <div class="mb-3">
        <el-button type="primary" link size="small" @click="drawer = true">
          Как это работает?
        </el-button>
      </div>

      <el-divider content-position="center">{{
        t("classification.add_class")
      }}</el-divider>

      <div
        class="py-2 items-center flex add-class-row"
        style="margin-bottom: 24px"
      >
        <div class="w-64 mr-2">
          <el-input
            :placeholder="t('classification.name_placeholder')"
            v-model="sampleLabel"
          />
        </div>

        <div class="flex-1 mr-2" style="min-width: 200px">
          <el-input-tag
            v-model="input"
            draggable
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="10"
            :placeholder="t('classification.description_placeholder')"
            :delimiter="delimiter"
            v-multi-paste="{ mode: 'add' }"
            @change="(val) => onInputChange(val)"
          />
        </div>

        <div class="text-right" style="flex-shrink: 0">
          <el-button type="primary" plain @click="addSamples">{{
            t("classification.add_button")
          }}</el-button>
        </div>
      </div>

      <el-collapse
        accordion
        v-model="activeName"
        expand-icon-position="left"
        class="mb-4"
      >
        <el-collapse-item
          v-for="row in groupedSamples"
          :key="row.label"
          :name="String(row.label)"
        >
          <template #title>
            <div
              style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
              "
            >
              <div style="display: flex; align-items: center; gap: 8px">
                <span style="font-weight: 600">{{ row.label }}</span>
                <el-tag size="small" type="">{{
                  phrases(row.text).length
                }}</el-tag>
                <span style="margin-left: 6px">
                  <template
                    v-if="
                      rowStatus[String(row.label)] &&
                      rowStatus[String(row.label)].state === 'saving'
                    "
                  >
                    <el-icon style="vertical-align: middle"
                      ><Loading
                    /></el-icon>
                  </template>
                  <template
                    v-else-if="
                      rowStatus[String(row.label)] &&
                      rowStatus[String(row.label)].state === 'saved'
                    "
                  >
                    <small style="color: var(--el-color-success)">{{
                      t("classification.saved")
                    }}</small>
                  </template>
                  <template
                    v-else-if="
                      rowStatus[String(row.label)] &&
                      rowStatus[String(row.label)].state === 'error'
                    "
                  >
                    <small style="color: var(--el-color-danger)">{{
                      rowStatus[String(row.label)].message ||
                      t("classification.save_error")
                    }}</small>
                  </template>
                </span>
              </div>
              <div>
                <el-button
                  type="danger"
                  text
                  :icon="Delete"
                  circle
                  @click.stop="deleteRow(row)"
                ></el-button>
                <!-- edit inline directly; tags are editable by default -->
              </div>
            </div>
          </template>

          <div style="margin-bottom: 8px">
            <el-input-tag
              v-model="rowTags[String(row.label)]"
              draggable
              collapse-tags
              collapse-tags-tooltip
              :max-collapse-tags="10"
              :placeholder="t('classification.edit_placeholder')"
              :delimiter="delimiter"
              v-multi-paste="{ mode: 'row', row }"
              class="fixed-input-tag"
              @paste="(e) => handleRowPaste(e, row)"
              @change="(val) => onTagsChange(row, val)"
            />
          </div>
        </el-collapse-item>
      </el-collapse>

      <!-- Classification action button -->
      <div class="classification-action-row">
        <small
          v-if="typingStore.samples.length === 0"
          style="color: var(--el-color-info); margin-right: 16px"
        >
          Добавьте обучающие примеры
        </small>
        <el-button
          type="primary"
          size="large"
          @click="handleClassificationRun"
          :loading="isClassificationRunning"
          :disabled="!canRunClassification || typingStore.samples.length === 0"
        >
          {{ t("classification.run_button") || "Запустить определение класса" }}
        </el-button>
      </div>
    </div>

    <el-drawer v-model="drawer" direction="rtl" :size="1000">
      <template #header>
        <div class="title-wrapper">
          <span>Как работает классификация запросов</span>
        </div>
      </template>
      <div class="text-sm" style="overflow-y: auto">
        <div class="mb-2">
          <strong>{{ t("classification.goal") }}</strong
          ><br />
          {{ t("classification.goalDescription") }}
          <br /><br />
          <strong>{{ t("classification.descriptionTitle") }}</strong
          ><br />
          {{ t("classification.description") }}
        </div>
        <div>
          <strong>{{ t("classification.algorithmTitle") }}</strong
          ><br />
          <div class="algorithm-steps">
            {{ t("classification.algorithmSteps") }}
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  ref,
  onMounted,
  onUnmounted,
  watch,
  computed,
  nextTick,
  toRaw,
} from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Delete, InfoFilled, Loading, Check } from "@element-plus/icons-vue";
import {
  ElInputTag,
  ElCollapse,
  ElCollapseItem,
  ElTag,
  ElIcon,
} from "element-plus";
import { useProjectStore } from "../../../stores/project";
import { useTypingStore } from "../../../stores/typing";
import { useKeywordsStore } from "../../../stores/keywords";
import { useClassificationWorker } from "../../../composables/useClassificationWorker";
import { useDexie } from "../../../composables/useDexie";
import { useI18n } from "vue-i18n";

export default defineComponent({
  name: "ClassificationConfig",
  components: {
    ElInputTag,
    ElCollapse,
    ElCollapseItem,
    ElTag,
    ElIcon,
    // icons
    InfoFilled,
    Delete,
    Loading,
    Check,
  },
  emits: ["close-dialog"],
  directives: {
    multiPaste: {
      mounted(el, binding) {
        const handler = (e) => {
          try {
            if (!e.clipboardData) return;
            const text = e.clipboardData.getData("text");
            if (!text) return;
            // Only intercept if multiline (contains \n or \r) OR tabs
            if (!/[\r\n\t]/.test(text)) return; // allow default single-line paste
            e.preventDefault();
            const { instance } = binding;
            if (!instance) return;
            const { mode, row } = binding.value || {};
            // helpers to support both proxied (unwrapped) properties and refs
            const readProp = (name) => {
              try {
                const v = instance[name];
                // If it's a ref object with .value, return that, else return as-is
                if (
                  v &&
                  typeof v === "object" &&
                  Object.prototype.hasOwnProperty.call(v, "value")
                )
                  return v.value;
                return v;
              } catch (err) {
                return undefined;
              }
            };
            const writeProp = (name, val) => {
              try {
                const v = instance[name];
                if (
                  v &&
                  typeof v === "object" &&
                  Object.prototype.hasOwnProperty.call(v, "value")
                ) {
                  v.value = val;
                } else {
                  // proxy unwrap: assign back to property (may not persist across proxies, but works for our usage)
                  instance[name] = val;
                }
              } catch (err) {
                // ignore
              }
            };
            const MAX_LEN = readProp("MAX_LEN") || 100; // fallback
            // Split: newlines first, then commas inside each line
            let parts = text
              .split(/\r?\n/)
              .map((s) => s.split(/[，,]/))
              .flat()
              .map((s) => (s == null ? "" : String(s).trim()))
              .filter(Boolean);
            if (!parts.length) return;
            const before = parts.length;
            parts = parts.filter((s) => s.length <= MAX_LEN);
            const discarded = before - parts.length;
            if (discarded > 0 && instance.ElMessage && instance.t) {
              instance.ElMessage.error(
                instance.t("classification.phrase_too_long", {
                  max: MAX_LEN,
                }) || `Phrases longer than ${MAX_LEN} characters were removed`,
              );
            }
            if (mode === "add") {
              const current = Array.isArray(readProp("input"))
                ? readProp("input").slice()
                : [];
              const merged = [...current, ...parts];
              writeProp("input", merged);
              // call handler if available
              const onInput =
                instance.onInputChange || readProp("onInputChange");
              if (typeof onInput === "function") onInput(merged);
            } else if (mode === "row" && row && row.label != null) {
              const id = String(row.label);
              const currentRowStore = readProp("rowTags") || {};
              const currentRow = Array.isArray(currentRowStore[id])
                ? currentRowStore[id].slice()
                : [];
              const merged = [...currentRow, ...parts];
              // write back
              if (
                readProp("rowTags") &&
                typeof readProp("rowTags") === "object"
              ) {
                // if it's a ref, writeProp will handle
                const rt = instance.rowTags;
                if (
                  rt &&
                  typeof rt === "object" &&
                  Object.prototype.hasOwnProperty.call(rt, "value")
                ) {
                  const copy = Object.assign({}, rt.value || {});
                  copy[id] = merged;
                  rt.value = copy;
                } else {
                  // unwrapped proxy
                  const obj = Object.assign({}, currentRowStore || {});
                  obj[id] = merged;
                  writeProp("rowTags", obj);
                }
              } else {
                writeProp("rowTags", { [id]: merged });
              }
              const onTags = instance.onTagsChange || readProp("onTagsChange");
              if (typeof onTags === "function") onTags(row, merged);
            }
          } catch (err) {
            // silent
          }
        };
        el.__multiPasteHandler__ = handler;
        // Attach on root; attempt also on inner input when available
        el.addEventListener("paste", handler);
        // Attempt to bind to inner input (Element Plus renders an input inside)
        setTimeout(() => {
          const inner = el.querySelector && el.querySelector("input");
          if (inner) inner.addEventListener("paste", handler);
        }, 0);
      },
      beforeUnmount(el) {
        const handler = el.__multiPasteHandler__;
        if (handler) {
          el.removeEventListener("paste", handler);
          const inner = el.querySelector && el.querySelector("input");
          if (inner) inner.removeEventListener("paste", handler);
        }
        delete el.__multiPasteHandler__;
      },
    },
  },
  setup(_, { emit }) {
    const sampleLabel = ref("");
    const sampleText = ref("");
    const input = ref([]);
    const activeName = ref(null);
    const rowTags = ref({});
    const rowStatus = ref({});
    const editingLabels = ref(new Set());
    const isClassificationRunning = ref(false);
    const drawer = ref(false);
    const project = useProjectStore();
    const typingStore = useTypingStore();
    const keywordsStore = useKeywordsStore();
    const dexie = useDexie();
    const {
      train,
      predict: workerPredict,
      fetchEmbeddings,
    } = useClassificationWorker();
    // delimiter for el-input-tag: split on commas or newlines
    const delimiter = /[,\n]+/;
    const MAX_LEN = 100; // expose via instance (used in directive)

    function phrases(text) {
      if (!text) return [];
      return String(text)
        .split(delimiter)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // Safely serialize model for worker transfer
    function serializeModel(model: any) {
      if (!model) return null;
      try {
        // Use toRaw to remove Vue reactivity wrapper
        const rawModel = toRaw(model);

        // Deep clone through JSON to catch serialization issues and remove reactivity
        const cleaned = {
          W: Array.isArray(rawModel.W)
            ? JSON.parse(JSON.stringify(rawModel.W))
            : null,
          b: Array.isArray(rawModel.b)
            ? JSON.parse(JSON.stringify(rawModel.b))
            : null,
          labels: Array.isArray(rawModel.labels)
            ? JSON.parse(JSON.stringify(rawModel.labels))
            : null,
          D: typeof rawModel.D === "number" ? rawModel.D : 0,
          model_version:
            typeof rawModel.model_version === "string"
              ? rawModel.model_version
              : "",
        };
        return cleaned;
      } catch (e) {
        console.error("Failed to serialize model:", e);
        console.error("Model structure:", model);
        return null;
      }
    }

    // Load embeddings with persistent cache support
    // Алгоритм классификации с кэшированием эмбеддингов:
    // 1. Загрузка обучающих образцов - выполняется в runFullPipeline
    // 2. Кэширование эмбеддингов:
    //    - Функция fetchWithCache() для каждого текста:
    //      a) Проверяет кэш: embeddingsCacheGet(key, model) в таблице embeddings_cache
    //      b) Если найден → возвращает из кэша (источник: "cache")
    //      c) Если не найден → добавляет в missingIdx для загрузки
    // 3. Загрузка недостающих эмбеддингов:
    //    - После загрузки из OpenAI сохраняет в кэш: embeddingsCacheBulkPut()
    // 4. Обучение модели:
    //    - Создаёт логистическую регрессию (logreg_v2) на эмбеддингах обучающего набора
    //    - Сохраняет обученную модель в БД
    // 5. Классификация запросов:
    //    - Отслеживание источника: каждое эмбеддинг отмечается как из кэша или загруженное с OpenAI
    //    - Пакетная обработка: эмбеддинги загружаются батчами по 64 шт.
    //    - Прогресс: отправляются сообщения о ходе выполнения с полем source
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
      const missingEmbeddings = await fetchEmbeddings(missingTexts, apiKey, {
        onEmbedProgress: (progress) => {
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
      });

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

    // Группируем записи по label, чтобы в UI был один блок на метку
    const groupedSamples = computed(() => {
      const map = new Map();
      for (const s of typingStore.samples || []) {
        if (!s || !s.label) continue;
        const label = String(s.label);
        const arr = map.get(label) || [];
        // каждая запись сейчас одна фраза в text
        const txt = (s.text || "").trim();
        if (txt) arr.push(txt);
        map.set(label, arr);
      }
      const list = [];
      for (const [label, arr] of map.entries()) {
        list.push({ label, text: arr.join(", ") });
      }
      return list;
    });

    // Синхронизация БД для одной метки: минимально дифф-операции (удаляем только лишние, добавляем недостающие)
    async function syncLabelPhrases(label, phrasesArr) {
      const pid = project.currentProjectId;
      if (!pid || !label) return;
      try {
        // Получаем текущие записи для метки (локально из store)
        const current = (typingStore.samples || []).filter(
          (s) => s && s.label === label,
        );

        // Нормализованный набор желаемых фраз
        const desired = (Array.isArray(phrasesArr) ? phrasesArr : [])
          .map((p) =>
            String(p || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean);

        // Если нет желаемых фраз — удаляем все текущие записи
        if (desired.length === 0) {
          for (const rec of current) {
            if (rec && rec.id) await typingStore.deleteSample(pid, rec.id);
          }
          return;
        }

        // Map current texts -> records (text already stored lowercase by backend)
        const currentMap = new Map();
        for (const rec of current) {
          const txt =
            rec && rec.text ? String(rec.text).trim().toLowerCase() : null;
          if (!txt) continue;
          // keep list of records per text (should be unique, but safe)
          const arr = currentMap.get(txt) || [];
          arr.push(rec);
          currentMap.set(txt, arr);
        }

        // 1) Delete current records that are not in desired
        for (const rec of current) {
          const txt =
            rec && rec.text ? String(rec.text).trim().toLowerCase() : null;
          if (!txt) {
            if (rec && rec.id) await typingStore.deleteSample(pid, rec.id);
            continue;
          }
          if (!desired.includes(txt)) {
            // remove this obsolete row
            if (rec && rec.id) await typingStore.deleteSample(pid, rec.id);
          }
        }

        // 2) For each desired phrase, ensure there's at least one DB row
        const toAdd = [];
        for (const d of desired) {
          const have = currentMap.get(d);
          if (!have || have.length === 0) {
            toAdd.push({ label, text: d });
          }
        }

        if (toAdd.length > 0) {
          // addSamples accepts array of {label, text}
          await typingStore.addSamples(pid, toAdd);
        }
      } catch (e) {
        console.error("Error in syncLabelPhrases:", e);
      }
    }

    const { t } = useI18n();

    function deleteRow(row) {
      if (!row || !row.label) return;
      ElMessageBox.confirm(
        t("classification.delete_confirm", { label: row.label }),
        t("сonfiguration"),
        {
          confirmButtonText: t("delete"),
          cancelButtonText: t("cancel") || "Отмена",
          type: "warning",
        },
      ).then(() => {
        const pid = project.currentProjectId;
        // delete all samples for this label in one DB call to avoid many IPC requests
        if (pid) typingStore.deleteSamplesByLabel(pid, row.label);
      });
    }

    // Simple debounce helper
    function debounce(fn, wait = 300) {
      let t = null;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    }

    // helper normalize phrases: lowercase + dedup (order preserved)
    function normalizeList(arr) {
      const out = [];
      const seen = new Set();
      for (const raw of arr) {
        const p = (raw == null ? "" : String(raw)).trim().toLowerCase();
        if (!p) continue;
        if (p.length > MAX_LEN) continue;
        if (seen.has(p)) continue;
        seen.add(p);
        out.push(p);
      }
      return out;
    }

    // Save tags for a row: update the sample text in DB via store
    const saveTagsImmediate = (rowKey, tags) => {
      const pid = project.currentProjectId;
      if (!pid || !rowKey) return;
      const arr = Array.isArray(tags) ? tags.slice() : [];
      const normalized = normalizeList(arr);

      // reflect normalized state in UI model
      rowTags.value[String(rowKey)] = normalized;
      // set status saving
      rowStatus.value[String(rowKey)] = { state: "saving" };
      // перезаписываем записи для данной метки
      syncLabelPhrases(String(rowKey), normalized)
        .then(() => {
          rowStatus.value[String(rowKey)] = { state: "saved" };
          editingLabels.value.delete(String(rowKey));
          setTimeout(() => {
            if (
              rowStatus.value[String(rowKey)] &&
              rowStatus.value[String(rowKey)].state === "saved"
            )
              delete rowStatus.value[String(rowKey)];
          }, 1500);
        })
        .catch((err) => {
          rowStatus.value[String(rowKey)] = {
            state: "error",
            message: err && err.message ? err.message : null,
          };
          editingLabels.value.delete(String(rowKey));
        });
    };

    const saveTags = debounce(saveTagsImmediate, 500);

    // no toggle: tags are editable inline by default

    function onTagsChange(row, newTags) {
      const id = String(row.label);
      editingLabels.value.add(id);
      const arr = Array.isArray(newTags) ? newTags.slice() : [];
      const before = arr.slice();
      const normalized = normalizeList(arr);
      const removed = before.filter((p) => {
        const low = (p || "").trim().toLowerCase();
        if (!low) return true;
        if (low.length > MAX_LEN) return true;
        if (!normalized.includes(low)) return true;
        return false;
      });
      if (removed.length) {
        const shown = new Set();
        removed.forEach((r) => {
          const low = (r || "").trim().toLowerCase();
          if (shown.has(low)) return;
          shown.add(low);
          if (low.length > MAX_LEN) {
            ElMessage.error(
              t("classification.phrase_too_long", { max: MAX_LEN }) ||
                `Phrases longer than ${MAX_LEN} characters were removed`,
            );
          } else {
            ElMessage.error(
              t("classification.duplicate_removed", { phrase: r }) ||
                `Duplicate phrase removed: ${r}`,
            );
          }
        });
      }
      rowTags.value[id] = normalized;
      saveTags(id, normalized);
    }

    // Explicit paste handler for per-row tags (fallback if directive missed inner input)
    function handleRowPaste(e, row) {
      try {
        if (!row || row.label == null) return;
        const data = e && e.clipboardData && e.clipboardData.getData("text");
        if (!data) return;
        // Process only if multiline or tabs present
        if (!/[\r\n\t]/.test(data)) return; // allow normal paste for single line
        e.preventDefault();
        let parts = data
          .split(/\r?\n/)
          .map((s) => s.split(/[，,]/))
          .flat()
          .map((s) => (s == null ? "" : String(s).trim()))
          .filter(Boolean);
        if (!parts.length) return;
        const before = parts.length;
        parts = parts.filter((s) => s.length <= MAX_LEN);
        const discarded = before - parts.length;
        if (discarded > 0) {
          ElMessage.error(
            t("classification.phrase_too_long", { max: MAX_LEN }) ||
              `Phrases longer than ${MAX_LEN} characters were removed`,
          );
        }
        const id = String(row.label);
        const current = Array.isArray(rowTags.value[id])
          ? rowTags.value[id].slice()
          : [];
        const merged = [...current, ...parts];
        rowTags.value[id] = merged;
        onTagsChange(row, merged); // will trigger debounced save
      } catch (err) {
        // silent
      }
    }

    // Handle change on the add-sample input to enforce MAX_LEN immediately
    function onInputChange(newTags) {
      const arr = Array.isArray(newTags) ? newTags.slice() : [];
      const before = arr.slice();
      const normalized = normalizeList(arr);
      const removed = before.filter((p) => {
        const low = (p || "").trim().toLowerCase();
        if (!low) return true;
        if (low.length > MAX_LEN) return true;
        if (!normalized.includes(low)) return true;
        return false;
      });
      if (removed.length) {
        const shown = new Set();
        removed.forEach((r) => {
          const low = (r || "").trim().toLowerCase();
          if (shown.has(low)) return;
          shown.add(low);
          if (low.length > MAX_LEN) {
            ElMessage.error(
              t("classification.phrase_too_long", { max: MAX_LEN }) ||
                `Phrases longer than ${MAX_LEN} characters were removed`,
            );
          } else {
            ElMessage.error(
              t("classification.duplicate_removed", { phrase: r }) ||
                `Duplicate phrase removed: ${r}`,
            );
          }
        });
      }
      input.value = normalized;
    }

    // Truncation/normalization is handled immediately in onTagsChange and in saveTagsImmediate

    function deleteAll() {
      if (!typingStore.samples || typingStore.samples.length === 0) {
        ElMessage.warning(t("classification.empty_warning"));
        return;
      }
      ElMessageBox.confirm(
        t("classification.delete_all_confirm", {
          count: typingStore.samples.length,
        }),
        t("сonfiguration"),
        {
          confirmButtonText: t("delete"),
          cancelButtonText: t("cancel") || "Отмена",
          type: "warning",
        },
      ).then(() => {
        typingStore.clearSamples(project.currentProjectId);
      });
    }

    async function addSamples() {
      if (!project.currentProjectId) {
        ElMessage.error(t("select_project") || "Выберите проект");
        return;
      }
      const label = (sampleLabel.value || "").trim();
      // normalize input.value array and remove phrases longer than MAX_LEN
      let inputArr = Array.isArray(input.value) ? input.value.slice() : [];
      const before = inputArr.slice();
      const normalized = normalizeList(inputArr);
      const removed = before.filter((p) => {
        const low = (p || "").trim().toLowerCase();
        if (!low) return true;
        if (low.length > MAX_LEN) return true;
        if (!normalized.includes(low)) return true;
        return false;
      });
      if (removed.length) {
        const shown = new Set();
        removed.forEach((r) => {
          const low = (r || "").trim().toLowerCase();
          if (shown.has(low)) return;
          shown.add(low);
          if (low.length > MAX_LEN) {
            ElMessage.warning(
              t("classification.phrase_too_long", { max: MAX_LEN }) ||
                `Phrases longer than ${MAX_LEN} characters were removed`,
            );
          } else {
            ElMessage.error(
              t("classification.duplicate_removed", { phrase: r }) ||
                `Duplicate phrase removed: ${r}`,
            );
          }
        });
      }
      input.value = normalized;

      const text =
        normalized.length > 0
          ? normalized.join(", ").trim()
          : (sampleText.value || "").trim();
      if (!label || !text) {
        ElMessage.warning(t("classification.both_required"));
        return;
      }
      const parsed = [{ label, text }];
      const ok = await typingStore.addSamples(project.currentProjectId, parsed);
      if (ok) {
        setTimeout(() => {
          sampleLabel.value = "";
          sampleText.value = "";
          input.value = [];
        }, 300);
      }
    }

    function clearAll() {
      if (!project.currentProjectId) return;
      ElMessageBox.confirm(
        t("classification.delete_all_confirm_message"),
        t("classification.delete_all_confirm_title"),
        {
          confirmButtonText: t("delete"),
          cancelButtonText: t("cancel"),
          type: "warning",
        },
      )
        .then(() => {
          typingStore.clearSamples(project.currentProjectId);
        })
        .catch(() => {});
    }

    onMounted(() => {
      if (project.currentProjectId)
        typingStore.loadSamples(project.currentProjectId);
      // IPC-based architecture: no socket listeners needed
      // Data is managed through Pinia stores
    });

    // cleanup on unmount
    onUnmounted(() => {
      // No socket cleanup needed in IPC architecture
    });

    watch(
      () => project.currentProjectId,
      (id) => {
        if (id) typingStore.loadSamples(id);
      },
    );

    // Initialize rowTags whenever samples are loaded/changed
    watch(
      () => groupedSamples.value,
      (list) => {
        try {
          if (!Array.isArray(list)) return;
          for (const r of list) {
            if (r && r.label) {
              const id = String(r.label);
              if (!editingLabels.value.has(id)) {
                rowTags.value[id] = phrases(r.text || "").filter(
                  (s) => s.length <= MAX_LEN,
                );
              }
            }
          }
        } catch (e) {}
      },
      { immediate: true },
    );

    // Check if classification can run
    const canRunClassification = computed(() => {
      return typingStore.samples && typingStore.samples.length > 0;
    });

    // Прямой запуск: закрываем модалку, обучаем модель, затем классифицируем все ключевые слова
    async function handleClassificationRun() {
      if (!project.currentProjectId) {
        ElMessage.error(t("select_project") || "Выберите проект");
        return;
      }
      if (!typingStore.samples || typingStore.samples.length === 0) {
        ElMessage.warning("Добавьте обучающие примеры");
        return;
      }

      // Даём UI отрисоваться
      await nextTick();
      emit("close-dialog");

      // Сбрасываем и выставляем флаги прогресса
      typingStore.isTraining = true;
      typingStore.trainingProgress = 0;
      keywordsStore.typingRunning = true;
      keywordsStore.typingPercent = 0;
      keywordsStore.currentProcessLabel = "Определение класса";
      keywordsStore.currentProcessed = 0;
      keywordsStore.currentTotal = 0;

      try {
        const apiKey = await project.getOpenaiApiKey();
        if (!apiKey) {
          ElMessage.error(
            t("classification.api_key_required") || "Требуется API ключ OpenAI",
          );
          return;
        }

        // Инициализируем сервис классификации
        const classificationService = new (
          await import("../../../services/classificationService")
        ).ClassificationService(apiKey);

        classificationService.setProgressCallback((update) => {
          typingStore.trainingProgress = update.percent;
          keywordsStore.typingPercent = update.percent;
          if (update.message) {
            keywordsStore.currentProcessLabel = update.message;
          }
        });

        // Обучение модели только если её ещё нет
        if (!typingStore.model) {
          const result = await classificationService.runFullPipeline(
            typingStore.samples,
            [],
            { train, predict: workerPredict, fetchEmbeddings },
          );

          // Save model to database
          await typingStore.saveModel(project.currentProjectId, result.model);

          // Сообщение об успешном обучении
          ElMessage.success(
            t("classification.training_complete") ||
              "Обучение модели успешно завершено",
          );
        }

        // Классификация всех ключевых слов проекта
        if (project.currentProjectId && typingStore.model) {
          // Reset progress for classification phase before getting keywords
          keywordsStore.typingPercent = 0;

          keywordsStore.currentProcessLabel = "Получение ключевых слов...";
          const keywords = await keywordsStore.getKeywordsByProject(
            project.currentProjectId,
          );

          if (keywords && keywords.length > 0) {
            keywordsStore.currentProcessLabel =
              "Получение векторных представлений";
            keywordsStore.currentProcessed = 0;
            keywordsStore.currentTotal = keywords.length;
            const updatedKeywords = [];

            // Получаем embeddings для всех ключевых слов
            const kwTexts = keywords.map((k) => k.keyword);

            const embeddings = await loadEmbeddingsWithCache(
              kwTexts,
              apiKey,
              (progress) => {
                keywordsStore.currentProcessLabel =
                  "Получение векторных представлений...";
                keywordsStore.currentProcessed = progress.fetched;
                keywordsStore.currentTotal = progress.total;
                keywordsStore.typingPercent = progress.percent;
              },
            );

            keywordsStore.currentProcessLabel = "Классификация ключевых слов";
            keywordsStore.currentProcessed = 0;
            keywordsStore.currentTotal = keywords.length;

            for (let i = 0; i < keywords.length; i++) {
              const keyword = keywords[i];
              const embedding = embeddings[i];

              try {
                if (!embedding || !Array.isArray(embedding)) {
                  console.warn(`No embedding for keyword "${keyword.keyword}"`);
                  updatedKeywords.push(keyword);
                  keywordsStore.currentProcessed = i + 1;
                  const percent = Math.round(((i + 1) / keywords.length) * 100);
                  keywordsStore.typingPercent = percent;
                  continue;
                }

                // Serialize model to ensure it can be sent to worker
                const serializedModel = serializeModel(typingStore.model);

                const prediction = await workerPredict(
                  embedding,
                  serializedModel,
                  apiKey,
                );

                updatedKeywords.push({
                  ...keyword,
                  classification_label: prediction.label,
                  classification_score: prediction.score,
                });

                keywordsStore.currentProcessed = i + 1;
                const percent = Math.round(((i + 1) / keywords.length) * 100);
                keywordsStore.typingPercent = percent;
              } catch (e) {
                console.warn(
                  `Failed to classify keyword "${keyword.keyword}":`,
                  e,
                );
                updatedKeywords.push(keyword);
                keywordsStore.currentProcessed = i + 1;
                const percent = Math.round(((i + 1) / keywords.length) * 100);
                keywordsStore.typingPercent = percent;
              }
            }

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
        }
      } catch (error) {
        console.error("Classification error:", error);
        ElMessage.error(
          t("classification.error") ||
            "Ошибка при определении класса: " +
              (error instanceof Error ? error.message : String(error)),
        );
      } finally {
        typingStore.isTraining = false;
        keywordsStore.typingRunning = false;
        keywordsStore.typingPercent = 0;
        keywordsStore.currentProcessLabel = null;
        keywordsStore.currentProcessed = 0;
        keywordsStore.currentTotal = 0;
        isClassificationRunning.value = false;
      }
    }

    return {
      sampleLabel,
      sampleText,
      input,
      project,
      typingStore,
      delimiter,
      activeName,
      isClassificationRunning,
      canRunClassification,
      phrases,
      groupedSamples,
      handleClassificationRun,
      deleteRow,
      deleteAll,
      addSamples,
      clearAll,
      Delete,
      InfoFilled,
      rowTags,
      rowStatus,
      onTagsChange,
      onInputChange,
      handleRowPaste,
      // expose for directive access
      MAX_LEN,
      ElMessage,
      t,
      serializeModel,
      drawer,
    };
  },
});
</script>

<style scoped>
/* Ensure badges inside the table are not clipped by cell overflow */
.el-table .cell {
  overflow: visible !important;
}
.item,
.el-badge {
  display: inline-block;
  position: relative;
  z-index: 10;
  overflow: visible !important;
}

/* Keep collapse items fixed width and prevent horizontal growth */
.typing-collapse {
  max-width: 100px; /* adjust as needed */
  width: 100%;
}
.typing-collapse :deep(.el-collapse-item__wrap),
.typing-collapse :deep(.el-collapse-item) {
  overflow: hidden;
}
.typing-collapse :deep(.el-collapse-item__content) {
  overflow: auto;
}

/* Fixed width for per-row el-input-tag to avoid expanding the collapse item */
.fixed-input-tag {
  max-width: 720px; /* reasonable max width, adjust if needed */
  width: 100%;
  box-sizing: border-box;
  display: block;
}

/* Format algorithm steps with proper line breaks */
.algorithm-steps {
  white-space: pre-line;
  line-height: 1.5;
  margin-top: 8px;
}

/* Container for proper content alignment */
.classification-config-container {
  width: 100%;
  display: flex;
  flex-direction: column;
}

/* Ensure proper spacing inside el-dialog */
:deep(.el-dialog__body) .classification-config-container {
  margin: 0;
  padding: 0;
}

/* Align add-class row with collapse content */
.add-class-row {
  box-sizing: border-box;
  width: 100%;
  gap: 8px;
  flex-wrap: wrap;
  overflow: hidden;
}

/* Classification action button positioned at bottom-right */
.classification-action-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 24px;
  box-sizing: border-box;
  width: 100%;
}

.classification-action-row .el-button {
  min-width: 200px;
}
</style>
