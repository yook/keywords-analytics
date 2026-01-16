import { useDexie } from '../composables/useDexie'
import { useDuckDBStore } from '../stores/duckdb'

export async function runGreetingExample() {
  const store = useDuckDBStore()
  const db = useDexie()
  store.setLoading(true)
  store.setError(null)
  try {
    await db.init()
    await db.addGreeting('Hello from Dexie')
    const res = await db.getGreetings()
    store.setResult(res)
    store.setConnected(true)
    return res
  } catch (e: any) {
    store.setError(e?.message ?? String(e))
    throw e
  } finally {
    store.setLoading(false)
  }
}
