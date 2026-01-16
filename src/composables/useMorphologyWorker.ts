import { ref } from 'vue'

type WorkerMsg = { type: string; payload?: any; requestId?: string }

import MorphologyWorker from '../workers/morphology.worker.ts?worker'
import { markLemmaDictReady } from './lemmaDictStatus'

let workerRef: Worker | null = null

function initWorker() {
  if (workerRef) return workerRef
  console.log('morph-worker: initializing worker')
  workerRef = new MorphologyWorker()
  console.log('morph-worker: worker created', workerRef)
  workerRef.addEventListener('message', handleLemmaDictMessage)
  return workerRef
}

function handleLemmaDictMessage(ev: MessageEvent) {
  try {
    const msg = ev.data || {}
    if (msg && msg.type === 'lemma-dict:loaded') {
      markLemmaDictReady()
    }
  } catch (e) {}
}

export function useMorphologyWorker() {
  const ready = ref(false)

  function ensure() {
    const w = initWorker()
    if (w) ready.value = true
    return w
  }

  function postMessageWithResponse(type: string, payload?: any, onProgress?: (progress: any) => void) {
    return new Promise<any>((resolve, reject) => {
      const w = ensure()
      if (!w) return reject(new Error('worker init failed'))
      const requestId = String(Date.now()) + '-' + Math.random().toString(36).slice(2)
      console.log('morph-worker: sending', { type, requestId, payload })
      function handler(ev: MessageEvent) {
        const msg = ev.data || {}
        console.log('morph-worker: msg', msg && msg.type, msg)
        if (msg.requestId && msg.requestId !== requestId) return
        if (msg.type === 'error') {
          w.removeEventListener('message', handler)
          w.removeEventListener('error', onErr)
          reject(new Error(msg.error || 'worker error'))
          return
        }
        if (msg.type === `${type}:progress`) {
          try { if (typeof onProgress === 'function') onProgress(msg) } catch (e) {}
          return
        }
        if (msg.type === `${type}:done`) {
          w.removeEventListener('message', handler)
          w.removeEventListener('error', onErr)
          try { if (typeof onProgress === 'function') onProgress(msg) } catch (e) {}
          resolve(msg)
        }
      }
      function onErr(err: any) {
        w.removeEventListener('message', handler)
        w.removeEventListener('error', onErr)
        reject(new Error('worker error: ' + (err && err.message ? err.message : String(err))))
      }
      w.addEventListener('message', handler)
      w.addEventListener('error', onErr)
      const payloadMsg: WorkerMsg = { type, payload, requestId }
      // give a tiny tick for devtools to attach if needed
      try { w.postMessage(payloadMsg) } catch (e) { console.error('morph-worker postMessage failed', e); throw e }
    })
  }

  async function startMorphology(payload: any, onProgress?: (p: any) => void) {
    const msg = await postMessageWithResponse('morphology', payload, onProgress)
    return msg
  }

  return { ready, ensure, startMorphology }
}

export default useMorphologyWorker
