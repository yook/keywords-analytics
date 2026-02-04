/**
 * Composable for clustering worker
 */
import { ref, onUnmounted } from "vue";
import ClusteringWorker from "../workers/clustering.worker?worker";

interface ClusteringItem {
  id: string;
  keyword: string;
  embedding: number[];
}

interface ClusterResult {
  id: string;
  cluster: number;
  cluster_label: string;
  cluster_score?: number;
}

interface ProgressCallback {
  (progress: { stage: string; percent: number; processed?: number; total?: number; comparisons?: number; clusters?: number }): void;
}

export function useClusteringWorker() {
  const worker = ref<Worker | null>(null);
  const messageId = ref(0);
  const pendingRequests = ref<Map<number, { resolve: any; reject: any }>>(new Map());
  const progressCallbacks = ref<Map<number, ProgressCallback>>(new Map());
  const isReady = ref(false);
  const error = ref<string | null>(null);

  const initWorker = () => {
    if (worker.value) return;

    try {
      worker.value = new ClusteringWorker();

      worker.value.onmessage = (event: MessageEvent) => {
        const { id, type, result, error: workerError, progress } = event.data;

        // Handle progress messages
        if (type === "progress") {
          const callback = progressCallbacks.value.get(id);
          if (callback && progress) {
            callback(progress);
          }
          return;
        }

        if (type === "result" || type === "error") {
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
        }
      };

      worker.value.onerror = (err) => {
        error.value = err.message;
        console.error("[ClusteringWorker] Error:", err);
      };

      isReady.value = true;
    } catch (err) {
      error.value = `Failed to initialize worker: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[useClusteringWorker] Initialization error:", error.value);
    }
  };

  const sendMessage = (
    type: string,
    payload: any,
    onProgress?: ProgressCallback
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!worker.value) {
        initWorker();
      }

      if (!worker.value) {
        reject(new Error("Failed to initialize clustering worker"));
        return;
      }

      const id = ++messageId.value;
      pendingRequests.value.set(id, { resolve, reject });
      
      // Store progress callback if provided
      if (onProgress) {
        progressCallbacks.value.set(id, onProgress);
      }

      try {
        worker.value!.postMessage({ id, type, payload });
      } catch (error) {
        console.error(
          `[useClusteringWorker] postMessage failed for type "${type}":`,
          error instanceof Error ? error.message : String(error)
        );
        reject(error);
        pendingRequests.value.delete(id);
        progressCallbacks.value.delete(id);
        return;
      }

      // Timeout after 10 minutes (clustering can be slow)
      setTimeout(() => {
        if (pendingRequests.value.has(id)) {
          pendingRequests.value.delete(id);
          progressCallbacks.value.delete(id);
          reject(new Error("Clustering worker request timeout"));
        }
      }, 10 * 60 * 1000);
    });
  };

  const clusterWithComponents = async (
    items: ClusteringItem[],
    threshold: number,
    onProgress?: ProgressCallback
  ): Promise<ClusterResult[]> => {
    return sendMessage("cluster-components", { items, threshold }, onProgress);
  };

  const clusterWithDBSCAN = async (
    items: ClusteringItem[],
    eps: number,
    minPts: number,
    onProgress?: ProgressCallback,
    options?: { approximate?: DBSCANParams["approximate"] }
  ): Promise<ClusterResult[]> => {
    return sendMessage(
      "cluster-dbscan",
      { items, eps, minPts, approximate: options?.approximate },
      onProgress
    );
  };

  const terminate = () => {
    if (worker.value) {
      worker.value.terminate();
      worker.value = null;
      isReady.value = false;
      pendingRequests.value.clear();
      progressCallbacks.value.clear();
    }
  };

  onUnmounted(() => {
    terminate();
  });

  return {
    isReady,
    error,
    clusterWithComponents,
    clusterWithDBSCAN,
    terminate,
  };
}
