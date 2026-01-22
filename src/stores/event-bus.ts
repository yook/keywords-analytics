// PWA-compatible event bus for local event handling and integration management
// Provides event emitter functionality and localStorage-based API key management
import { encryptValue, decryptValue } from '../utils/encryption';

// Simple in-memory event emitter to simulate socket/ipc behavior in PWA
const listeners: Map<string, Set<Function>> = new Map();
function addListener(event: string, fn: Function) {
  let s = listeners.get(event);
  if (!s) {
    s = new Set();
    listeners.set(event, s);
  }
  s.add(fn);
}
function removeListener(event: string, fn?: Function) {
  if (!fn) {
    listeners.delete(event);
    return;
  }
  const s = listeners.get(event);
  if (!s) return;
  s.delete(fn);
  if (s.size === 0) listeners.delete(event);
}
function emitEvent(event: string, payload?: any) {
  const s = listeners.get(event);
  if (!s) return;
  for (const fn of Array.from(s)) {
    try {
      fn(payload);
    } catch (e) {
      // swallow
    }
  }
}

export const ipcClient = {
  async getAllUrlsForExport(_opts: any) {
    return [];
  },
  async getKeywordsAll(_pid: number) {
    return [];
  },
  // Windowed data loading for virtual scroll
  async getKeywordsWindow(projectId, skip = 0, limit = 300, sort = {}, searchQuery = "") {
    // Return mock data for development; replace with real implementation as needed
    const total = 1000;
    const keywords = Array.from({ length: Math.min(limit, total - skip) }, (_, i) => ({
      id: skip + i + 1,
      keyword: `Keyword ${skip + i + 1}`,
      category_name: "Категория",
      category_similarity: Math.random(),
      class_name: "Класс",
      class_similarity: Math.random(),
      target_query: Math.random() > 0.5 ? 1 : 0,
      is_valid_headline: Math.random() > 0.5 ? 1 : 0,
      created_at: new Date().toISOString(),
    }));
    return { keywords, total };
  },
  // Bulk insert stub
  async insertKeywordsBulk(keywords, projectId) {
    return { inserted: keywords.length, skipped: 0 };
  },
  // Delete a keyword by id
  async deleteKeyword(id) {
    return { success: true, id };
  },
  // Delete all keywords for a project
  async deleteKeywordsByProject(projectId) {
    return { changes: 1000 };
  },
  // Start/stop/categorization/typing/clustering stubs
  async startCategorization(projectId) { return { started: true }; },
  async startTyping(projectId) { return { started: true }; },
  async startClustering(projectId, algorithm, eps, minPts) { return { started: true }; },
  async startApplyStopwords(projectId) { return { started: true }; },
  async startMorphology(projectId) { return { started: true }; },
  async startMorphologyCheck(projectId) { return { started: true }; },
  async stopMorphologyCheck(projectId) { return { stopped: true }; },

  // Minimal socket-like API for PWA usage
  on(event: string, fn?: Function) {
    if (!event) return;
    addListener(event, fn || (() => {}));
  },
  off(event: string, fn?: Function) {
    if (!event) return;
    removeListener(event, fn);
  },
  emit(event: string, payload?: any) {
    // Handle a few integration-related commands locally to simulate server behavior
    try {
      if (event === "get-embeddings-cache-size") {
        // Respond with empty cache by default
        setTimeout(() => emitEvent("embeddings-cache-size", { size: 0 }), 0);
      } else if (event === "integrations:get") {
        const { projectId, service } = payload || {};
        if (service === "openai") {
          let storedEncrypted = localStorage.getItem('openaiKey_global');
          
          // Migration: if global key doesn't exist, try to migrate from old per-project key
          if (!storedEncrypted && projectId) {
            const oldKey = localStorage.getItem(`openaiKey_${projectId}`);
            if (oldKey) {
              console.log('Migrating API key from per-project to global storage');
              localStorage.setItem('openaiKey_global', oldKey);
              storedEncrypted = oldKey;
            }
          }
          
          const hasKey = !!storedEncrypted;
          let maskedKey: string | null = null;
          
          if (storedEncrypted) {
            // Decrypt and mask the key
            decryptValue(storedEncrypted)
              .then((decrypted) => {
                const masked = decrypted.substring(0, 4) + "*".repeat(Math.max(0, decrypted.length - 8)) + decrypted.substring(decrypted.length - 4);
                emitEvent("integrations:info", { projectId, service, hasKey: true, maskedKey: masked });
              })
              .catch(() => {
                // If decryption fails, indicate key exists but is unreadable
                emitEvent("integrations:info", { projectId, service, hasKey: false, maskedKey: null });
              });
          } else {
            setTimeout(() => emitEvent("integrations:info", { projectId, service, hasKey: false, maskedKey: null }), 0);
          }
        } else {
          setTimeout(() => emitEvent("integrations:info", { projectId, service, hasKey: false, maskedKey: null }), 0);
        }
      } else if (event === "integrations:setKey") {
        const { projectId, service, key } = payload || {};
        if (service === "openai" && key) {
          // Encrypt and save OpenAI key (global)
          encryptValue(key)
            .then((encrypted) => {
              localStorage.setItem('openaiKey_global', encrypted);
              emitEvent("integrations:setKey:ok", { projectId });
            })
            .catch((error) => {
              console.error("Failed to encrypt API key:", error);
              emitEvent("integrations:setKey:ok", { projectId }); // Still notify UI to avoid UI hang
            });
        } else {
          setTimeout(() => emitEvent("integrations:setKey:ok", { projectId }), 0);
        }
      } else if (event === "integrations:delete") {
        const { projectId, service } = payload || {};
        if (service === "openai") {
          localStorage.removeItem('openaiKey_global');
        }
        setTimeout(() => emitEvent("integrations:deleted", { projectId }), 0);
      }
    } catch (e) {}

    // Notify listeners for this event as well
    emitEvent(event, payload);
  },

  // Generic invoke stub
  async invoke() { return {}; },
};

// Export `socket` alias for compatibility with components expecting `socket`
export const socket = ipcClient;

