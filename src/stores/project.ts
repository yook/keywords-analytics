import { defineStore } from 'pinia'
import { useDexie } from '../composables/useDexie'

type ProjectItem = { value: string; label: string; url?: string; data?: any }

// Helper to ensure data is JSON-serializable for IndexedDB
function serializeProjectData(data: any): any {
  if (!data) return {}
  try {
    // Try to serialize and deserialize to ensure it's cloneable
    return JSON.parse(JSON.stringify(data))
  } catch (e) {
    console.warn('Failed to serialize project data:', e)
    return {}
  }
}

export const useProjectStore = defineStore('project', {
  state: () => ({
    projectsList: [] as ProjectItem[],
    // compatibility: alias used by newer components
    projectsLoaded: false as boolean,
    currentProjectId: localStorage.getItem('currentProjectId') as string | null,
    activePage: (localStorage.getItem('activeMenuItem') || '2') as string,
    openaiApiKey: (localStorage.getItem('openaiApiKey') || '') as string,
    data: {} as any,
  }),
  actions: {
    async getProjects() {
      try {
        const db = useDexie()
        await db.init()
        const res = await db.getProjects()
        console.log('[ProjectStore] getProjects response:', res)
        
        const rows = Array.isArray(res) ? res : []
        
        this.projectsList = rows.map((r: any) => {
          return { 
            value: String(r.id), 
            label: String(r.name || ''), 
            url: String(r.url || ''),
            data: r.data || {}
          }
        }).filter(p => p.value && p.value !== 'undefined')
        
        console.log('[ProjectStore] projectsList updated:', JSON.parse(JSON.stringify(this.projectsList)))
      } catch (e) {
        console.error('[ProjectStore] getProjects failed:', e)
        this.projectsList = []
      }
      
      if (this.projectsList.length > 0) {
        if (!this.currentProjectId) {
          this.currentProjectId = this.projectsList[0].value;
        } else {
          const exists = this.projectsList.some(p => p.value === this.currentProjectId);
          if (!exists) {
            this.currentProjectId = this.projectsList[0].value;
          }
        }
        const cur = this.projectsList.find(p => String(p.value) === String(this.currentProjectId))
        if (cur) {
          this.data = cur.data || {}
        }
      } else {
        this.data = {}
      }
      this.projectsLoaded = true
      localStorage.setItem('currentProjectId', this.currentProjectId || '')
    },

    async saveProjects() {
      try {
        const db = useDexie()
        await db.init()
        
        if (this.currentProjectId) {
          const idx = this.projectsList.findIndex(p => String(p.value) === String(this.currentProjectId))
          if (idx !== -1) {
            this.projectsList[idx].data = serializeProjectData(this.data)
          }
        }

        const normalized = this.projectsList.map(p => ({ 
          id: String(p.value), 
          name: String(p.label), 
          url: String(p.url || ''),
          data: serializeProjectData(p.data)
        }))
        
        console.log('[ProjectStore] saving projects to DB:', normalized)
        await db.saveProjects(normalized)
        try { await db.persistToIndexedDB() } catch (e) { console.warn('persist failed', e) }
      } catch (e) {
        console.error('[ProjectStore] saveProjects failed:', e)
      }
    },

    // Save a new project object (compatibility with enhanced dialog)
    async saveNewProject(payload: { name: string; url?: string }) {
      const id = String(Date.now())
      const item = { value: id, label: payload.name, url: payload.url || '', data: {} }
      try {
        const db = useDexie()
        await db.init()
        await db.addOrUpdateProject({ id, name: payload.name || '', url: payload.url || '', data: {} })
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
      const item = { value: id, label, url: '', data: {} }
      try {
        const db = useDexie()
        await db.init()
        await db.addOrUpdateProject({ id, name: label, url: '', data: {} })
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
      // Sync current data back to the list before switching
      if (this.currentProjectId) {
        const oldIdx = this.projectsList.findIndex(p => String(p.value) === String(this.currentProjectId))
        if (oldIdx !== -1) {
          this.projectsList[oldIdx].data = { ...this.data }
        }
      }

      this.currentProjectId = id
      
      // Load new data
      const newIdx = this.projectsList.findIndex(p => String(p.value) === String(id))
      if (newIdx !== -1) {
        this.data = this.projectsList[newIdx].data || {}
      } else {
        this.data = {}
      }
    },

    async getOpenaiApiKey() {
      if (this.openaiApiKey) return this.openaiApiKey;
      const stored = localStorage.getItem('openaiKey_global');
      if (!stored) return '';

      // If already plaintext, use as-is
      if (stored.startsWith('sk-')) {
        this.openaiApiKey = stored;
        return stored;
      }

      // Otherwise try to decrypt (encrypted at rest)
      try {
        const { decryptValue } = await import('../utils/encryption');
        const decrypted = await decryptValue(stored);
        if (decrypted) {
          this.openaiApiKey = decrypted;
          return decrypted;
        }
      } catch (e) {
        console.warn('Failed to decrypt OpenAI key', e);
        try {
          localStorage.removeItem('openaiKey_global');
        } catch (er) {}
        this.openaiApiKey = '';
        return '';
      }

      return '';
    },

    async deleteProject(id: string) {
      try {
        const db = useDexie()
        await db.init()
        await db.deleteProject(id)
        
        // Update in-memory list
        this.projectsList = this.projectsList.filter(p => String(p.value) !== String(id))
        
        // If we deleted the current project, switch to another or null
        if (String(this.currentProjectId) === String(id)) {
          if (this.projectsList.length > 0) {
            this.currentProjectId = this.projectsList[0].value
          } else {
            this.currentProjectId = null
          }
          if (this.currentProjectId) {
            localStorage.setItem('currentProjectId', this.currentProjectId)
          } else {
            localStorage.removeItem('currentProjectId')
          }
        }
      } catch (e) {
        console.warn('deleteProject failed', e)
        throw e
      }
    },

    async updateProject(payload: { id: string | null, name: string }) {
      if (!payload.id) return;
      try {
        const db = useDexie()
        await db.init()
        
        // Fetch existing projects to get the one we want to update
        const projects = await db.getProjects()
        const existing = projects.find(p => String(p.id) === String(payload.id))
        
        const updated = {
          id: String(payload.id),
          name: payload.name,
          url: existing ? (existing.url || '') : '',
          data: existing ? serializeProjectData(existing.data) : {}
        }
        
        await db.addOrUpdateProject(updated)
        try { await db.persistToIndexedDB() } catch (e) { console.warn('persist failed', e) }
        
        // Update in-memory
        const idx = this.projectsList.findIndex(p => String(p.value) === String(payload.id))
        if (idx !== -1) {
          this.projectsList[idx].label = payload.name
        }
      } catch (e) {
        console.warn('updateProject failed', e)
        throw e
      }
    },

    // Save project data/settings without needing to pass the name
    async saveProjectData(projectId?: string) {
      const id = projectId || this.currentProjectId
      if (!id) return;
      try {
        const db = useDexie()
        await db.init()
        
        // Fetch existing project to get the current name
        const projects = await db.getProjects()
        const existing = projects.find(p => String(p.id) === String(id))
        if (!existing) return;
        
        const updated = {
          id: String(id),
          name: existing.name,
          url: existing.url || '',
          data: serializeProjectData(this.data)
        }
        
        await db.addOrUpdateProject(updated)
        try { await db.persistToIndexedDB() } catch (e) { console.warn('persist failed', e) }
        
        // Update in-memory
        const idx = this.projectsList.findIndex(p => String(p.value) === String(id))
        if (idx !== -1) {
          this.projectsList[idx].data = serializeProjectData(this.data)
        }
      } catch (e) {
        console.warn('saveProjectData failed', e)
        throw e
      }
    },

    async refreshProjectsList() {
      return this.getProjects()
    }
  },
})
