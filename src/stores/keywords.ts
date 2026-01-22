import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { useKeywordWorker } from '../composables/useKeywordWorker'
import { useMorphologyWorker } from '../composables/useMorphologyWorker'
import { useConsistencyWorker } from '../composables/useConsistencyWorker'
import { isLemmaDictReady } from '../composables/lemmaDictStatus'
import { useProjectStore } from './project'
import { useDexie } from '../composables/useDexie'

type KeywordRow = {
  id: string
  keyword: string
  created_at?: string
  projectId?: string
  lemma?: string
  tags?: string
  morphology_processed?: number
  target_query?: number | boolean
  blocking_rule?: string
  classification_label?: string
  classification_score?: number
}

type SortDirection = 'ascending' | 'descending'

function resolveSortInfo(sort: any): { field: string | null; direction: SortDirection | null } {
  if (!sort || typeof sort !== 'object') return { field: null, direction: null }

  // ElementPlus-ish shape: { prop, order }
  if ('prop' in sort && 'order' in sort) {
    const field = sort.prop || null
    const order = sort.order
    const direction: SortDirection | null =
      order === 'descending' || order === 'desc'
        ? 'descending'
        : order === 'ascending' || order === 'asc'
        ? 'ascending'
        : null
    return { field, direction }
  }

  // Explicit shape: { field, direction }
  if ('field' in sort && 'direction' in sort) {
    const field = sort.field || null
    const dir = sort.direction
    const direction: SortDirection | null =
      dir === 'descending' || dir === 'ascending'
        ? dir
        : dir === -1
        ? 'descending'
        : dir === 1
        ? 'ascending'
        : null
    return { field, direction }
  }

  // Numeric map shape from DataTableFixed: { col: 1 } / { col: -1 }
  const keys = Object.keys(sort)
  if (keys.length === 0) return { field: null, direction: null }
  const field = keys[0]
  const value = sort[field]
  const direction: SortDirection | null =
    value === -1 || value === 'desc' || value === 'descending'
      ? 'descending'
      : value === 1 || value === 'asc' || value === 'ascending'
      ? 'ascending'
      : null
  return { field, direction }
}

function compareForSort(a: any, b: any, collator: Intl.Collator) {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1

  // Normalize booleans
  if (typeof a === 'boolean') a = a ? 1 : 0
  if (typeof b === 'boolean') b = b ? 1 : 0

  // Numbers first
  if (typeof a === 'number' && typeof b === 'number') {
    if (a < b) return -1
    if (a > b) return 1
    return 0
  }

  // Fallback to locale-aware string compare (case-insensitive)
  return collator.compare(String(a), String(b))
}


