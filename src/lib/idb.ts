/**
 * Tiny IndexedDB key-value store.
 *
 * localStorage is capped around 5 MB and is what the canvas, theme, and (until
 * now) MiniLM vectors all shared. One analyzer run writes hundreds of 384-d
 * float arrays; those writes start throwing QuotaExceeded, and Zustand's persist
 * then fails *silently* — which is why new nodes vanished on refresh. IndexedDB
 * is the same origin, much larger, and async, which is what we want.
 */

const DB_NAME = 'flowai'
const STORE = 'kv'
const VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    let result: T
    req.onsuccess = () => {
      result = req.result
    }
    req.onerror = () => reject(req.error)
    // Wait for the transaction to commit, not just for the request to succeed.
    // A reload between those two moments is how a "save" can vanish.
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  if (typeof indexedDB === 'undefined') return undefined
  try {
    return await withStore('readonly', (s) => s.get(key))
  } catch {
    return undefined
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await withStore('readwrite', (s) => s.put(value, key))
}

export async function idbDel(key: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await withStore('readwrite', (s) => s.delete(key))
}
