import { ref } from 'vue';
import { markLemmaDictReady } from './lemmaDictStatus';
import LemmaSharedWorker from '../workers/lemma-dict.shared.ts?sharedworker';

let sharedWorkerRef: SharedWorker | null = null;

export function useLemmaDictSharedWorker() {
  const ready = ref(false);

  function ensure() {
    if (sharedWorkerRef) return sharedWorkerRef;
    if (typeof SharedWorker === 'undefined') {
      console.warn('[lemma-shared] SharedWorker is not supported in this environment');
      return null;
    }
    console.log('[lemma-shared] initializing SharedWorker');
    sharedWorkerRef = new LemmaSharedWorker();
    const port = sharedWorkerRef.port;
    port.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'lemma:ready') {
        ready.value = true;
        markLemmaDictReady();
        console.log('[lemma-shared] ready');
      }
      if (msg.type === 'lemma:error') {
        console.error('[lemma-shared] error', msg.error);
      }
    };
    try {
      port.start?.();
    } catch (_) {}
    try {
      port.postMessage({ type: 'lemma:load' });
    } catch (_) {}
    return sharedWorkerRef;
  }

  return { ready, ensure };
}