export const useKeywordsStore = defineStore('keywords', {
  state: () => ({
    // running flags
    running: false as boolean,
    stopwordsRunning: false as boolean,
    categorizationRunning: false as boolean,
    typingRunning: false as boolean,
    clusteringRunning: false as boolean,
    morphologyRunning: false as boolean,
    morphologyCheckRunning: false as boolean,

    // progress
    percentage: 0,
    stopwordsPercent: 0,
    categorizationPercent: 0,
    typingPercent: 0,
    clusteringPercent: 0,
    morphologyPercent: 0,
    morphologyCheckPercent: 0,

    // add flow
    isAddingWithProgress: false as boolean,
    addProgress: 0,
    addProgressText: '',

    // counts
    keywordCount: 0,
    totalCount: 0,

    // data
    keywords: [] as KeywordRow[],
    loading: false,
    loadingMore: false,
    // DataTableFixed expects a numeric map shape: { field: 1 | -1 }
    sort: { created_at: -1 } as any,
    windowStart: 0,
    searchQuery: '',

    // optional labels
    currentProcessLabel: '' as string | null,
    currentTotal: 0,
    currentProcessed: 0,
    
    // Detailed progress object for complex operations (e.g., clustering)
    progress: null as {
      stage: string;
      fetched?: number;
      total?: number;
      percent?: number;
      processed?: number;
      source?: string;
    } | null,
  }),
  actions: {
    async addKeywords(raw: string) {
      const parts = raw
        .split(/[,\n]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      if (!parts.length) {
        ElMessage.warning('Введите ключевые запросы')
        return
      }
      this.isAddingWithProgress = true
      const project = useProjectStore()
      const pid = project.currentProjectId ? String(project.currentProjectId) : 'anon'
      const UI_PRELOAD = 500
      const CHUNK = 2000

      // Build a small preview for UI only (avoid creating full array of 100k items in main)
      const previewParts = parts.slice(0, UI_PRELOAD)
      const previewItems = previewParts.map((kw) => ({
        id: `${pid}::${encodeURIComponent(kw)}`,
        projectId: String(pid),
        keyword: kw,
        created_at: new Date().toISOString(),
      })) as KeywordRow[]
      if (previewItems.length) {
        this.keywords = previewItems.concat(this.keywords)
      }

      try {
        const worker = useKeywordWorker()

        let writtenSoFar = 0
        const onProgress = (msg: any) => {
          try {
            if (msg && typeof msg.written !== 'undefined' && typeof msg.total !== 'undefined') {
              writtenSoFar = msg.written
              const pct = Math.round((writtenSoFar / Math.max(1, msg.total)) * 100)
              this.addProgress = pct
              this.addProgressText = `${Math.min(writtenSoFar, msg.total)} из ${msg.total}`
              this.isAddingWithProgress = true
            }
          } catch (e) {}
        }

        const payload = { raw, projectId: pid, chunkSize: CHUNK }
        const written = await worker.saveKeywords(payload, onProgress)

        if (written > 0) {
          ElMessage.success(`Добавлено ${written} ключевых слов`)
        } else {
          ElMessage.info('Новые ключевые слова не были добавлены')
        }

        // After background import, reload current window from DB to show full data
        try {
          const project = useProjectStore()
          if (project.currentProjectId) {
            await this.loadKeywords(String(project.currentProjectId), { offset: 0, limit: 300 })
          }
        } catch (_) {}

        // update counts: ask dexie for total
        try {
          const dexie = useDexie()
          const cnt = await dexie.getKeywordsCountByProject(pid)
          this.totalCount = cnt
          this.keywordCount = cnt
        } catch (e) {}
      } catch (e: any) {
        console.error('keyword worker save failed', e)
        ElMessage.error(`Ошибка при сохранении ключевых слов: ${e && e.message ? e.message : String(e)}`)
      } finally {
        this.isAddingWithProgress = false
        this.addProgress = 0
        this.addProgressText = ''
      }
      return true
    },

    async loadKeywords(projectId: string | null, options?: any) {
      const isBackground = options?.background === true;
      if (!isBackground) this.loading = true
      try {
        if (!projectId) {
          this.keywords = []
          this.keywordCount = 0
          this.totalCount = 0
          return
        }
        const dexie = useDexie()
        const db = await dexie.init()
        const offset = options?.offset || 0
        const limit = options?.limit || 300
        const reverse = options?.reverse || false
        // Keep windowStart in sync with the loaded slice so DataTableFixed shows fresh data
        if (typeof offset === 'number') {
          this.windowStart = offset
        }

        const sortInfo = resolveSortInfo(this.sort)
        const sortField = sortInfo.field
        const sortDir: SortDirection = sortInfo.direction || 'ascending'
        const dirMul = sortDir === 'descending' ? -1 : 1

        const hasSearch = !!(this.searchQuery && this.searchQuery.trim())
        const needsFullSort =
          hasSearch ||
          (!!sortField && sortField !== 'created_at' && sortField !== 'keyword')

        // If there's a search query, do a client-side filter after fetching page
        let rows: any[] = []
        if (needsFullSort) {
          // Correct global sort for arbitrary columns: load all rows for project, then sort + slice
          rows = await (db as any).keywords.where('projectId').equals(String(projectId)).toArray()

          let filtered = rows
          if (hasSearch) {
            const q = this.searchQuery.toLowerCase()
            filtered = rows.filter((r: any) => (r.keyword || '').toLowerCase().includes(q))
          }

          if (sortField) {
            const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true })
            filtered = [...filtered].sort((a: any, b: any) => {
              const res = compareForSort(a?.[sortField], b?.[sortField], collator)
              return res * dirMul
            })
          } else if (reverse) {
            filtered = [...filtered].reverse()
          }

          const windowed = filtered.slice(offset, offset + limit)
          // Preserve *all* fields from DB rows so table columns and sort work for every column
          this.keywords = windowed.map((r: any) => ({ ...(r || {}), id: String(r.id) })) as any
        } else {
          // Fast path for indexed sorts on created_at/keyword
          if (sortField === 'created_at') {
            let collection = (db as any).keywords
              .where('[projectId+created_at]')
              .between([String(projectId), ''], [String(projectId), '\uffff'])
            if (sortDir === 'descending' && typeof collection.reverse === 'function') collection = collection.reverse()
            if (offset && typeof collection.offset === 'function') collection = collection.offset(offset)
            if (limit && typeof collection.limit === 'function') collection = collection.limit(limit)
            rows = await collection.toArray()
          } else if (sortField === 'keyword') {
            let collection = (db as any).keywords
              .where('[projectId+keyword]')
              .between([String(projectId), ''], [String(projectId), '\uffff'])
            if (sortDir === 'descending' && typeof collection.reverse === 'function') collection = collection.reverse()
            if (offset && typeof collection.offset === 'function') collection = collection.offset(offset)
            if (limit && typeof collection.limit === 'function') collection = collection.limit(limit)
            rows = await collection.toArray()
          } else if (options && options.after) {
            // cursor-based page (kept for compatibility)
            const page = await dexie.getKeywordsPage(String(projectId), { limit, after: options.after, reverse })
            rows = page.items || []
          } else {
            rows = await dexie.getKeywordsByProject(String(projectId), { offset, limit, reverse })
          }

          this.keywords = (rows || []).map((r: any) => ({ ...(r || {}), id: String(r.id) })) as any
        }

        // total count for project — use dexie helper for robust counting
        try {
          const cnt = await dexie.getKeywordsCountByProject(String(projectId))
          this.totalCount = cnt
          this.keywordCount = cnt
        } catch (e) {
          // fallback to length of fetched slice
          this.totalCount = this.keywords.length
          this.keywordCount = this.keywords.length
        }


      } catch (e) {
        console.warn('loadKeywords failed', e)
      } finally {
        if (!isBackground) this.loading = false
      }
    },

    async deleteKeyword(id: string) {
      try {
        const dexie = useDexie()
        const db = await dexie.init()
        await (db as any).keywords.delete(id)
      } catch (e) {
        console.warn('deleteKeyword failed:', e)
      }
      this.keywords = this.keywords.filter((k) => k.id !== id)
      this.keywordCount = Math.max(0, this.keywordCount - 1)
      this.totalCount = Math.max(0, this.totalCount - 1)
    },

    async deleteAllKeywords(projectId: string) {
      try {
        const dexie = useDexie()
        await dexie.deleteKeywordsByProject(projectId)
        this.keywords = []
        this.keywordCount = 0
        this.totalCount = 0
        this.windowStart = 0
      } catch (e) {
        console.warn('deleteAllKeywords failed:', e)
        throw e
      }
    },

    // process control stubs
    stopCurrentProcess() {
      this.running = false
      this.stopwordsRunning = false
    },

    startAllProcesses() {
      this.running = true
    },
    startCategorizationOnly() {
      this.categorizationRunning = true
      this.running = true
    },
    startTypingOnly() {
      this.typingRunning = true
      this.running = true
    },
    startStopwordsOnly() {
      this.stopwordsRunning = true
      this.running = true
    },
    startClusteringOnly() {
      this.clusteringRunning = true
      this.running = true
    },
    async startMorphology(projectId?: string) {
      const pid = projectId || (useProjectStore().currentProjectId || 'anon')
      console.log('[startMorphology] starting morphology process', { projectId: pid })
      const morphologyStartingLabel = isLemmaDictReady() ? 'Лемматизация' : 'Загружаю словарь…'
      this.currentProcessLabel = morphologyStartingLabel
      this.morphologyRunning = true
      this.running = true
      try {
        const worker = useMorphologyWorker()
        const payload = { projectId: String(pid), batchSize: 500 }
        console.log('[startMorphology] payload:', payload)
        const enforceMorphologyLabel = () => {
          this.currentProcessLabel = 'Лемматизация'
        }
        await worker.startMorphology(payload, (msg: any) => {
          enforceMorphologyLabel()
          console.log('[startMorphology] progress msg:', msg)
          try {
            if (typeof msg.processed !== 'undefined' && typeof msg.total !== 'undefined') {
              this.currentProcessed = msg.processed
              this.currentTotal = msg.total
              this.morphologyPercent = Math.round((msg.processed / Math.max(1, msg.total)) * 100)
              console.log('[startMorphology] updated percent:', this.morphologyPercent, 'processed:', msg.processed, 'total:', msg.total)
            }
          } catch (e) {
            console.error('[startMorphology] error in progress callback:', e)
          }
        })
        // After completion, ensure percent is 100% if total > 0
        if (this.currentTotal > 0) {
          this.morphologyPercent = 100
          console.log('[startMorphology] set percent to 100% after completion')
        }
        // Обновляем текущее окно таблицы после завершения морфологии
        try {
          const refreshOffset = typeof this.windowStart === 'number' ? this.windowStart : 0
          await this.loadKeywords(String(pid), { offset: refreshOffset, limit: 300 })
        } catch (e) {
          console.warn('[startMorphology] failed to reload keywords after morphology', e)
        }
        console.log('[startMorphology] morphology completed successfully')
      } catch (e) {
        console.warn('[startMorphology] failed', e)
      } finally {
        this.morphologyRunning = false
        this.running = false
        // Don't reset percent if we have processed items
        if (this.currentTotal === 0) {
          this.morphologyPercent = 0
        }
        this.currentProcessed = 0
        this.currentTotal = 0
        this.currentProcessLabel = ''
        console.log('[startMorphology] reset flags')
      }
      return true
    },
    async startMorphologyCheck(projectId?: string) {
      const pid = projectId || (useProjectStore().currentProjectId || 'anon')
      const morphologyCheckStartingLabel = isLemmaDictReady()
        ? 'Проверка согласованности'
        : 'Загружаю словарь…'
      this.currentProcessLabel = morphologyCheckStartingLabel
      this.morphologyCheckRunning = true
      this.running = true
      this.morphologyCheckPercent = 0
      this.currentProcessed = 0
      this.currentTotal = 0
      try {
        const worker = useConsistencyWorker()
        const payload = { projectId: String(pid), batchSize: 500 }
        const enforceCheckLabel = () => {
          this.currentProcessLabel = 'Проверка согласованности'
        }
        const onProgress = (msg: any) => {
          enforceCheckLabel()
          if (typeof msg.processed === 'number') {
            this.currentProcessed = msg.processed
          }
          if (typeof msg.total === 'number') {
            this.currentTotal = msg.total
          }
          if (typeof msg.percent === 'number') {
            this.morphologyCheckPercent = Math.min(100, Math.max(0, Math.round(msg.percent)))
          } else if (
            typeof msg.processed === 'number' &&
            typeof msg.total === 'number' &&
            msg.total > 0
          ) {
            this.morphologyCheckPercent = Math.min(
              100,
              Math.max(0, Math.round((msg.processed / msg.total) * 100))
            )
          }
        }
        await worker.startConsistency(payload, onProgress)
        if (this.currentTotal > 0) {
          this.morphologyCheckPercent = 100
        }
        try {
          const refreshOffset = typeof this.windowStart === 'number' ? this.windowStart : 0
          await this.loadKeywords(String(pid), { offset: refreshOffset, limit: 300 })
        } catch (e) {
          console.warn('[startMorphologyCheck] failed to reload keywords', e)
        }
      } catch (e) {
        console.warn('[startMorphologyCheck] failed', e)
        ElMessage.error('Ошибка при запуске проверки согласованности')
      } finally {
        const hadTotal = this.currentTotal > 0
        this.morphologyCheckRunning = false
        this.running = false
        if (!hadTotal) {
          this.morphologyCheckPercent = 0
        }
        this.currentProcessed = 0
        this.currentTotal = 0
        this.currentProcessLabel = ''
      }
      return true
    },

    // helpers used by table
    searchKeywords(query: string) {
      this.searchQuery = query
      // trigger reload for current project
      const project = useProjectStore()
      this.loadKeywords(project.currentProjectId, { resetSearch: true })
    },
    sortKeywords(options: any) {
      this.sort = options
      this.windowStart = 0
      const project = useProjectStore()
      const projectId = project.currentProjectId
      if (projectId) {
        // Reload first window so UI immediately reflects the new ordering
        this.loadKeywords(String(projectId), { offset: 0, limit: 300 })
      }
    },
    async loadWindow(newStart: number) {
      this.windowStart = newStart
      const project = useProjectStore()
      const projectId = project.currentProjectId
      const WINDOW_SIZE = 300;
      if (projectId) {
        await this.loadKeywords(String(projectId), { offset: newStart, limit: WINDOW_SIZE, background: true })
      }
    },
    
    async getKeywordsByProject(projectId: string): Promise<KeywordRow[]> {
      try {
        const dexie = useDexie()
        const keywords = await dexie.getKeywordsByProject(String(projectId), { offset: 0, limit: 999999 })
        return (keywords || []).map((r: any) => ({ ...(r || {}), id: String(r.id) })) as KeywordRow[]
      } catch (e) {
        console.warn('getKeywordsByProject failed:', e)
        return []
      }
    },

    async bulkUpdateKeywords(keywords: KeywordRow[]) {
      try {
        const dexie = useDexie()
        // Update each keyword with classification results
        for (const kw of keywords) {
          if (kw.id) {
            await dexie.updateKeyword(kw)
          }
        }
        
        // Reload keywords to reflect changes in UI
        const project = useProjectStore()
        if (project.currentProjectId) {
          await this.loadKeywords(String(project.currentProjectId), { offset: 0, limit: 300 })
        }
      } catch (e) {
        console.warn('bulkUpdateKeywords failed:', e)
      }
    },
  },
})
