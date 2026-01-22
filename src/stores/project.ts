import { defineStore } from 'pinia'
import { useDexie } from '../composables/useDexie'

type ProjectItem = { value: string; label: string; url?: string }

function parseQueryResult(res: any) {
  if (!res) return []
  try {
    let cur: any = res
    // attempt to unwrap wrappers up to a few levels
    for (let i = 0; i < 5; i++) {
      // if table-like with batches, collect arrays from batches
      if (cur && cur.batches && Array.isArray(cur.batches) && cur.batches.length > 0) {
        const out: any[] = []
        for (const b of cur.batches) {
          if (!b) continue
          if (typeof b.toArray === 'function') {
            try {
              const a = b.toArray()
              if (Array.isArray(a) && a.length > 0) out.push(...a)
            } catch (e) {}
          } else if (b.data && Array.isArray(b.data)) {
            out.push(...b.data)
          }
        }
        if (out.length > 0) return out
      }

      // if object has toArray()
      if (cur && typeof cur.toArray === 'function') {
        try {
          const arr = cur.toArray()
          if (Array.isArray(arr) && arr.length > 0) {
            cur = arr
            continue
          }
        } catch (e) {
          // ignore and continue
        }
      }

      // if array wrapper of a single element, unwrap it
      if (Array.isArray(cur) && cur.length === 1) {
        const first = cur[0]
        if (first && typeof first.toArray === 'function') {
          try {
            const a = first.toArray()
            if (Array.isArray(a)) {
              cur = a
              continue
            }
          } catch (e) {}
        }
        if (first && first.data && Array.isArray(first.data)) {
          cur = first.data
          continue
        }
      }

      // if array of items where each item is a wrapper, try to unwrap elements
      if (Array.isArray(cur)) {
        const out: any[] = []
        let changed = false
        for (const item of cur) {
          if (item && typeof item.toArray === 'function') {
            try {
              const a = item.toArray()
              if (Array.isArray(a) && a.length > 0) {
                out.push(...a)
                changed = true
                continue
              }
            } catch (e) {}
          }
          if (item && item.data && Array.isArray(item.data)) {
            out.push(...item.data)
            changed = true
            continue
          }
          out.push(item)
        }
        if (changed) {
          cur = out
          continue
        }
      }

      // if object is column-oriented (each key maps to array of column values), convert to row-wise
      if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
        const keys = Object.keys(cur)
        if (keys.length > 0) {
          const lens = keys.map(k => Array.isArray(cur[k]) ? cur[k].length : -1)
          const allArrays = lens.every(l => l >= 0)
          const sameLen = allArrays && lens.every(l => l === lens[0])
          if (sameLen) {
            const rows: any[] = []
            for (let ri = 0; ri < lens[0]; ri++) {
              const row: any = {}
              for (const k of keys) row[k] = cur[k][ri]
              rows.push(row)
            }
            cur = rows
            continue
          }
        }
      }

      break
    }

    if (Array.isArray(cur)) return cur
    if (cur && cur.data && Array.isArray(cur.data)) return cur.data
  } catch (e) {
    console.warn('parseQueryResult unexpected shape', e)
  }
  return []
}

export const useProjectStore = defineStore('project', {
  state: () => ({
    projectsList: [] as ProjectItem[],
    // compatibility: alias used by newer components
    projectsLoaded: false as boolean,
    currentProjectId: null as string | null,
    activePage: (localStorage.getItem('activeMenuItem') || '2') as string,
    openaiApiKey: (localStorage.getItem('openaiApiKey') || '') as string,
  }),
  actions: {
    async getProjects() {
      // Load projects from DuckDB (WASM). Fallback to empty list on error.
      try {
        const db = useDexie()
        await db.init()
        const res = await db.getProjects()
        console.log('[project.ts] getProjects SELECT result:', res)
        let rows = Array.isArray(res) ? res : parseQueryResult(res)
          // handle edge-case: single _Data-like wrapper remained — try to extract its array
          try {
            if (Array.isArray(rows) && rows.length === 1) {
              const first = rows[0]
              if (first && typeof first.toArray === 'function') {
                try {
                  const a = first.toArray()
                  if (Array.isArray(a) && a.length > 0) rows = a
                } catch (e) {
                  console.warn('getProjects: failed toArray() on wrapper', e)
                }
              } else if (first && first.data && Array.isArray(first.data)) {
                rows = first.data
              }
            }
          } catch (e) {
            console.warn('getProjects: post-parse normalization failed', e)
          }
          console.log('[project.ts] getProjects parsed rows:', rows)
          this.projectsList = rows.map((r: any, idx: number) => {
            if (Array.isArray(r)) return { value: String(r[0]), label: String(r[1]), url: r[2] || '' }
            return { value: String(r.id ?? r.ID ?? r.Id ?? r[0] ?? idx), label: String(r.name ?? r.NAME ?? r.Name ?? r[1] ?? ''), url: r.url ?? r.URL ?? '' }
          }).filter(p => p.value !== '0')
          console.log('[project.ts] getProjects final mapped projectsList:', this.projectsList)
        // Dexie handles connections itself
      } catch (e) {
        this.projectsList = []
      }
      if (this.currentProjectId == null && this.projectsList.length > 0) {
        this.currentProjectId = this.projectsList[0].value
      }
      this.projectsLoaded = true
    },

    async saveProjects() {
      try {
        const db = useDexie()
        await db.init()
        const normalized = this.projectsList.map(p => ({ id: p.value, name: p.label, url: p.url || '' }))
        await db.saveProjects(normalized)
        try { await db.persistToIndexedDB() } catch (e) { console.warn(e) }
      } catch (e) {
        console.warn('saveProjects failed', e)
      }
    },

    // Save a new project object (compatibility with enhanced dialog)
    async saveNewProject(payload: { name: string; url?: string }) {
      const id = String(Date.now())
      const item = { value: id, label: payload.name, url: payload.url || '' }
      try {
        const db = useDexie()
        await db.init()
        await db.addOrUpdateProject({ id, name: payload.name || '', url: payload.url || '' })
        try { await db.persistToIndexedDB() } catch (e) { console.warn('persist failed', e) }
      } catch (e) {
        console.warn('saveNewProject DB write failed', e)
      }

      // update in-memory list for UI
      this.projectsList.unshift(item)
      this.currentProjectId = id
      this.projectsLoaded = true
      console.info(`проект ${payload.name} сохранен`, this.projectsList)
      return id
    },

    async addProject(label: string) {
      const id = String(Date.now())
      const item = { value: id, label, url: '' }
      try {
        const db = useDexie()
        await db.init()
        await db.addOrUpdateProject({ id, name: label, url: '' })
        try { await db.persistToIndexedDB() } catch (e) { console.warn('persist failed', e) }
      } catch (e) {
        console.warn('addProject DB write failed', e)
      }

      this.projectsList.unshift(item)
      this.currentProjectId = id
      console.info(`проект ${label} сохранен`, this.projectsList)
      return id
    },

    changeProject(id: string | null) {
      this.currentProjectId = id
    },

    async getOpenaiApiKey() {
      if (this.openaiApiKey) return this.openaiApiKey;
      const key = localStorage.getItem('openaiKey_global');
      if (key) {
        this.openaiApiKey = key;
        return key;
      }
      return '';
    }
  },
})
