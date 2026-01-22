/**
 * Classification Service
 * End-to-end pipeline:
 * 1) Load typing_samples for project
 * 2) Check existing model and embeddings coverage
 * 3) If missing embeddings -> fetch/save and retrain, else reuse existing model
 * 4) Read keywords to process
 * 5) For each keyword: get embedding (with cache), predict, and return results
 */

import { ElMessage } from "element-plus";
import { useDexie } from "../composables/useDexie";

export interface TypingSample {
  id?: number;
  label: string;
  text: string;
  projectId?: number;
}

export interface ClassificationModel {
  W: number[][];
  b: number[];
  labels: string[];
  D: number;
  model_version: string;
}

export interface PredictionResult {
  label: string;
  score: number;
  probs: number[];
  logits: number[];
}

export interface ClassificationOutput {
  id: number | string;
  keyword: string;
  bestCategoryName: string | null;
  similarity: number;
  embeddingSource?: string;
}

interface ProgressUpdate {
  type: "progress" | "status";
  stage: "embeddings" | "training" | "classification";
  percent: number;
  processed?: number;
  total?: number;
  message?: string;
}

const VECTOR_MODEL = "text-embedding-3-small";
const MODEL_VERSION = "logreg_v2";

export class ClassificationService {
  private apiKey: string;
  private embeddingsCache = new Map<string, number[]>();
  private model: ClassificationModel | null = null;
  private onProgress: ((update: ProgressUpdate) => void) | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  setProgressCallback(callback: (update: ProgressUpdate) => void): void {
    this.onProgress = callback;
  }

  private emitProgress(update: ProgressUpdate): void {
    if (this.onProgress) {
      try {
        this.onProgress(update);
      } catch (e) {
        console.error("Progress callback error:", e);
      }
    }
  }

  /**
   * Validate and prepare training samples
   */
  async prepareSamples(samples: TypingSample[]): Promise<TypingSample[]> {
    if (!samples || samples.length === 0) {
      throw new Error("No training samples provided");
    }

    const filtered = samples.filter((s) => s && s.text && s.label);
    if (filtered.length < 2) {
      throw new Error("At least 2 samples with text and label are required");
    }

    // Check that we have at least 2 different labels
    const uniqueLabels = new Set(filtered.map((s) => String(s.label)));
    if (uniqueLabels.size < 2) {
      throw new Error("At least 2 different labels are required");
    }

    this.emitProgress({
      type: "status",
      stage: "embeddings",
      percent: 0,
      message: `Prepared ${filtered.length} samples with ${uniqueLabels.size} unique labels`,
    });

    return filtered;
  }

