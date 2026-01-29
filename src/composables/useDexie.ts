import Dexie from 'dexie'
import { ref } from 'vue'

type Project = { id: string; name: string; url?: string; data?: any }
type Keyword = {
  id: string;
  projectId?: string;
  keyword: string;
  created_at?: string;
  lemma?: string;
  tags?: string;
  morphology_processed?: number;
  category_name?: string;
  category_similarity?: number;
  class_name?: string;
  class_similarity?: number;
  classification_label?: string;
  classification_score?: number;
  cluster_label?: string;
  cluster_score?: number;
  target_query?: number | boolean;
  is_valid_headline?: number | boolean;
  moderation_flagged?: number | boolean;
  moderation_categories?: string;
  moderation_checked_at?: string;
  moderation_model?: string;
}

type StopWord = {
  id: string;
  word: string;
  projectId?: string;
  created_at?: string;
}

type TypingSample = {
  id?: string;
  projectId?: number | string;
  label: string;
  text: string;
  created_at?: string;
}

type EmbeddingsCacheEntry = {
  id?: string;
  key: string;
  embedding: ArrayBuffer;
  vector_model: string;
  created_at?: string;
}

type ClassificationModel = {
  id?: string;
  projectId: number | string;
  W: ArrayBuffer; // stored as ArrayBuffer for efficiency
  b: ArrayBuffer;
  labels: string[];
  D: number;
  model_version: string;
  created_at?: string;
  updated_at?: string;
}

class AppDB extends Dexie {
  projects!: Dexie.Table<Project, string>
  greetings!: Dexie.Table<{ id: number; text: string }, number>
  keywords!: Dexie.Table<Keyword, string>
  stopwords!: Dexie.Table<StopWord, string>
  typing_samples!: Dexie.Table<TypingSample, string>
  embeddings_cache!: Dexie.Table<EmbeddingsCacheEntry, string>
  classification_models!: Dexie.Table<ClassificationModel, string>

  constructor() {
    super('app-db')
    // initial schema
    this.version(1).stores({
      projects: '&id,name,url,data',
      greetings: '++id,text',
    })
    // add keywords in version 2 (upgrade path for existing DBs)
    // include projectId and compound indexes for efficient per-project queries
    this.version(2).stores({
      keywords: '&id,projectId,keyword,created_at,lemma,tags,morphology_processed,[projectId+created_at],[projectId+keyword]',
    })
    // add stopwords in version 3
    this.version(3).stores({
      stopwords: '&id,projectId,word,created_at,[projectId+word]',
    })
    // add typing_samples in version 4 for classification/typing training data persistence
    this.version(4).stores({
      typing_samples: '&id,projectId,label,created_at,[projectId+label]',
    })
    // add embeddings_cache in version 5 for storing OpenAI embeddings
    this.version(5).stores({
      embeddings_cache: '&id,key,vector_model,created_at,[key+vector_model]',
    })
    // add classification_models in version 6 for storing trained models per project
    this.version(6).stores({
      classification_models: '&id,projectId,created_at,updated_at',
    })

    // version 7: ensure projects has data field and other tables are consistent
    this.version(7).stores({
      projects: '&id,name,url,data',
      keywords: '&id,projectId,keyword,created_at,lemma,tags,morphology_processed,[projectId+created_at],[projectId+keyword]',
      stopwords: '&id,projectId,word,created_at,[projectId+word]',
      typing_samples: '&id,projectId,label,created_at,[projectId+label]',
      embeddings_cache: '&id,key,vector_model,created_at,[key+vector_model]',
      classification_models: '&id,projectId,created_at,updated_at',
    })
  }
}

const dbRef = ref<AppDB | null>(null)
let initPromise: Promise<AppDB> | null = null

