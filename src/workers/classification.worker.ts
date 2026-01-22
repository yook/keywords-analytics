/**
 * Classification Worker
 * Handles OpenAI embeddings computation and logistic regression training/prediction
 */

const DEFAULT_MODEL = "text-embedding-3-small";
const MODEL_VERSION = "logreg_v2";
const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";

interface EmbeddingCacheEntry {
  text: string;
  model: string;
  embedding: number[];
}

interface TrainingSample {
  text?: string;
  embedding?: number[];
  label: string;
}

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

// In-memory cache for embeddings
const embeddingsCache = new Map<string, number[]>();

// Numeric helpers
function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - max));
  const sum = exps.reduce((s, v) => s + v, 0) || 1;
  return exps.map((v) => v / sum);
}

function l2norm(arr: number[]): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    s += v * v;
  }
  return Math.sqrt(s);
}

function normalizeVec(arr: number[]): number[] {
  const out = new Array(arr.length);
  const n = l2norm(arr);
  const eps = 1e-12;
  if (!isFinite(n) || n < eps) {
    for (let i = 0; i < arr.length; i++) out[i] = arr[i] || 0;
    return out;
  }
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] / n;
  return out;
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// Fetch embeddings from OpenAI API
async function fetchEmbeddings(
  texts: string[],
  apiKey: string,
  model: string = DEFAULT_MODEL,
  onProgress?: (progress: { fetched: number; total: number; percent: number; source: 'openai' }) => void
): Promise<(number[] | null)[]> {
  if (!Array.isArray(texts) || texts.length === 0) return [];

  const batchSize = 64;
  const chunkDelayMs = 50;
  const results = new Array(texts.length).fill(null);
  let processedCount = 0;

  // Process all texts in batches
  for (let start = 0; start < texts.length; start += batchSize) {
    const chunkTexts = texts.slice(start, start + batchSize);
    const chunkIndices = Array.from({ length: chunkTexts.length }, (_, i) => start + i);
    
    const payload = {
      model,
      input: chunkTexts,
    };

    try {
      const response = await fetch(OPENAI_EMBED_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `OpenAI API error ${response.status}: ${JSON.stringify(errorData).slice(0, 1024)}`
        );
      }

      const data = await response.json();
      const embeddings = (data.data || []) as Array<{ embedding: number[] }>;

      for (let j = 0; j < embeddings.length; j++) {
        const emb = embeddings[j]?.embedding;
        const idx = chunkIndices[j];
        if (Array.isArray(emb) && emb.length > 0) {
          results[idx] = emb;
        }
      }

      processedCount += chunkTexts.length;
      if (onProgress) {
        onProgress({
          fetched: Math.min(processedCount, texts.length),
          total: texts.length,
          percent: Math.round(
            (Math.min(processedCount, texts.length) / (texts.length || 1)) * 100
          ),
          source: 'openai'
        });
      }

      // Delay between batches
      if (start + batchSize < texts.length && chunkDelayMs > 0) {
        await new Promise((r) => setTimeout(r, chunkDelayMs));
      }
    } catch (error) {
      throw new Error(
        `Failed to fetch embeddings: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return results;
}

// Train logistic regression classifier
async function trainClassifier(
  samples: TrainingSample[],
  apiKey: string,
  messageId: number,
  opts: {
    epochs?: number;
    lr?: number;
    batchSize?: number;
    reg?: number;
    model?: string;
  } = {}
): Promise<ClassificationModel> {
  const epochs = opts.epochs || 500;
  const lr = opts.lr || 0.1;
  const batchSize = opts.batchSize || 32;
  const reg = opts.reg || 1e-4;
  const model = opts.model || DEFAULT_MODEL;

  // Helper function to send progress
  const sendProgress = (stage: "embed" | "train", epoch?: number, totalEpochs?: number, fetched?: number, total?: number) => {
    const percent = stage === "embed" 
      ? fetched && total ? Math.round((fetched / total) * 100) : 0
      : epoch && totalEpochs ? Math.round((epoch / totalEpochs) * 100) : 0;
    
    self.postMessage({
      id: messageId,
      type: "progress",
      progress: {
        stage,
        epoch,
        totalEpochs,
        fetched,
        total,
        percent,
      },
    });
  };

  // Compute embeddings if needed
  const needEmbeddings = samples.length > 0 && !samples[0].embedding;
  let embeddings: (number[] | null)[] = [];

  if (needEmbeddings) {
    const texts = samples.map((s) => s.text || "");
    embeddings = await fetchEmbeddings(texts, apiKey, model, (progress) => {
      sendProgress("embed", undefined, undefined, progress.fetched, progress.total);
    });
  } else {
    embeddings = samples.map((s) => s.embedding || null);
  }

  // Normalize embeddings
  embeddings = embeddings.map((e) => (e ? normalizeVec(e) : null));

  // Validate embeddings
  for (let i = 0; i < embeddings.length; i++) {
    const e = embeddings[i];
    if (!Array.isArray(e) || e.length === 0) {
      throw new Error(
        `Missing embedding for sample index ${i} (label=${samples[i]?.label})`
      );
    }
    for (let j = 0; j < e.length; j++) {
      const v = e[j];
      if (typeof v !== "number" || !isFinite(v)) {
        throw new Error(`Invalid embedding value at sample ${i} dim ${j}: ${String(v)}`);
      }
    }
  }

  // Build label mapping
  const labels: string[] = [];
  const labelToIdx: Record<string, number> = {};
  for (const s of samples) {
    const label = s.label;
    if (!(label in labelToIdx)) {
      labelToIdx[label] = labels.length;
      labels.push(label);
    }
  }

  const K = labels.length;
  const N = embeddings.length;
  if (N === 0 || K === 0) throw new Error("Empty training data");

  const D = (embeddings[0] as number[]).length;

  // Initialize weights W (K x D) and biases b (K)
  const W: number[][] = Array.from({ length: K }, () => new Array(D).fill(0));
  const b: number[] = new Array(K).fill(0);

  // Prepare dataset indices
  const idxs = Array.from({ length: N }, (_, i) => i);

  // Convert labels to indices
  const y = samples.map((s) => labelToIdx[s.label]);

  for (let ep = 0; ep < epochs; ep++) {
    const epochPct = Math.round(((ep + 1) / epochs) * 100);
    sendProgress("train", ep + 1, epochs);

    shuffleArray(idxs);

    for (let s = 0; s < N; s += batchSize) {
      const end = Math.min(s + batchSize, N);
      const bsizeVal = end - s;

      // Gradient accumulators
      const gradW: number[][] = Array.from({ length: K }, () =>
        new Array(D).fill(0)
      );
      const gradB: number[] = new Array(K).fill(0);

      for (let ii = s; ii < end; ii++) {
        const i = idxs[ii];
        const x = embeddings[i] as number[];

        // Compute logits
        const logits: number[] = new Array(K);
        for (let k = 0; k < K; k++) {
          logits[k] = dot(W[k], x) + b[k];
        }

        const probs = softmax(logits);
        const yi = y[i];

        for (let k = 0; k < K; k++) {
          const diff = probs[k] - (k === yi ? 1 : 0);
          gradB[k] += diff;
          const gk = gradW[k];
          for (let d = 0; d < D; d++) {
            gk[d] += diff * x[d];
          }
        }
      }

      // Update parameters
      for (let k = 0; k < K; k++) {
        const gk = gradW[k];
        const Wk = W[k];
        for (let d = 0; d < D; d++) {
          const grad = gk[d] / bsizeVal + reg * Wk[d];
          Wk[d] -= lr * grad;
        }
        b[k] -= lr * (gradB[k] / bsizeVal);
      }
    }
  }

  return {
    W,
    b,
    labels,
    D,
    model_version: MODEL_VERSION,
  };
}

// Make prediction
async function predict(
  input: string | number[],
  model: ClassificationModel,
  apiKey: string,
  opts: {
    model?: string;
    onEmbedProgress?: (progress: { fetched: number; total: number; percent: number }) => void;
  } = {}
): Promise<PredictionResult> {
  let emb: number[] | null = null;

  if (typeof input === "string") {
    const embedModel = opts.model || DEFAULT_MODEL;
    const arr = await fetchEmbeddings([input], apiKey, embedModel, opts.onEmbedProgress);
    emb = arr[0];
  } else if (Array.isArray(input)) {
    emb = input;
  } else {
    throw new Error("Invalid input for predict");
  }

  if (!emb || emb.length !== model.D) {
    throw new Error("Embedding length mismatch");
  }

  // Normalize embedding
  emb = normalizeVec(emb);

  // Compute logits
  const K = model.labels.length;
  const logits: number[] = new Array(K);
  for (let k = 0; k < K; k++) {
    const Wk = model.W[k];
    logits[k] = dot(Wk, emb) + model.b[k];
  }

  const probs = softmax(logits);

  // Find best prediction
  let bestIdx = 0;
  for (let k = 1; k < K; k++) {
    if (probs[k] > probs[bestIdx]) bestIdx = k;
  }

  return {
    label: model.labels[bestIdx],
    score: probs[bestIdx],
    probs,
    logits,
  };
}

// Message handler
self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  try {
    let result: unknown;

    switch (type) {
      case "train": {
        const { samples, apiKey, options } = payload;
        result = await trainClassifier(samples, apiKey, id, options);
        break;
      }

      case "predict": {
        const { input, model: modelData, apiKey, options } = payload;
        result = await predict(input, modelData, apiKey, options);
        break;
      }

      case "fetchEmbeddings": {
        const { texts, apiKey, model: modelName } = payload;
        result = await fetchEmbeddings(texts, apiKey, modelName, (progress) => {
          self.postMessage({
            id,
            type: "progress",
            progress: {
              stage: "embed",
              fetched: progress.fetched,
              total: progress.total,
              percent: progress.percent,
              source: progress.source
            }
          });
        });
        break;
      }

      case "clearCache": {
        embeddingsCache.clear();
        result = { cleared: true };
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({ id, type, result, error: null });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    self.postMessage({ id, type, result: null, error: errorMsg });
  }
};

export {};
