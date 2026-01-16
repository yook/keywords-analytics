import { loadLemmaDict } from './lemma-dict';

type ResolvedEntry = {
  lemma: string;
  grammemes?: string[];
};

let loadingPromise: Promise<void> | null = null;
let ready = false;
let dictRef: Record<string, { lemma: string; grammemeIndexes?: Uint16Array }> | null = null;
let grammarTableRef: string[] | null = null;
const resolvedCache = new Map<string, ResolvedEntry | null>();

async function ensureLoaded() {
  if (ready) return;
  if (!loadingPromise) {
    console.log('[lemma-shared] loading dictionary...');
    loadingPromise = loadLemmaDict()
      .then(({ dict, grammarTable }) => {
        dictRef = dict;
        grammarTableRef = grammarTable;
        ready = true;
        console.log('[lemma-shared] dictionary loaded');
      })
      .catch((err) => {
        console.error('[lemma-shared] dictionary load failed', err);
        loadingPromise = null;
        throw err;
      });
  }
  await loadingPromise;
}

function resolveEntry(word: string): ResolvedEntry | null {
  const key = String(word || '').toLowerCase();
  if (!key) return null;
  if (resolvedCache.has(key)) return resolvedCache.get(key) || null;
  if (!dictRef) return null;
  const entry = dictRef[key];
  if (!entry) {
    resolvedCache.set(key, null);
    return null;
  }
  let grammemes: string[] | undefined;
  if (entry.grammemeIndexes && grammarTableRef) {
    grammemes = Array.from(entry.grammemeIndexes)
      .map((idx) => grammarTableRef![idx])
      .filter(Boolean);
  }
  const resolved: ResolvedEntry = { lemma: entry.lemma, grammemes };
  resolvedCache.set(key, resolved);
  return resolved;
}

self.onconnect = (event: MessageEvent) => {
  const port = (event as any).ports?.[0];
  if (!port) return;

  port.onmessage = async (ev: MessageEvent) => {
    const msg = (ev as any).data || {};
    if (msg.type === 'lemma:status') {
      port.postMessage({ type: 'lemma:status', ready });
      return;
    }
    if (msg.type === 'lemma:load') {
      try {
        await ensureLoaded();
        port.postMessage({ type: 'lemma:ready' });
      } catch (err) {
        port.postMessage({ type: 'lemma:error', error: String(err) });
      }
    }
    if (msg.type === 'lemma:get') {
      const words = Array.isArray(msg.words) ? msg.words : [];
      try {
        await ensureLoaded();
        const entries: Record<string, ResolvedEntry | null> = {};
        for (const w of words) {
          if (!w) continue;
          const key = String(w).toLowerCase();
          entries[key] = resolveEntry(key);
        }
        port.postMessage({ type: 'lemma:entries', requestId: msg.requestId, entries });
      } catch (err) {
        port.postMessage({ type: 'lemma:error', requestId: msg.requestId, error: String(err) });
      }
    }
  };

  try {
    port.start?.();
  } catch (_) {}

  // Start loading immediately on connect
  ensureLoaded()
    .then(() => port.postMessage({ type: 'lemma:ready' }))
    .catch((err) => port.postMessage({ type: 'lemma:error', error: String(err) }));
};

// Trigger loading immediately when the shared worker spins up so the dictionary stays warm.
ensureLoaded().catch((err) => console.error('[lemma-shared] preload failed', err));