export function useDexie() {
  async function init() {
    if (dbRef.value) return dbRef.value
    if (initPromise) return initPromise
    initPromise = (async () => {
      const db = new AppDB()
      // open DB (Dexie opens lazily but call open to ensure ready)
      try {
        await db.open()
        // After opening, validate schema: ensure `keywords` store exists and has expected indexes.
        try {
          const table = (db as any).keywords
          const schema = table && table.schema
          const hasProjectIdIndex = schema && Array.isArray(schema.indexes) && schema.indexes.some((ix: any) => {
            const kp = ix && ix.keyPath
            if (!kp) return false
            if (typeof kp === 'string') return kp === 'projectId'
            if (Array.isArray(kp)) return kp.includes('projectId')
            return false
          })
          if (!table || !schema || !hasProjectIdIndex) {
            // Schema mismatch: attempt to safely close and reopen with expected schema
            try {
              await db.close()
            } catch (e) {}
            // Recreate and open a fresh DB instance which will perform
            // Dexie upgrade without forcibly deleting existing IndexedDB data.
            const fresh = new AppDB()
            await fresh.open()
            dbRef.value = fresh
            return fresh
          }
        } catch (e) {
          // If schema inspection fails, fall through to using the opened DB
        }
      } catch (e) {
        // If open fails, try closing and recreating a fresh DB instance (best-effort)
        try { await db.close() } catch (er) {}
        const fresh = new AppDB()
        await fresh.open()
        dbRef.value = fresh
        return fresh
      }
      dbRef.value = db
      return db
    })()
    try {
      return await initPromise
    } finally {
      initPromise = null
    }
  }

  async function getProjects(): Promise<Project[]> {
    const db = await init()
    return await db.projects.toArray()
  }

  async function addOrUpdateProject(p: Project) {
    const db = await init()
    await db.projects.put(p)
  }

  async function saveProjects(list: Project[]) {
    const db = await init()
    // Use sequential operations instead of a single transaction to avoid
    // PrematureCommitError in environments where transaction lifecycle
    // can be interfered with by other async tasks.
    await db.projects.clear()
    if (list && list.length) await db.projects.bulkPut(list)
  }

  async function deleteProject(id: string) {
    const db = await init()
    const pid = String(id)
    try {
      // 1. Delete associated data from other tables
      if (db.keywords) await db.keywords.where('projectId').equals(pid).delete()
      if (db.stopwords) await db.stopwords.where('projectId').equals(pid).delete()
      if (db.typing_samples) await db.typing_samples.where('projectId').equals(pid).delete()
      if (db.classification_models) await db.classification_models.where('projectId').equals(pid).delete()
      
      // 2. Delete project itself
      await db.projects.delete(pid)
    } catch (e) {
      console.warn('deleteProject failed partially', e)
      // Attempt project deletion anyway if specific table deletes failed
      try {
        await db.projects.delete(pid)
      } catch (er) {}
    }
  }

  async function getGreetings() {
    const db = await init()
    return await db.greetings.toArray()
  }

  async function addGreeting(text: string) {
    const db = await init()
    return await db.greetings.add({ id: Date.now(), text })
  }

  async function getKeywords() {
    const db = await init()
    return await db.keywords.toArray()
  }

  async function addKeyword(item: Keyword) {
    const db = await init()
    // ensure deterministic id when projectId+keyword provided
    if ((!item.id || item.id === '') && item.projectId && item.keyword) {
      item.id = `${item.projectId}::${encodeURIComponent(item.keyword.trim().toLowerCase())}`
    }
    return await db.keywords.put(item)
  }

  async function updateKeyword(item: Keyword) {
    const db = await init()
    if (!item.id) {
      throw new Error('Cannot update keyword without id')
    }
    return await db.keywords.put(item)
  }

  async function bulkPutKeywords(items: Keyword[]) {
    const db = await init()
    if (!items || items.length === 0) return
    // ensure deterministic ids for items that miss them
    for (const it of items) {
      if ((!it.id || it.id === '') && it.projectId && it.keyword) {
        it.id = `${it.projectId}::${encodeURIComponent(it.keyword.trim().toLowerCase())}`
      }
    }
    // Avoid explicit transaction to prevent PrematureCommitError in async-heavy flows
    await db.keywords.bulkPut(items)
  }

  async function clearKeywords() {
    const db = await init()
    await db.keywords.clear()
  }

  async function getKeywordsByProject(projectId: string, options?: { offset?: number; limit?: number; reverse?: boolean }) {
    const db = await init()
    const offset = options?.offset || 0
    const limit = options?.limit || 100
    const reverse = options?.reverse || false

    // Try using indexed queries when schema supports projectId index for much better performance
    try {
      const table = (db as any).keywords
      const schema = table && table.schema
      const hasProjectIdIndex = schema && Array.isArray(schema.indexes) && schema.indexes.some((ix: any) => {
        const kp = ix && ix.keyPath
        if (!kp) return false
        if (typeof kp === 'string') return kp === 'projectId'
        if (Array.isArray(kp)) return kp.includes('projectId')
        return false
      })

      if (hasProjectIdIndex) {
        let collection = table.where('projectId').equals(String(projectId))
        if (reverse && typeof collection.reverse === 'function') collection = collection.reverse()
        if (offset && typeof collection.offset === 'function') collection = collection.offset(offset)
        if (limit && typeof collection.limit === 'function') collection = collection.limit(limit)
        const rows = await collection.toArray()
        return rows
      }
    } catch (e) {
      // if any error, fallback to full-scan
    }

    // Fallback: safe full-scan + in-memory filter
    const all = await (db as any).keywords.toArray()
    let filtered = all.filter((k: any) => String(k.projectId) === String(projectId))
    if (reverse) filtered = filtered.reverse()
    if (offset) filtered = filtered.slice(offset)
    if (limit) filtered = filtered.slice(0, limit)
    return filtered
  }

  async function deleteKeywordsByProject(projectId: string) {
    const db = await init()
    try {
      const table = (db as any).keywords
      if (table && typeof table.where === 'function') {
        // Use indexed delete when available
        try {
          await table.where('projectId').equals(String(projectId)).delete()
          return
        } catch (e) {
          // fallthrough to full-scan fallback
        }
      }

      // Fallback: scan and bulkDelete
      const all = await (db as any).keywords.toArray()
      const ids = all.filter((k: any) => String(k.projectId) === String(projectId)).map((k: any) => k.id).filter(Boolean)
      if (ids.length && typeof (db as any).keywords.bulkDelete === 'function') {
        try {
          await (db as any).keywords.bulkDelete(ids)
        } catch (e) {}
      } else {
        for (const id of ids) {
          try { await (db as any).keywords.delete(id) } catch (e) {}
        }
      }
    } catch (e) {
      // ignore best-effort
    }
  }

  // Cursor-based page fetch suitable for virtualized tables.
  // Returns { items, nextCursor, total } where nextCursor can be used
  // to fetch the following page. Uses a robust full-scan + in-memory
  // paging to avoid SchemaError across DB versions. For very large
  // datasets you can later switch to an indexed implementation.
  async function getKeywordsPage(projectId: string, opts?: { limit?: number; after?: { created_at?: string; id?: string }; reverse?: boolean }) {
    const db = await init()
    const limit = opts?.limit || 100
    const reverse = !!opts?.reverse
    const after = opts?.after || null

    // Try an indexed cursor-based query when possible (prefers [projectId+created_at] index)
    try {
      const table = (db as any).keywords
      const schema = table && table.schema
      const hasCompoundIndex = schema && Array.isArray(schema.indexes) && schema.indexes.some((ix: any) => {
        const kp = ix && ix.keyPath
        if (!kp) return false
        // keyPath may be array for compound index, or string for simple index
        if (Array.isArray(kp)) return kp.includes('projectId') && kp.includes('created_at')
        if (typeof kp === 'string') return kp === 'projectId' || kp === 'created_at'
        return false
      })

      if (hasCompoundIndex) {
        // Use compound index range to fetch the page ordered by created_at then id
        // Use between to get all items for projectId and then slice/limit
        let collection = table.where('[projectId+created_at]').between([String(projectId), ''], [String(projectId), '\uffff'])
        if (reverse && typeof collection.reverse === 'function') collection = collection.reverse()
        // If `after` cursor provided, advance the collection to start after that cursor
        if (after && after.created_at) {
          // We'll do a client-side skip until we pass the cursor when necessary
          const allItems = await collection.toArray()
          let startIndex = 0
          if (after) {
            startIndex = allItems.findIndex((it: any) => {
              const ta = it && it.created_at ? String(it.created_at) : ''
              const ida = it && it.id ? String(it.id) : ''
              const ca = after.created_at ? String(after.created_at) : ''
              const ida_cursor = after.id ? String(after.id) : ''
              if (ta > ca) return true
              if (ta < ca) return false
              return ida > ida_cursor
            })
            if (startIndex === -1) startIndex = allItems.length
          }
          const items = allItems.slice(startIndex, startIndex + limit)
          const nextCursorItem = items[items.length - 1]
          const nextCursor = nextCursorItem ? { created_at: nextCursorItem.created_at, id: nextCursorItem.id } : null
          return { items, nextCursor, total: allItems.length }
        }

        // No cursor: just return first `limit` items
        const items = (await collection.limit(limit).toArray()) || []
        const total = (await table.where('projectId').equals(String(projectId)).count()) || items.length
        let nextCursor = null
        if (items && items.length === limit) {
          const last = items[items.length - 1]
          if (last) nextCursor = { created_at: last.created_at, id: last.id }
        }
        return { items, nextCursor, total }
      }
    } catch (e) {
      // ignore and fallback
    }

    // Fallback: full scan + in-memory paging as before
    const all = await (db as any).keywords.toArray()
    let filtered = all.filter((k: any) => String(k.projectId) === String(projectId))

    // Normalize created_at for sorting (undefined -> '')
    filtered.sort((a: any, b: any) => {
      const ta = a && a.created_at ? String(a.created_at) : ''
      const tb = b && b.created_at ? String(b.created_at) : ''
      if (ta < tb) return -1
      if (ta > tb) return 1
      const ida = a && a.id ? String(a.id) : ''
      const idb = b && b.id ? String(b.id) : ''
      if (ida < idb) return -1
      if (ida > idb) return 1
      return 0
    })

    if (reverse) filtered = filtered.reverse()

    let start = 0
    if (after) {
      // find first item strictly greater than `after` in the current ordering
      start = filtered.findIndex((it: any) => {
        const ta = it && it.created_at ? String(it.created_at) : ''
        const ida = it && it.id ? String(it.id) : ''
        const ca = after.created_at ? String(after.created_at) : ''
        const ida_cursor = after.id ? String(after.id) : ''
        if (ta > ca) return true
        if (ta < ca) return false
        return ida > ida_cursor
      })
      if (start === -1) start = filtered.length
      else start = start
    }

    const items = filtered.slice(start, start + limit)
    const total = filtered.length
    let nextCursor: { created_at?: string; id?: string } | null = null
    if (start + limit < filtered.length) {
      const last = items[items.length - 1]
      if (last) nextCursor = { created_at: last.created_at, id: last.id }
    }
    return { items, nextCursor, total }
  }

  async function getKeywordsCountByProject(projectId: string) {
    const db = await init()
    try {
      const table = (db as any).keywords
      const schema = table && table.schema
      const hasProjectIdIndex = schema && Array.isArray(schema.indexes) && schema.indexes.some((ix: any) => {
        const kp = ix && ix.keyPath
        if (!kp) return false
        if (typeof kp === 'string') return kp === 'projectId'
        if (Array.isArray(kp)) return kp.includes('projectId')
        return false
      })

      if (hasProjectIdIndex) {
        try {
          const cnt = await table.where('projectId').equals(String(projectId)).count()
          return cnt
        } catch (e) {
          // fallthrough to full-scan fallback
        }
      }

      // Always fallback to full-scan count to avoid schema/index issues
      const all = await (db as any).keywords.toArray()
      const cnt2 = all.filter((k: any) => String(k.projectId) === String(projectId)).length
      return cnt2
    } catch (e) {
      // as a last resort, attempt a filtered scan
      try {
        const all = await db.keywords.toArray()
        return all.filter((k: any) => String(k.projectId) === String(projectId)).length
      } catch (e2) {
        return 0
      }
    }
  }

  async function persistToIndexedDB() {
    // Dexie uses IndexedDB directly; nothing to do (kept for compatibility)
    await init()
    return
  }

  async function restoreFromIndexedDB() {
    // noop because data is already in IndexedDB/Dexie
    return await init()
  }

  async function downloadPersistedDB(filename = 'dexie-projects.json') {
    const db = await init()
    const projects = await db.projects.toArray()
    const blob = new Blob([JSON.stringify(projects, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // stopwords API
  async function getStopwordsByProject(projectId: string): Promise<StopWord[]> {
    const db = await init()
    try {
      return await db.stopwords.where('projectId').equals(String(projectId)).toArray()
    } catch (e) {
      // fallback
      const all = await db.stopwords.toArray()
      return all.filter(s => String(s.projectId) === String(projectId))
    }
  }

  async function addStopword(item: StopWord) {
    const db = await init()
    if (!item.id) {
      item.id = `${item.projectId || 'global'}::${encodeURIComponent(item.word.trim().toLowerCase())}`
    }
    return await db.stopwords.put(item)
  }

  async function deleteStopword(id: string) {
    const db = await init()
    return await db.stopwords.delete(id)
  }

  async function clearStopwordsByProject(projectId: string) {
    const db = await init()
    try {
      await db.stopwords.where('projectId').equals(String(projectId)).delete()
    } catch (e) {
      // fallback
      const all = await db.stopwords.toArray()
      const ids = all.filter(s => String(s.projectId) === String(projectId)).map(s => s.id)
      await db.stopwords.bulkDelete(ids)
    }
  }

  // typing samples API for classification training data persistence
  async function getTypingSamplesByProject(projectId: number | string): Promise<TypingSample[]> {
    const db = await init()
    try {
      return await db.typing_samples.where('projectId').equals(String(projectId)).toArray()
    } catch (e) {
      // fallback
      const all = await db.typing_samples.toArray()
      return all.filter(s => String(s.projectId) === String(projectId))
    }
  }

  async function addTypingSample(item: TypingSample) {
    const db = await init()
    if (!item.id) {
      item.id = `${item.projectId}::${item.label}::${encodeURIComponent(item.text.trim().toLowerCase())}`
    }
    if (!item.created_at) {
      item.created_at = new Date().toISOString()
    }
    return await db.typing_samples.put(item)
  }

  async function deleteTypingSample(id: string) {
    const db = await init()
    return await db.typing_samples.delete(id)
  }

  async function deleteTypingSamplesByLabel(projectId: number | string, label: string) {
    const db = await init()
    try {
      const all = await db.typing_samples.where('projectId').equals(String(projectId)).toArray()
      const ids = all.filter(s => s.label === label).map(s => s.id).filter((id): id is string => !!id)
      if (ids.length > 0) {
        await db.typing_samples.bulkDelete(ids)
      }
    } catch (e) {
      // fallback: manual deletion
      const all = await db.typing_samples.toArray()
      const ids = all.filter(s => String(s.projectId) === String(projectId) && s.label === label).map(s => s.id).filter((id): id is string => !!id)
      for (const id of ids) {
        try {
          await db.typing_samples.delete(id)
        } catch (e2) {}
      }
    }
  }

  async function clearTypingSamplesByProject(projectId: number | string) {
    const db = await init()
    try {
      await db.typing_samples.where('projectId').equals(String(projectId)).delete()
    } catch (e) {
      // fallback
      const all = await db.typing_samples.toArray()
      const ids = all.filter(s => String(s.projectId) === String(projectId)).map(s => s.id).filter((id): id is string => !!id)
      if (ids.length > 0) {
        await db.typing_samples.bulkDelete(ids)
      }
    }
  }

  // Embeddings cache functions
  async function embeddingsCachePut(key: string, embedding: number[], vector_model: string = 'text-embedding-3-small') {
    const db = await init()
    const id = `${vector_model}:${key}`
    // Convert Float32Array to ArrayBuffer
    const buffer = new Float32Array(embedding).buffer
    await db.embeddings_cache.put({
      id,
      key,
      embedding: buffer,
      vector_model,
      created_at: new Date().toISOString(),
    })
  }

  async function embeddingsCacheGet(key: string, vector_model: string = 'text-embedding-3-small'): Promise<number[] | null> {
    const db = await init()
    const id = `${vector_model}:${key}`
    const entry = await db.embeddings_cache.get(id)
    if (!entry) return null
    // Convert ArrayBuffer back to Float32Array
    return Array.from(new Float32Array(entry.embedding))
  }

  async function embeddingsCacheGetBulk(keys: string[], vector_model: string = 'text-embedding-3-small'): Promise<(number[] | null)[]> {
    const db = await init()
    const results: (number[] | null)[] = []
    
    for (const key of keys) {
      const id = `${vector_model}:${key}`
      const entry = await db.embeddings_cache.get(id)
      if (entry) {
        results.push(Array.from(new Float32Array(entry.embedding)))
      } else {
        results.push(null)
      }
    }
    
    return results
  }

  async function embeddingsCacheBulkPut(items: Array<{ key: string; embedding: number[] }>, vector_model: string = 'text-embedding-3-small') {
    const db = await init()
    const entries: EmbeddingsCacheEntry[] = items.map(item => ({
      id: `${vector_model}:${item.key}`,
      key: item.key,
      embedding: new Float32Array(item.embedding).buffer,
      vector_model,
      created_at: new Date().toISOString(),
    }))
    
    await db.embeddings_cache.bulkPut(entries)
  }

  async function embeddingsCacheClear() {
    const db = await init()
    await db.embeddings_cache.clear()
  }

  async function embeddingsCacheClearByModel(vector_model: string) {
    const db = await init()
    await db.embeddings_cache.where('vector_model').equals(vector_model).delete()
  }

  async function embeddingsCacheGetSize(): Promise<number> {
    const db = await init()
    return await db.embeddings_cache.count()
  }

  // Classification Models API
  async function saveClassificationModel(
    projectId: number | string,
    model: {
      W: number[][];
      b: number[];
      labels: string[];
      D: number;
      model_version: string;
    }
  ) {
    const db = await init()
    const id = `model_${projectId}`
    
    // Convert arrays to ArrayBuffer for efficient storage
    const WBuffer = new Float32Array(model.W.flat()).buffer
    const bBuffer = new Float32Array(model.b).buffer
    
    const entry: ClassificationModel = {
      id,
      projectId,
      W: WBuffer,
      b: bBuffer,
      labels: model.labels,
      D: model.D,
      model_version: model.model_version,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    await db.classification_models.put(entry)
  }

  async function getClassificationModel(projectId: number | string): Promise<{
    W: number[][];
    b: number[];
    labels: string[];
    D: number;
    model_version: string;
  } | null> {
    const db = await init()
    const id = `model_${projectId}`
    const entry = await db.classification_models.get(id)
    
    if (!entry) return null
    
    // Convert ArrayBuffer back to arrays
    const WFlat = Array.from(new Float32Array(entry.W))
    const W: number[][] = []
    const cols = entry.D
    for (let i = 0; i < WFlat.length; i += cols) {
      W.push(WFlat.slice(i, i + cols))
    }
    
    const b = Array.from(new Float32Array(entry.b))
    
    return {
      W,
      b,
      labels: entry.labels,
      D: entry.D,
      model_version: entry.model_version,
    }
  }

  async function deleteClassificationModel(projectId: number | string) {
    const db = await init()
    const id = `model_${projectId}`
    await db.classification_models.delete(id)
  }

  const api = {
    init,
    getProjects,
    addOrUpdateProject,
    saveProjects,
    deleteProject,
    getGreetings,
    addGreeting,
    // keywords API
    getKeywords,
    getKeywordsPage,
    addKeyword,
    updateKeyword,
    bulkPutKeywords,
    clearKeywords,
    getKeywordsByProject,
    getKeywordsCountByProject,
    deleteKeywordsByProject,
    persistToIndexedDB,
    restoreFromIndexedDB,
    downloadPersistedDB,
    // stopwords API
    getStopwordsByProject,
    addStopword,
    deleteStopword,
    clearStopwordsByProject,
    // typing samples API
    getTypingSamplesByProject,
    addTypingSample,
    deleteTypingSample,
    deleteTypingSamplesByLabel,
    clearTypingSamplesByProject,
    // embeddings cache API
    embeddingsCachePut,
    embeddingsCacheGet,
    embeddingsCacheGetBulk,
    embeddingsCacheBulkPut,
    embeddingsCacheClear,
    embeddingsCacheClearByModel,
    embeddingsCacheGetSize,
    // classification models API
    saveClassificationModel,
    getClassificationModel,
    deleteClassificationModel,
    dbRef,
  }
  try { ;(window as any).__dexie = api } catch (e) {}
  return api
}
