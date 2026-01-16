import { ref } from 'vue'

type WorkerMsg = { type: string; payload?: any; requestId?: string }

let workerRef: Worker | null = null

function initWorker() {
  if (workerRef) return workerRef
  // Vite-friendly worker import
  workerRef = new Worker(new URL('../workers/keywords.worker.ts', import.meta.url), { type: 'module' })
  return workerRef
}

export function useKeywordWorker() {
  const ready = ref(false)

  function ensure() {
    const w = initWorker()
    if (w) ready.value = true
    return w
  }

    function postMessageWithResponse(type: string, payload?: any, onProgress?: (progress: any) => void) {
      return new Promise<any>((resolve, reject) => {
        const w = ensure()
        const requestId = String(Date.now()) + '-' + Math.random().toString(36).slice(2)
        function handler(ev: MessageEvent) {
          const msg = ev.data || {}
          if (msg.requestId && msg.requestId !== requestId) return
          // handle errors
          if (msg.type === 'error') {
            w.removeEventListener('message', handler)
            reject(new Error(msg.error || 'worker error'))
            return
          }
          // progress messages
          if (msg.type === `${type}:progress`) {
            try { if (typeof onProgress === 'function') onProgress(msg) } catch (e) {}
            return
          }
          // only resolve when done message is received
          if (msg.type === `${type}:done`) {
            w.removeEventListener('message', handler)
            resolve(msg)
          }
        }
        w.addEventListener('message', handler)
        const payloadMsg: WorkerMsg = { type, payload, requestId }
        w.postMessage(payloadMsg)
      })
    }

  // Accept either an array of items (existing behaviour) or a payload { raw: string, projectId, chunkSize }
  async function saveKeywords(payload: any, onProgress?: (p: any) => void) {
    const msg = await postMessageWithResponse('saveKeywords', payload, onProgress)
    return msg.count ?? 0
  }

  async function getAllKeywords() {
    const msg = await postMessageWithResponse('getAllKeywords')
    return msg.data || []
  }

  async function clearKeywords() {
    await postMessageWithResponse('clearKeywords')
    return true
  }
  return { ready, ensure, saveKeywords, getAllKeywords, clearKeywords }
}

export default useKeywordWorker
