// Worker that loads dict ArrayBuffer from IndexedDB and posts it back (transferable)
self.addEventListener('message', async (ev) => {
  const msg = ev.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'load') {
    const id = msg.id; // expected format: 'lang/filename'
    try {
      const dbReq = indexedDB.open('morph-dicts', 1);
      const db = await new Promise<IDBDatabase>((res, rej) => {
        dbReq.onsuccess = () => res(dbReq.result);
        dbReq.onerror = () => rej(dbReq.error);
        dbReq.onupgradeneeded = () => {
          const d = dbReq.result;
          if (!d.objectStoreNames.contains('dicts')) d.createObjectStore('dicts', { keyPath: 'id' });
        };
      });

      const tx = db.transaction('dicts', 'readonly');
      const store = tx.objectStore('dicts');
      const req = store.get(id);
      const rec = await new Promise<any>((resolve, reject) => { req.onsuccess = e => resolve((e.target as IDBRequest).result); req.onerror = () => reject(req.error); });
      db.close();

      if (!rec) {
        (self as any).postMessage({ type: 'error', id, error: 'not_found' });
        return;
      }

      const buffer: ArrayBuffer = rec.data;
      (self as any).postMessage({ type: 'loaded', id, size: buffer.byteLength }, [buffer]);
    } catch (err) {
      (self as any).postMessage({ type: 'error', id, error: String(err) });
    }
  }
});
