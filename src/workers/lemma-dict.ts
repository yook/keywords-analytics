import pako from 'pako';

export type LemmaEntry = {
  lemma: string;
  grammemeIndexes?: Uint16Array;
};

export type LemmasDict = Record<string, LemmaEntry>;

const CACHE_KEY = Symbol('lemma-dict-cache');
const textDecoder = new TextDecoder('utf-8');

const DICT_DB_NAME = 'morph-dicts';
const DICT_STORE_NAME = 'dicts';
const LEMMA_DICT_ID = 'lemma/lemmas.bin';
const DECOMPRESSED_RECORD_ID = 'lemma/lemmas.decompressed';
const PARSED_RECORD_ID = 'lemma/lemmas.parsed';
const LEMMA_DICT_VERSION = '2026-01-15'; // bump when /assets/lemmas.bin changes

let cachedPromise: Promise<{ dict: LemmasDict; grammarTable: string[] }> | null = null;
let lemmaDictReadyNotified = false;

function notifyLemmaDictReady() {
  if (lemmaDictReadyNotified) return;
  lemmaDictReadyNotified = true;
  try {
    const globalSelf = typeof self !== 'undefined' ? (self as any) : null;
    if (globalSelf && typeof globalSelf.postMessage === 'function') {
      globalSelf.postMessage({ type: 'lemma-dict:loaded' });
    }
  } catch (err) {
    // ignore notification failures
  }
}

function readUint8(view: DataView, offset: number) {
  return view.getUint8(offset);
}

function readUint16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

function decodeString(view: DataView, buffer: Uint8Array, offset: number, length: number) {
  const slice = buffer.subarray(offset, offset + length);
  return textDecoder.decode(slice);
}

type DictCacheRecord = {
  id: string;
  version: string;
  data: ArrayBuffer;
  updatedAt: number;
};

type ParsedDictRecord = {
  id: string;
  version: string;
  dict: LemmasDict;
  grammarTable: string[];
  updatedAt: number;
};

function isIndexedDBAvailable() {
  return typeof indexedDB !== 'undefined';
}

function openDictDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DICT_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DICT_STORE_NAME)) {
        db.createObjectStore(DICT_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readRecord<T extends DictCacheRecord | ParsedDictRecord>(id: string): Promise<T | null> {
  if (!isIndexedDBAvailable()) return null;
  const db = await openDictDatabase();
  try {
    const tx = db.transaction(DICT_STORE_NAME, 'readonly');
    const store = tx.objectStore(DICT_STORE_NAME);
    const req = store.get(id);
    const record = await new Promise<T | undefined>((resolve, reject) => {
      req.onsuccess = (event) => resolve((event.target as IDBRequest).result);
      req.onerror = () => reject(req.error);
    });
    return record || null;
  } finally {
    db.close();
  }
}

async function storeRecord<T extends DictCacheRecord | ParsedDictRecord>(payload: T) {
  if (!isIndexedDBAvailable()) return;
  const db = await openDictDatabase();
  try {
    const tx = db.transaction(DICT_STORE_NAME, 'readwrite');
    const store = tx.objectStore(DICT_STORE_NAME);
    store.put(payload);
    await new Promise<void>((resolve, reject) => {
      const handleError = () => reject(tx.error || new Error('dict cache transaction failed'));
      tx.oncomplete = () => resolve();
      tx.onerror = handleError;
      tx.onabort = handleError;
    });
  } finally {
    db.close();
  }
}

async function loadRawDict() {
  const url = `${import.meta.env.BASE_URL}assets/lemmas.bin`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function parseLemmaDict(decompressed: Uint8Array) {
  const view = new DataView(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength);
  let offset = 0;
  const magic = decodeString(view, decompressed, offset, 4);
  offset += 4;
  if (magic !== 'LMDB') {
    throw new Error('Invalid lemma dictionary header');
  }
  const version = readUint8(view, offset);
  offset += 1;
  if (version !== 1) {
    throw new Error(`Unsupported lemma dictionary version ${version}`);
  }
  const entryCount = readUint32(view, offset);
  offset += 4;
  const grammemeCount = readUint16(view, offset);
  offset += 2;
  const grammarTable: string[] = [];
  for (let i = 0; i < grammemeCount; i += 1) {
    const len = readUint8(view, offset);
    offset += 1;
    grammarTable.push(decodeString(view, decompressed, offset, len));
    offset += len;
  }
  const dict: LemmasDict = {};
  for (let i = 0; i < entryCount; i += 1) {
    const wordLen = readUint16(view, offset);
    offset += 2;
    const word = decodeString(view, decompressed, offset, wordLen);
    offset += wordLen;
    const lemmaLen = readUint16(view, offset);
    offset += 2;
    const lemma = decodeString(view, decompressed, offset, lemmaLen);
    offset += lemmaLen;
    const gramCount = readUint8(view, offset);
    offset += 1;
    let gramIndexes: Uint16Array | undefined;
    if (gramCount > 0) {
      gramIndexes = new Uint16Array(gramCount);
      for (let j = 0; j < gramCount; j += 1) {
        const gramIdx = readUint16(view, offset);
        offset += 2;
        gramIndexes[j] = gramIdx;
      }
    }
    const lowered = word.toLowerCase();
    dict[lowered] = gramIndexes && gramIndexes.length ? { lemma, grammemeIndexes: gramIndexes } : { lemma };
  }
  return { dict, grammarTable, entryCount, grammemeCount };
}

export async function loadLemmaDict(): Promise<{ dict: LemmasDict; grammarTable: string[] }> {
  if (cachedPromise) {
    return cachedPromise;
  }
  cachedPromise = (async () => {
    try {
      const cachedParsed = await readRecord<ParsedDictRecord>(PARSED_RECORD_ID);
      if (cachedParsed && cachedParsed.version === LEMMA_DICT_VERSION) {
        console.log(`[lemma-dict] using parsed cache version ${cachedParsed.version}`);
        notifyLemmaDictReady();
        return { dict: cachedParsed.dict, grammarTable: cachedParsed.grammarTable };
      }
    } catch (err) {
      console.warn('[lemma-dict] failed to read parsed cache', err);
    }
    let decompressed: Uint8Array | null = null;
    try {
      const cachedDecompressed = await readRecord<DictCacheRecord>(DECOMPRESSED_RECORD_ID);
      if (cachedDecompressed && cachedDecompressed.version === LEMMA_DICT_VERSION) {
        decompressed = new Uint8Array(cachedDecompressed.data);
        console.log(`[lemma-dict] using stored decompressed buffer version ${cachedDecompressed.version}`);
      }
    } catch (err) {
      console.warn('[lemma-dict] failed to read decompressed cache', err);
    }
    if (!decompressed) {
      const compressed = await loadRawDict();
      decompressed = pako.ungzip(compressed);
      try {
        await storeRecord<DictCacheRecord>({
          id: DECOMPRESSED_RECORD_ID,
          version: LEMMA_DICT_VERSION,
          data: decompressed.buffer.slice(decompressed.byteOffset, decompressed.byteOffset + decompressed.byteLength),
          updatedAt: Date.now(),
        });
        console.log(`[lemma-dict] stored decompressed buffer version ${LEMMA_DICT_VERSION}`);
      } catch (err) {
        console.warn('[lemma-dict] failed to store decompressed buffer', err);
      }
    }
      const parsed = parseLemmaDict(decompressed);
      try {
        await storeRecord<ParsedDictRecord>({
          id: PARSED_RECORD_ID,
          version: LEMMA_DICT_VERSION,
          dict: parsed.dict,
          grammarTable: parsed.grammarTable,
          updatedAt: Date.now(),
        });
        console.log(`[lemma-dict] cached parsed dictionary version ${LEMMA_DICT_VERSION}`);
      } catch (err) {
        console.warn('[lemma-dict] failed to store parsed snapshot', err);
      }
      console.log(`[lemma-dict] loaded ${parsed.entryCount} entries with ${parsed.grammarTable.length} grammemes`);
      notifyLemmaDictReady();
      return { dict: parsed.dict, grammarTable: parsed.grammarTable };
  })();
  return cachedPromise;
}
