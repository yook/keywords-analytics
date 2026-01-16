type ResolvedEntry = {
  lemma: string;
  grammemes?: string[];
};

let sharedPort: MessagePort | null = null;
let requestSeq = 0;
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
const entryCache = new Map<string, ResolvedEntry | null>();

function initSharedPort() {
  if (sharedPort) return sharedPort;
  if (typeof SharedWorker === 'undefined') {
    throw new Error('SharedWorker is not supported');
  }
  const shared = new SharedWorker(new URL('./lemma-dict.shared.ts', import.meta.url), {
    type: 'module',
    name: 'lemma-dict-shared',
  });
  const port = shared.port;
  port.onmessage = (ev: MessageEvent) => {
    const msg = (ev as any).data || {};
    if (msg.type === 'lemma:entries' && msg.requestId) {
      const pendingReq = pending.get(msg.requestId);
      if (pendingReq) {
        pending.delete(msg.requestId);
        pendingReq.resolve(msg.entries || {});
      }
    }
    if (msg.type === 'lemma:error' && msg.requestId) {
      const pendingReq = pending.get(msg.requestId);
      if (pendingReq) {
        pending.delete(msg.requestId);
        pendingReq.reject(new Error(msg.error || 'lemma shared error'));
      }
    }
  };
  try {
    port.start?.();
  } catch (_) {}
  sharedPort = port;
  return port;
}

async function fetchEntries(words: string[]) {
  if (!words.length) return;
  const port = initSharedPort();
  const requestId = `${Date.now()}-${requestSeq++}`;
  const promise = new Promise<Record<string, ResolvedEntry | null>>((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
  });
  port.postMessage({ type: 'lemma:get', requestId, words });
  const entries = await promise;
  Object.entries(entries || {}).forEach(([k, v]) => {
    if (!entryCache.has(k)) entryCache.set(k, v || null);
  });
}

async function ensureEntries(words: string[]) {
  const missing: string[] = [];
  for (const w of words) {
    const key = String(w || '').toLowerCase();
    if (!key) continue;
    if (!entryCache.has(key)) missing.push(key);
  }
  if (missing.length) {
    await fetchEntries(missing);
  }
}

type NormalizeResult = {
  lemma: string;
  tags: string;
  grammemes: string;
};

const DB_NAME = 'app-db';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {};
  });
}

self.addEventListener('message', async (event) => {
  const { type, payload, requestId } = event.data || {};
  try {
    if (type !== 'morphology') return;
    const projectId = payload?.projectId ? String(payload.projectId) : 'anon';
    const BATCH = payload?.batchSize ? Number(payload.batchSize) : 10;

    async function normalizeKeywordText(original: any): Promise<NormalizeResult> {
      const raw = String(original || '').trim().toLowerCase()
      if (!raw) return { lemma: '', tags: '', grammemes: '' }
      const words = raw.split(/\s+/g)
      try {
        await ensureEntries(words)
        const lemmaParts: string[] = []
        const grammemeSet = new Set<string>()

        for (const word of words) {
          const entry = entryCache.get(String(word).toLowerCase()) || null
          const normalizedLemma = entry ? entry.lemma : word
          lemmaParts.push(normalizedLemma)
          if (entry?.grammemes) entry.grammemes.forEach((g) => grammemeSet.add(g))
        }

        const lemma = lemmaParts.join(' ')
        const tags = [...lemmaParts].sort((a, b) => a.localeCompare(b, 'ru')).join(',')
        const grammemes = [...grammemeSet].sort((a, b) => a.localeCompare(b, 'ru')).join(',')
        return { lemma, tags, grammemes }
      } catch (err) {
        console.warn('[morphology.worker] normalizeKeywordText failed for', raw, err)
        const fallbackParts = words.filter((w) => typeof w === 'string' && w)
        const fallbackTags = [...fallbackParts].sort((a, b) => a.localeCompare(b, 'ru')).join(',')
        return { lemma: raw, tags: fallbackTags, grammemes: '' }
      }
    }

    const db = await openIDB();
    if (!db.objectStoreNames.contains('keywords')) {
      self.postMessage({ type: 'morphology:done', requestId, processed: 0, total: 0 });
      return;
    }

    let total = 0;
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction('keywords', 'readonly');
        const store = tx.objectStore('keywords');
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cur = (e.target as IDBRequest).result;
          if (!cur) return resolve();
          const v = cur.value || {};
          const isMatch = String(v.projectId || 'anon') === projectId && !v.morphology_processed;
          if (isMatch) total++;
          cur.continue();
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });

    if (total === 0) {
      self.postMessage({ type: 'morphology:done', requestId, processed: 0, total: 0 });
      return;
    }

    let processed = 0;
    let batchItems: any[] = [];

    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction('keywords', 'readwrite');
        const store = tx.objectStore('keywords');
        const req = store.openCursor();
        req.onsuccess = async (e) => {
          const cur = (e.target as IDBRequest).result;
          if (!cur) {
            if (batchItems.length > 0) {
              for (const it of batchItems) store.put(it);
              processed += batchItems.length;
              self.postMessage({ type: 'morphology:progress', requestId, processed, total });
              batchItems = [];
            }
            return resolve();
          }
          const v = cur.value || {};
          if (String(v.projectId || 'anon') === projectId && !v.morphology_processed) {
            try {
              const orig = v.keyword || '';
              const { lemma, tags, grammemes } = await normalizeKeywordText(orig);
              v.lemma = lemma;
              v.tags = tags;
              if (grammemes) v.grammemes = grammemes;
              v.morphology_processed = 1;
              batchItems.push(v);
            } catch (err) {
              const fallbackKey = String(v.keyword || '').trim().toLowerCase();
              const fallbackParts = fallbackKey.split(/\s+/g).filter((w) => !!w);
              const fallbackTags = [...fallbackParts].sort((a, b) => a.localeCompare(b, 'ru')).join(',');
              v.lemma = v.lemma || fallbackKey;
              v.tags = v.tags || fallbackTags;
              v.grammemes = v.grammemes || '';
              v.morphology_processed = 1;
              batchItems.push(v);
            }
            if (batchItems.length >= BATCH) {
              for (const it of batchItems) store.put(it);
              processed += batchItems.length;
              self.postMessage({ type: 'morphology:progress', requestId, processed, total });
              batchItems = [];
            }
          }
          cur.continue();
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });

    self.postMessage({ type: 'morphology:done', requestId, processed: processed || total, total });
  } catch (err: any) {
    self.postMessage({ type: 'error', requestId, error: String(err) });
  }
});

export {};
