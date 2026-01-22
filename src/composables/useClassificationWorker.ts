/**
 * Composable for classification worker
 */
import { ref, onUnmounted } from "vue";
import ClassificationWorker from "../workers/classification.worker?worker";

interface ClassificationModel {
  W: number[][];
  b: number[];
  labels: string[];
  D: number;
  model_version: string;
}

interface PredictionResult {
  label: string;
  score: number;
  probs: number[];
  logits: number[];
}

interface TrainingSample {
  text?: string;
  embedding?: number[];
  label: string;
}

export function useClassificationWorker() {
  const worker = ref<Worker | null>(null);
  const messageId = ref(0);
  const pendingRequests = ref<Map<number, { resolve: any; reject: any }>>(new Map());
  const progressCallbacks = ref<Map<number, { onTrain?: any; onEmbed?: any }>>(new Map());
  const isReady = ref(false);
  const error = ref<string | null>(null);

  const initWorker = () => {
    if (worker.value) return;

    try {
      worker.value = new ClassificationWorker();

      worker.value.onmessage = (event: MessageEvent) => {
        const { id, type, result, error: workerError, progress } = event.data;

        // Handle progress messages
        if (type === "progress") {
          const callbacks = progressCallbacks.value.get(id);
          if (callbacks) {
            if (progress.stage === "train" && callbacks.onTrain) {
              callbacks.onTrain(progress.epoch, progress.totalEpochs, progress.percent);
            } else if (progress.stage === "embed" && callbacks.onEmbed) {
              callbacks.onEmbed({ fetched: progress.fetched, total: progress.total, percent: progress.percent });
            }
          }
          return;
        }

        // Handle completion
        if (pendingRequests.value.has(id)) {
          const { resolve, reject } = pendingRequests.value.get(id)!;
          pendingRequests.value.delete(id);
          progressCallbacks.value.delete(id);

          if (workerError) {
            reject(new Error(workerError));
          } else {
            resolve(result);
          }
        }
      };

      worker.value.onerror = (err) => {
        error.value = err.message;
        console.error("[ClassificationWorker] Error:", err);
      };

      isReady.value = true;
    } catch (err) {
      error.value = `Failed to initialize worker: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[useClassificationWorker] Initialization error:", error.value);
    }
  };

  const sendMessage = (type: string, payload: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!worker.value) {
        initWorker();
      }

      if (!worker.value) {
        reject(new Error("Failed to initialize classification worker"));
        return;
      }

      const id = ++messageId.value;
      pendingRequests.value.set(id, { resolve, reject });

      // Remove callbacks from payload (they can't be serialized)
      const cleanPayload = { ...payload };
      delete cleanPayload.onTrainProgress;
      delete cleanPayload.onEmbedProgress;
      delete cleanPayload.options?.onTrainProgress;
      delete cleanPayload.options?.onEmbedProgress;

      try {
        worker.value!.postMessage({ id, type, payload: cleanPayload });
      } catch (error) {
        // Log detailed error info
        console.error(
          `[useClassificationWorker] postMessage failed for type "${type}":`,
          error instanceof Error ? error.message : String(error)
        );
        if (cleanPayload.model) {
          console.error("Model payload keys:", Object.keys(cleanPayload.model));
          console.error("Model payload:", cleanPayload.model);
        }
        reject(error);
        pendingRequests.value.delete(id);
        return;
      }

      // Timeout after 5 minutes
      setTimeout(() => {
        if (pendingRequests.value.has(id)) {
          pendingRequests.value.delete(id);
          progressCallbacks.value.delete(id);
          reject(new Error("Classification worker request timeout"));
        }
      }, 5 * 60 * 1000);
    });
  };

  const train = async (
    samples: TrainingSample[],
    apiKey: string,
    options?: {
      epochs?: number;
      lr?: number;
      batchSize?: number;
      reg?: number;
      model?: string;
      onTrainProgress?: (epoch: number, totalEpochs: number, percent: number) => void;
      onEmbedProgress?: (progress: { fetched: number; total: number; percent: number }) => void;
    }
  ): Promise<ClassificationModel> => {
    // Separate callbacks before sending
    const onTrainProgress = options?.onTrainProgress;
    const onEmbedProgress = options?.onEmbedProgress;
    
    const cleanOptions = { ...options };
    delete cleanOptions.onTrainProgress;
    delete cleanOptions.onEmbedProgress;

    const id = ++messageId.value;
    
    // Store callbacks for progress messages
    if (onTrainProgress || onEmbedProgress) {
      progressCallbacks.value.set(id, { onTrain: onTrainProgress, onEmbed: onEmbedProgress });
    }

    return new Promise((resolve, reject) => {
      if (!worker.value) {
        initWorker();
      }

      if (!worker.value) {
        progressCallbacks.value.delete(id);
        reject(new Error("Failed to initialize classification worker"));
        return;
      }

      pendingRequests.value.set(id, { resolve, reject });
      worker.value!.postMessage({ id, type: "train", payload: { samples, apiKey, options: cleanOptions } });

      setTimeout(() => {
        if (pendingRequests.value.has(id)) {
          pendingRequests.value.delete(id);
          progressCallbacks.value.delete(id);
          reject(new Error("Classification worker request timeout"));
        }
      }, 5 * 60 * 1000);
    });
  };

  const predict = async (
    input: string | number[],
    model: ClassificationModel,
    apiKey: string,
    options?: {
      model?: string;
      onEmbedProgress?: (progress: { fetched: number; total: number; percent: number }) => void;
    }
  ): Promise<PredictionResult> => {
    const cleanOptions = { ...options };
    delete cleanOptions.onEmbedProgress;
    
    return sendMessage("predict", { input, model, apiKey, options: cleanOptions });
  };

  const fetchEmbeddings = async (
    texts: string[],
    apiKey: string,
    options?: {
      model?: string;
      onEmbedProgress?: (progress: { fetched: number; total: number; percent: number; source: 'cache' | 'openai' }) => void;
    }
  ): Promise<(number[] | null)[]> => {
    const onEmbedProgress = options?.onEmbedProgress;
    const model = options?.model;
    
    const id = ++messageId.value;
    
    // Store callback for progress messages
    if (onEmbedProgress) {
      progressCallbacks.value.set(id, { onEmbed: onEmbedProgress });
    }

    return new Promise((resolve, reject) => {
      if (!worker.value) {
        initWorker();
      }

      if (!worker.value) {
        progressCallbacks.value.delete(id);
        reject(new Error("Failed to initialize classification worker"));
        return;
      }

      pendingRequests.value.set(id, { resolve, reject });
      worker.value!.postMessage({ id, type: "fetchEmbeddings", payload: { texts, apiKey, model } });

      setTimeout(() => {
        if (pendingRequests.value.has(id)) {
          pendingRequests.value.delete(id);
          progressCallbacks.value.delete(id);
          reject(new Error("Classification worker request timeout"));
        }
      }, 5 * 60 * 1000);
    });
  };

  const clearCache = async (): Promise<void> => {
    return sendMessage("clearCache", {});
  };

  const terminate = () => {
    if (worker.value) {
      worker.value.terminate();
      worker.value = null;
      isReady.value = false;
      pendingRequests.value.clear();
    }
  };

  // Auto-initialize on first use
  initWorker();

  // Cleanup on unmount
  onUnmounted(() => {
    terminate();
  });

  return {
    isReady,
    error,
    train,
    predict,
    fetchEmbeddings,
    clearCache,
    terminate,
  };
}
