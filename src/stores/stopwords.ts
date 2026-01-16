import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { useDexie } from '../composables/useDexie'
import { useProjectStore } from './project'

type StopwordRow = {
  id: string
  word: string
  projectId?: string
  created_at?: string
}

type SortDirection = 'ascending' | 'descending'

function resolveSortInfo(sort: any): { field: string | null; direction: SortDirection | null } {
  if (!sort || typeof sort !== 'object') return { field: null, direction: null }

  if ('field' in sort && 'direction' in sort) {
    const maybeDir = sort.direction
    const direction: SortDirection | null =
      maybeDir === 'descending' || maybeDir === 'ascending'
        ? maybeDir
        : maybeDir === -1
        ? 'descending'
        : maybeDir === 1
        ? 'ascending'
        : null
    return { field: sort.field || null, direction }
  }

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

export const useStopwordsStore = defineStore('stopwords', {
  state: () => ({
    // add flow
    isAddingWithProgress: false as boolean,
    addProgress: 0,
    addProgressText: '',

    // data
    stopwords: [] as StopwordRow[],
    loading: false,
    loadingMore: false,
    totalCount: 0,
    windowStart: 0,
    sort: {} as any,
    currentProjectId: null as string | null,
  }),
  actions: {
    setCurrentProjectId(id: string | null) {
      this.currentProjectId = id
    },

    initializeState() {
      this.stopwords = []
      this.totalCount = 0
      this.windowStart = 0
      this.sort = {}
    },

    async addStopwords(text: string) {
      if (!this.currentProjectId) {
        ElMessage.error('Проект не выбран')
        return
      }

      const words = text.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0)
      if (words.length === 0) return

      await this.addStopwordsArray(words, this.currentProjectId)
    },

    async addStopwordsArray(words: string[], projectId: string) {
      this.isAddingWithProgress = true
      this.addProgress = 0
      this.addProgressText = 'Подготовка...'

      try {
        const dexie = useDexie()
        await dexie.init()

        const total = words.length
        let processed = 0

        for (const word of words) {
          if (!word.trim()) continue

          const stopword: StopwordRow = {
            id: `${projectId}::${encodeURIComponent(word.trim().toLowerCase())}`,
            word: word.trim(),
            projectId,
            created_at: new Date().toISOString(),
          }

          await dexie.addStopword(stopword)

          processed++
          this.addProgress = Math.round((processed / total) * 100)
          this.addProgressText = `Добавлено ${processed} из ${total}`
        }

        ElMessage.success(`Добавлено ${processed} стоп-слов`)

        // Reload stopwords
        await this.loadStopwords(projectId)
      } catch (e: any) {
        console.error('addStopwords failed', e)
        ElMessage.error(`Ошибка при добавлении стоп-слов: ${e.message || String(e)}`)
      } finally {
        this.isAddingWithProgress = false
        this.addProgress = 0
        this.addProgressText = ''
      }
    },

    async loadStopwords(projectId: string, options?: { offset?: number; limit?: number }) {
      this.loading = true
      try {
        const dexie = useDexie()
        await dexie.init()

        const offset = options?.offset || 0
        const limit = options?.limit || 300

        const allStopwords = await dexie.getStopwordsByProject(projectId)
        this.totalCount = allStopwords.length

        // Apply sorting if needed
        let sorted = [...allStopwords]
        const sortInfo = resolveSortInfo(this.sort)
        if (sortInfo.field) {
          const normalizedField = sortInfo.field
          const direction = sortInfo.direction === 'descending' ? -1 : 1
          sorted.sort((a, b) => {
            const aVal = a[normalizedField]
            const bVal = b[normalizedField]
            if (aVal < bVal) return -direction
            if (aVal > bVal) return direction
            return 0
          })
        }

        this.stopwords = sorted.slice(offset, offset + limit)
      } catch (e: any) {
        console.error('loadStopwords failed', e)
        ElMessage.error(`Ошибка загрузки стоп-слов: ${e.message || String(e)}`)
      } finally {
        this.loading = false
      }
    },

    async deleteStopword(id: string) {
      if (!this.currentProjectId) return
      try {
        const dexie = useDexie()
        await dexie.deleteStopword(id)
        await this.loadStopwords(this.currentProjectId)
        ElMessage.success('Стоп-слово удалено')
      } catch (e: any) {
        console.error('deleteStopword failed', e)
        ElMessage.error(`Ошибка удаления: ${e.message || String(e)}`)
      }
    },

    async deleteAllStopwords() {
      if (!this.currentProjectId) return
      try {
        const dexie = useDexie()
        await dexie.clearStopwordsByProject(this.currentProjectId)
        this.stopwords = []
        this.totalCount = 0
        ElMessage.success('Все стоп-слова удалены')
      } catch (e: any) {
        console.error('deleteAllStopwords failed', e)
        ElMessage.error(`Ошибка удаления: ${e.message || String(e)}`)
      }
    },

    async sortStopwords(options: any) {
      this.sort = options
      this.windowStart = 0
      const projectId = this.currentProjectId
      if (projectId) {
        await this.loadStopwords(projectId)
      }
    },

    async loadWindow(newStart: number) {
      this.windowStart = newStart
      const project = useProjectStore()
      const projectId = project.currentProjectId
      if (projectId) {
        await this.loadStopwords(String(projectId), { offset: newStart, limit: 300 })
      }
    },
  },
})