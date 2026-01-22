type Keyword = { id: string; projectId?: string; keyword: string; created_at?: string }

const DB_NAME = 'app-db'

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onupgradeneeded = () => {
      // do not create stores here: main thread manages schema; just allow upgrade to proceed
    }
  })
}

async function transactionPutBulk(db: IDBDatabase, storeName: string, items: any[]) {
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      for (const it of items) {
        store.put(it)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('transaction aborted'))
    } catch (e) {
      reject(e)
    }
  })
}


self.addEventListener('message', async (event) => {
  const { type, payload, requestId } = event.data || {}
  try {
    if (type === 'saveKeywords') {
      // payload can be either an array of items (legacy) or an object { raw, projectId, chunkSize }
      let items: Keyword[] = []
      const db = await openIDB()
      if (!db.objectStoreNames.contains('keywords')) {
        throw new Error('keywords object store not found in IndexedDB; ensure main thread created schema')
      }

      if (Array.isArray(payload)) {
        items = payload as Keyword[]
      } else if (payload && typeof payload === 'object' && typeof payload.raw === 'string') {
        // Stream-parse raw text into keywords and write in chunks to minimize
        // peak memory and per-item allocations.
        const raw: string = payload.raw
        const projectId: string = payload.projectId || 'anon'
        const chunkSize: number = Number(payload.chunkSize) || 2000
        const parts = raw.split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean)

        const CHUNK = Math.max(500, Math.min(10000, chunkSize))

        // First pass: compute total unique ids to report accurate totals
        const idSet = new Set<string>()
        for (let i = 0; i < parts.length; i++) {
          const k = parts[i]
          const id = `${projectId}::${encodeURIComponent(k)}`
          idSet.add(id)
        }
        const totalUnique = idSet.size

        // Second pass: stream unique items, removing ids from the set as we emit them
        let written = 0
        let currentChunk: Keyword[] = []
        for (let i = 0; i < parts.length; i++) {
          const k = parts[i]
          const id = `${projectId}::${encodeURIComponent(k)}`
          if (!idSet.has(id)) continue
          idSet.delete(id)
          // One timestamp per chunk
          const now = new Date().toISOString()
          currentChunk.push({ id, projectId, keyword: k, created_at: now })
          if (currentChunk.length >= CHUNK) {
            await transactionPutBulk(db, 'keywords', currentChunk)
            written += currentChunk.length
            self.postMessage({ type: 'saveKeywords:progress', requestId, written, total: totalUnique })
            currentChunk = []
          }
        }

        if (currentChunk.length > 0) {
          await transactionPutBulk(db, 'keywords', currentChunk)
          written += currentChunk.length
          self.postMessage({ type: 'saveKeywords:progress', requestId, written, total: totalUnique })
        }

        self.postMessage({ type: 'saveKeywords:done', requestId, count: written })
        return
      } else {
        // unknown payload
        self.postMessage({ type: 'saveKeywords:done', requestId, count: 0 })
        return
      }

      // Legacy array-path: write in chunks to avoid large transactions and allow progress reporting
      const CHUNK = 1000
      let written = 0
      for (let i = 0; i < items.length; i += CHUNK) {
        const chunk = items.slice(i, i + CHUNK)
        await transactionPutBulk(db, 'keywords', chunk)
        written += chunk.length
        self.postMessage({ type: 'saveKeywords:progress', requestId, written, total: items.length })
      }
      self.postMessage({ type: 'saveKeywords:done', requestId, count: written })
    }
  } catch (err: any) {
    self.postMessage({ type: 'error', requestId, error: String(err) })
  }
})

export {}
