export default function saveColumnOrder(project: any, key: string, val: any[]) {
  try {
    project.data = project.data || {}
    project.data.columns = project.data.columns || {}
    project.data.columns[key] = val
    if (typeof project.saveProjectData === 'function') {
      const projectId = project.currentProjectId || (project.data && project.data.id)
      project.saveProjectData(projectId)
      return
    }
    if (typeof project.saveProjects === 'function') {
      project.saveProjects()
    }
  } catch (e) {
    console.warn('saveColumnOrder failed', e)
  }
}
