// Utilities to download dictionary files and store/load them in IndexedDB
export type ProgressHandler = (received: number, total?: number) => void;

const DB_NAME = 'morph-dicts';
const STORE_NAME = 'dicts';
const DB_VER = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function downloadAndStoreDict(
  lang: string,
  url: string,
  filename?: string,
  onProgress?: ProgressHandler
): Promise<{ id: string; size: number }>{
  const res = await fetch(url);
  if (!res.ok) throw new Error('Download failed: ' + res.status);

  const contentLength = res.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : undefined;

  const fname = filename || url.split('/').pop() || `${lang}.dict`;
  const id = `${lang}/${fname}`;

  const reader = res.body?.getReader();
  if (!reader) throw new Error('ReadableStream not supported');

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (onProgress) onProgress(received, total);
    }
  }

  // concat
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    buffer.set(c, offset);
    offset += c.length;
  }

  // store in IndexedDB as ArrayBuffer
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const record = { id, data: buffer.buffer, updatedAt: Date.now() };
  store.put(record);
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; tx.onabort = rej; });
  db.close();

  return { id, size: received };
}

export async function getDict(lang: string, filename: string): Promise<ArrayBuffer | null> {
  const id = `${lang}/${filename}`;
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(id);
  const rec = await new Promise<any>((resolve, reject) => {
    req.onsuccess = e => resolve((e.target as IDBRequest).result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rec ? rec.data as ArrayBuffer : null;
}

export async function listDicts(): Promise<string[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const req = store.getAllKeys();
  const keys = await new Promise<any[]>((res, rej) => { req.onsuccess = e => res((e.target as IDBRequest).result); req.onerror = rej; });
  db.close();
  return keys as string[];
}
