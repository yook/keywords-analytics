import { ref } from 'vue'

type WorkerMsg = { type: string; payload?: any; requestId?: string }

import ConsistencyWorker from '../workers/consistency.worker.ts?worker'
import { markLemmaDictReady } from './lemmaDictStatus'

let workerRef: Worker | null = null

function initWorker() {
  if (workerRef) return workerRef
  console.log('consistency worker: initializing worker')
  workerRef = new ConsistencyWorker()
  console.log('consistency worker: worker created', workerRef)
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

export function useConsistencyWorker() {
  const ready = ref(false)

  function ensure() {
    const w = initWorker()
    if (w) ready.value = true
    return w
  }

  function postMessageWithResponse(type: string, payload?: any, onProgress?: (progress: any) => void) {
    return new Promise<any>((resolve, reject) => {
      const w = ensure()
      if (!w) return reject(new Error('consistency worker init failed'))
      const requestId = String(Date.now()) + '-' + Math.random().toString(36).slice(2)
      console.log('consistency worker: sending', { type, requestId, payload })
        function handler(ev: MessageEvent) {
          const msg = ev.data || {}
          if (msg.requestId && msg.requestId !== requestId) return
          if (msg.type === 'error') {
            w.removeEventListener('message', handler)
            w.removeEventListener('error', onErr)
            reject(new Error(msg.error || 'worker error'))
            return
          }
          if (msg.type === 'consistency:error') {
            w.removeEventListener('message', handler)
            w.removeEventListener('error', onErr)
            const parts: string[] = []
            if (typeof msg.message === 'string') parts.push(msg.message)
            if (typeof msg.error === 'string') parts.push(msg.error)
            if (typeof msg.stack === 'string') parts.push(msg.stack)
            if (typeof msg.filename === 'string') parts.push(`at ${msg.filename}`)
            if (typeof msg.lineno === 'number' || typeof msg.colno === 'number') {
              parts.push(`:${msg.lineno || '?'}:${msg.colno || '?'}`)
            }
            reject(new Error('worker error: ' + (parts.join(' ') || 'consistency error')))
            return
          }
        if (msg.type === `${type}:progress`) {
          try {
            if (typeof onProgress === 'function') onProgress(msg)
          } catch (e) {}
          return
        }
        if (msg.type === `${type}:done`) {
          w.removeEventListener('message', handler)
          w.removeEventListener('error', onErr)
          try {
            if (typeof onProgress === 'function') onProgress(msg)
          } catch (e) {}
          resolve(msg)
        }
      }
        function onErr(err: any) {
          w.removeEventListener('message', handler)
          w.removeEventListener('error', onErr)
          try {
            console.error('consistency worker error event', err, err && err.error)
          } catch (e) {}
        const messageParts: string[] = []
        if (err && typeof err.message === 'string') messageParts.push(err.message)
        if (err && typeof err.filename === 'string') messageParts.push(`at ${err.filename}`)
        if (err && typeof err.lineno === 'number') messageParts.push(`:${err.lineno}`)
        if (err && typeof err.colno === 'number') messageParts.push(`:${err.colno}`)
        const errorEvent = err as ErrorEvent
        if (errorEvent && errorEvent.error) {
          if (typeof errorEvent.error.message === 'string') messageParts.push(errorEvent.error.message)
          if (typeof errorEvent.error.stack === 'string') messageParts.push(errorEvent.error.stack)
        }
        reject(new Error('worker error: ' + (messageParts.join(' ') || String(err))))
      }
      w.addEventListener('message', handler)
      w.addEventListener('error', onErr)
      const payloadMsg: WorkerMsg = { type, payload, requestId }
      try {
        w.postMessage(payloadMsg)
      } catch (e) {
        console.error('consistency worker postMessage failed', e)
        throw e
      }
    })
  }

  async function startConsistency(payload: any, onProgress?: (progress: any) => void) {
    return postMessageWithResponse('consistency', payload, onProgress)
  }

  return { ready, ensure, startConsistency }
}

export default useConsistencyWorker
