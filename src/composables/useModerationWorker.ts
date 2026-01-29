type WorkerMsg = { type: string; payload?: any; requestId?: string };

import ModerationWorker from '../workers/ai-moderation.worker.ts?worker'

let workerRef: Worker | null = null;

function initWorker() {
  if (workerRef) return workerRef;
  workerRef = new ModerationWorker()
  return workerRef;
}

export function useModerationWorker() {
  function ensure() {
    return initWorker();
  }

  function postMessageWithResponse(
    type: string,
    payload?: any,
    onProgress?: (progress: any) => void,
  ) {
    return new Promise<any>((resolve, reject) => {
      const w = ensure();
      if (!w) return reject(new Error('moderation worker init failed'));
      const requestId =
        String(Date.now()) + '-' + Math.random().toString(36).slice(2)

      function handler(ev: MessageEvent) {
        const msg = ev.data || {};
        if (msg.requestId && msg.requestId !== requestId) return;
        if (msg.type === 'error') {
          w.removeEventListener('message', handler)
          w.removeEventListener('error', onErr)
          reject(new Error(msg.error || 'worker error'))
          return;
        }
        if (msg.type === `${type}:progress`) {
          try {
            if (typeof onProgress === 'function') onProgress(msg)
          } catch (e) {}
          return;
        }
        if (msg.type === `${type}:done`) {
          w.removeEventListener('message', handler)
          w.removeEventListener('error', onErr)
          resolve(msg);
        }
      }

      function onErr(err: any) {
        w.removeEventListener('message', handler)
        w.removeEventListener('error', onErr)
        reject(new Error(err?.message || String(err)))
      }

      w.addEventListener('message', handler)
      w.addEventListener('error', onErr)
      const payloadMsg: WorkerMsg = { type, payload, requestId };
      w.postMessage(payloadMsg)
    });
  }

  async function startModeration(
    payload: any,
    onProgress?: (progress: any) => void,
  ) {
    return postMessageWithResponse('moderation', payload, onProgress)
  }

  return { ensure, startModeration }
}

export default useModerationWorker