  /**
   * Fetch embeddings with database caching support
   */
  async fetchEmbeddings(
    texts: string[],
    worker: any
  ): Promise<(number[] | null)[]> {
    if (!texts || texts.length === 0) return [];

    const db = useDexie();
    const results = new Array(texts.length).fill(null);
    const missingIndices: number[] = [];

    // Check in-memory cache first, then database
    for (let i = 0; i < texts.length; i++) {
      const cacheKey = `${VECTOR_MODEL}:${texts[i]}`;
      
      // Check in-memory cache
      if (this.embeddingsCache.has(cacheKey)) {
        results[i] = this.embeddingsCache.get(cacheKey) || null;
      } else {
        missingIndices.push(i);
      }
    }

    // Check database for missing entries
    if (missingIndices.length > 0) {
      try {
        const dbEmbeddings = await db.embeddingsCacheGetBulk(
          missingIndices.map((i) => texts[i]),
          VECTOR_MODEL
        );

        const stillMissing: number[] = [];
        for (let j = 0; j < missingIndices.length; j++) {
          const idx = missingIndices[j];
          if (dbEmbeddings[j]) {
            results[idx] = dbEmbeddings[j];
            const cacheKey = `${VECTOR_MODEL}:${texts[idx]}`;
            this.embeddingsCache.set(cacheKey, dbEmbeddings[j]!);
          } else {
            stillMissing.push(idx);
          }
        }

        // Fetch from OpenAI only if still missing
        if (stillMissing.length > 0) {
          const missingTexts = stillMissing.map((i) => texts[i]);

          try {
            const fetched = await worker.fetchEmbeddings(
              missingTexts,
              this.apiKey,
              VECTOR_MODEL
            );

            // Save to database and in-memory cache
            const toSave: Array<{ key: string; embedding: number[] }> = [];
            for (let j = 0; j < stillMissing.length; j++) {
              const idx = stillMissing[j];
              const emb = fetched[j];
              if (Array.isArray(emb) && emb.length > 0) {
                results[idx] = emb;
                const cacheKey = `${VECTOR_MODEL}:${texts[idx]}`;
                this.embeddingsCache.set(cacheKey, emb);
                toSave.push({ key: texts[idx], embedding: emb });
              }
            }

            // Bulk save to database
            if (toSave.length > 0) {
              try {
                await db.embeddingsCacheBulkPut(toSave, VECTOR_MODEL);
              } catch (e) {
                console.warn("Failed to save embeddings to database:", e);
              }
            }
          } catch (error) {
            throw new Error(
              `Failed to fetch embeddings from OpenAI: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }

        this.emitProgress({
          type: "progress",
          stage: "embeddings",
          percent: 100,
          processed: texts.length,
          total: texts.length,
        });
      } catch (error) {
        console.warn("Database cache error, continuing:", error);
        
        // Fallback: fetch all from OpenAI without database caching
        const missingTexts = missingIndices.map((i) => texts[i]);

        try {
          const fetched = await worker.fetchEmbeddings(
            missingTexts,
            this.apiKey,
            VECTOR_MODEL
          );

          for (let j = 0; j < missingIndices.length; j++) {
            const idx = missingIndices[j];
            const emb = fetched[j];
            if (Array.isArray(emb) && emb.length > 0) {
              results[idx] = emb;
              const cacheKey = `${VECTOR_MODEL}:${texts[idx]}`;
              this.embeddingsCache.set(cacheKey, emb);
            }
          }

          this.emitProgress({
            type: "progress",
            stage: "embeddings",
            percent: 100,
            processed: texts.length,
            total: texts.length,
          });
        } catch (fallbackError) {
          throw new Error(
            `Failed to fetch embeddings: ${
              fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
            }`
          );
        }
      }
    } else {
      this.emitProgress({
        type: "progress",
        stage: "embeddings",
        percent: 100,
        processed: texts.length,
        total: texts.length,
        message: "All embeddings from cache",
      });
    }

    return results;
  }

  /**
   * Train classification model
   */
  async trainModel(
    samples: TypingSample[],
    worker: any
  ): Promise<ClassificationModel> {
    this.emitProgress({
      type: "status",
      stage: "training",
      percent: 0,
      message: "Preparing training data...",
    });

    // Fetch embeddings for all samples
    const texts = samples.map((s) => s.text);
    const embeddings = await this.fetchEmbeddings(texts, worker);

    // Prepare training set
    const trainingSamples = samples
      .map((s, i) => ({
        embedding: embeddings[i],
        label: s.label,
      }))
      .filter((entry) => Array.isArray(entry.embedding) && entry.embedding.length > 0);

    if (trainingSamples.length !== samples.length) {
      console.warn(
        `Training set size ${trainingSamples.length} differs from samples ${samples.length}`
      );
    }

    if (trainingSamples.length < 2) {
      throw new Error("Cannot train model: insufficient embeddings");
    }

    this.emitProgress({
      type: "status",
      stage: "training",
      percent: 10,
      message: `Training model on ${trainingSamples.length} samples...`,
    });

    try {
      this.model = await worker.train(trainingSamples, this.apiKey, {
        epochs: 500,
        lr: 0.1,
        batchSize: 32,
        reg: 1e-4,
        onTrainProgress: (epoch: number, total: number, percent: number) => {
          // Map training progress to 10-90% of training stage
          const stagePct = 10 + Math.round((percent / 100) * 80);
          this.emitProgress({
            type: "progress",
            stage: "training",
            percent: stagePct,
            processed: epoch,
            total,
          });
        },
      });
      this.emitProgress({
        type: "progress",
        stage: "training",
        percent: 100,
        message: "Model training completed",
      });

      if (!this.model) {
        throw new Error("Model training completed but model is null");
      }
      return this.model;
    } catch (error) {
      throw new Error(
        `Training failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Classify keywords using trained model
   */
  async classifyKeywords(
    keywords: Array<{ id?: number | string; keyword: string }>,
    worker: any
  ): Promise<ClassificationOutput[]> {
    if (!this.model) {
      throw new Error("Model not trained. Please train the model first.");
    }

    if (!keywords || keywords.length === 0) {
      return [];
    }

    const results: ClassificationOutput[] = [];

    this.emitProgress({
      type: "status",
      stage: "classification",
      percent: 0,
      message: `Preparing to classify ${keywords.length} keywords...`,
    });

    // Fetch embeddings for all keywords
    const kwTexts = keywords.map((k) => k.keyword || "");
    const kwEmbs = await this.fetchEmbeddings(kwTexts, worker);

    this.emitProgress({
      type: "status",
      stage: "classification",
      percent: 20,
      message: "Starting classification...",
    });

    // Classify each keyword
    let processedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      const emb = kwEmbs[i];

      if (!emb || emb.length !== this.model.D) {
        skippedCount++;
        console.warn(
          `Skipping keyword "${kw.keyword}" - embedding mismatch (got ${emb ? emb.length : 0}, expected ${this.model.D})`
        );
        continue;
      }

      try {
        const pred = await worker.predict(emb, this.model, this.apiKey);

        results.push({
          id: kw.id || i,
          keyword: kw.keyword,
          bestCategoryName: pred.label,
          similarity: pred.score || 0,
          embeddingSource: "cache",
        });

        processedCount++;

        // Update progress
        const classPct = Math.round(((processedCount + skippedCount) / keywords.length) * 100);
        if (classPct % 10 === 0) {
          this.emitProgress({
            type: "progress",
            stage: "classification",
            percent: 20 + Math.round((classPct / 100) * 80),
            processed: processedCount,
            total: keywords.length,
          });
        }
      } catch (error) {
        console.error(`Classification error for keyword "${kw.keyword}":`, error);
        skippedCount++;
      }
    }

    this.emitProgress({
      type: "progress",
      stage: "classification",
      percent: 100,
      processed: processedCount,
      total: keywords.length,
      message: `Classification completed: ${processedCount} classified, ${skippedCount} skipped`,
    });

    return results;
  }

  /**
   * Full pipeline: prepare -> train -> classify
   */
  async runFullPipeline(
    samples: TypingSample[],
    keywords: Array<{ id?: number | string; keyword: string }>,
    worker: any
  ): Promise<{
    model: ClassificationModel;
    results: ClassificationOutput[];
  }> {
    try {
      // Step 1: Prepare samples
      const preparedSamples = await this.prepareSamples(samples);

      // Step 2: Train model
      const trainedModel = await this.trainModel(preparedSamples, worker);

      // Step 3: Classify keywords
      const classificationResults = await this.classifyKeywords(keywords, worker);

      return {
        model: trainedModel,
        results: classificationResults,
      };
    } catch (error) {
      this.emitProgress({
        type: "status",
        stage: "embeddings",
        percent: 0,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
      throw error;
    }
  }

  /**
   * Clear cached embeddings (in-memory and database)
   */
  async clearCache(): Promise<void> {
    this.embeddingsCache.clear();
    // Also clear from database
    try {
      const db = useDexie();
      await db.embeddingsCacheClear();
    } catch (e) {
      console.warn("Failed to clear database embeddings cache:", e);
    }
  }

  /**
   * Get current model
   */
  getModel(): ClassificationModel | null {
    return this.model;
  }

  /**
   * Set model manually (for loading from storage)
   */
  setModel(model: ClassificationModel): void {
    this.model = model;
  }
}
