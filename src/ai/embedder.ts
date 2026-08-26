import { hashString } from '@/lib/hash'
import { idbGet, idbSet } from '@/lib/idb'

/**
 * Local embedder for Tier 1.
 *
 * MiniLM runs in the browser (no API key, ~23 MB, cached after the first
 * download). Node — and a browser that cannot reach the model hub — fall
 * through to a hashed n-gram embedder so the analyzer never depends on a
 * network call to produce candidates.
 */

export const MINILM_ID = 'onnx-community/all-MiniLM-L6-v2-ONNX'

export type EmbedBackend = 'minilm' | 'ngram'

const NGRAM_DIM = 256
const CACHE_PREFIX = 'flowai.embed.v1'

type VectorCache = Record<string, number[]>

let backend: EmbedBackend | null = null
let extractor: ((text: string) => Promise<number[]>) | null = null
let cache: VectorCache | null = null
let loading: Promise<EmbedBackend> | null = null
let cacheReady: Promise<void> | null = null

function cacheStore(id: EmbedBackend): string {
  return `${CACHE_PREFIX}.${id}`
}

function reclaimLocalStorage() {
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('flowai.embed.')) doomed.push(key)
    }
    for (const key of doomed) localStorage.removeItem(key)
  } catch {
    /* private mode */
  }
}

async function loadCache(id: EmbedBackend): Promise<VectorCache> {
  const fromIdb = await idbGet<VectorCache>(cacheStore(id))
  if (fromIdb) return fromIdb
  try {
    const raw = localStorage.getItem(cacheStore(id))
    if (raw) {
      const parsed = JSON.parse(raw) as VectorCache
      await idbSet(cacheStore(id), parsed)
      return parsed
    }
  } catch {
    /* node / quota / private mode */
  }
  return {}
}

async function saveCache(id: EmbedBackend, data: VectorCache) {
  try {
    await idbSet(cacheStore(id), data)
  } catch {
    /* quota — in-memory still serves this session */
  }
}

export function currentBackend(): EmbedBackend | null {
  return backend
}

/**
 * Resolves the backend once per session. MiniLM is attempted only in a
 * browser; a failed load is remembered so later analyzer runs do not retry
 * a 23 MB download that already failed.
 */
export async function ensureBackend(): Promise<EmbedBackend> {
  if (backend) return backend
  if (loading) return loading
  loading = (async () => {
    if (typeof window !== 'undefined') {
      try {
        extractor = await loadMiniLM()
        backend = 'minilm'
        return backend
      } catch (err) {
        console.warn('[flowai] MiniLM unavailable, using hashed n-grams:', err)
      }
    }
    backend = 'ngram'
    return backend
  })()
  try {
    return await loading
  } finally {
    loading = null
  }
}

async function loadMiniLM(): Promise<(text: string) => Promise<number[]>> {
  const { pipeline, env } = await import('@huggingface/transformers')
  // Single-threaded wasm avoids needing COOP/COEP headers just to classify.
  env.allowLocalModels = false
  env.useBrowserCache = true
  const wasm = (env as { backends?: { onnx?: { wasm?: { numThreads?: number } } } }).backends
    ?.onnx?.wasm
  if (wasm) wasm.numThreads = 1

  const pipe = await pipeline('feature-extraction', MINILM_ID, { dtype: 'q8' })

  return async (text: string) => {
    const tensor = await pipe(text, { pooling: 'mean', normalize: true })
    const row = (tensor.tolist() as number[][])[0]
    return row ?? Array.from(tensor.data as Float32Array)
  }
}

/**
 * Embeds `texts` with the active backend, skipping anything already cached
 * under that backend. Returns vectors aligned to input order.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const id = await ensureBackend()
  if (!cache) {
    reclaimLocalStorage()
    cacheReady ??= loadCache(id).then((data) => {
      cache = data
    })
    await cacheReady
    cache ??= {}
  }

  const keyed = texts.map((text) => ({ text, key: hashString(text) }))
  const missing = keyed.filter(({ key }) => !cache![key])

  for (const item of missing) {
    cache![item.key] = await vectorize(item.text, id)
  }
  if (missing.length > 0) void saveCache(id, cache)

  return keyed.map(({ key }) => cache![key]!)
}

async function vectorize(text: string, id: EmbedBackend): Promise<number[]> {
  if (id === 'minilm' && extractor) return extractor(text)
  return ngramVector(text)
}

/** Exported so the check script can score claims without loading MiniLM. */
export function ngramVector(text: string, dim = NGRAM_DIM): number[] {
  const v = new Array<number>(dim).fill(0)
  const normed = text.toLowerCase().replace(/[^a-z0-9+\-]+/g, ' ').trim()
  if (!normed) return v

  const compact = normed.replace(/ /g, '')
  for (let i = 0; i + 3 <= compact.length; i++) {
    v[fnv(compact.slice(i, i + 3)) % dim] += 1
  }

  const words = normed.split(/\s+/).filter(Boolean)
  for (const w of words) v[fnv(w) % dim] += 2
  for (let i = 0; i + 1 < words.length; i++) {
    v[fnv(`${words[i]}_${words[i + 1]}`) % dim] += 3
  }

  return l2(v)
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < n; i++) {
    const x = a[i]!
    const y = b[i]!
    dot += x * y
    normA += x * x
    normB += y * y
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function l2(v: number[]): number[] {
  let sum = 0
  for (const x of v) sum += x * x
  const denom = Math.sqrt(sum)
  if (denom === 0) return v
  return v.map((x) => x / denom)
}

function fnv(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
