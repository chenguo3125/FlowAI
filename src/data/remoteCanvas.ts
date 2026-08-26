import { doc, getDoc, setDoc } from 'firebase/firestore'

import { firebaseEnabled, getFirebaseDb } from '@/data/firebase'
import { toStoredEdges, toStoredNodes, useCanvas } from '@/store/canvasStore'

const DEVICE_KEY = 'flowai.deviceId'
const COLLECTION = 'canvases'

function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
    return id
  } catch {
    return 'anonymous'
  }
}

type CanvasSlice = Pick<
  ReturnType<typeof useCanvas.getState>,
  'nodes' | 'edges' | 'selectedNodeId' | 'misconceptions' | 'lastRun' | 'reviewMode'
>

interface RemoteCanvas extends CanvasSlice {
  updatedAt: number
}

function sliceOf(state: ReturnType<typeof useCanvas.getState>): CanvasSlice {
  return {
    nodes: toStoredNodes(state.nodes),
    edges: toStoredEdges(state.edges),
    selectedNodeId: state.selectedNodeId,
    misconceptions: state.misconceptions,
    lastRun: state.lastRun,
    reviewMode: state.reviewMode,
  }
}

/** Firestore rejects `undefined`. JSON round-trip drops those keys. */
function forFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Pulls the cloud copy if it is newer than the local one. Last-write-wins on
 * `updatedAt` — enough for a single-device prototype, not a merge editor.
 */
export async function pullRemoteCanvas(): Promise<boolean> {
  const db = getFirebaseDb()
  if (!db) return false

  try {
    const snap = await getDoc(doc(db, COLLECTION, deviceId()))
    if (!snap.exists()) return false
    const remote = snap.data() as RemoteCanvas
    if (typeof remote.updatedAt !== 'number' || !Array.isArray(remote.nodes)) return false

    const local = useCanvas.getState()
    if (remote.updatedAt <= (local.savedAt ?? 0) && remote.nodes.length <= local.nodes.length) {
      return false
    }

    useCanvas.setState({
      nodes: remote.nodes,
      edges: remote.edges ?? [],
      selectedNodeId: remote.selectedNodeId ?? null,
      misconceptions: remote.misconceptions ?? [],
      lastRun: remote.lastRun ?? null,
      reviewMode: remote.reviewMode ?? false,
      savedAt: remote.updatedAt,
    })
    return true
  } catch (err) {
    console.warn('[flowai] Firestore pull failed:', err)
    return false
  }
}

export async function pushRemoteCanvas(): Promise<void> {
  const db = getFirebaseDb()
  if (!db) return

  const payload: RemoteCanvas = {
    ...sliceOf(useCanvas.getState()),
    updatedAt: Date.now(),
  }

  try {
    await setDoc(doc(db, COLLECTION, deviceId()), forFirestore(payload))
  } catch (err) {
    console.warn('[flowai] Firestore push failed:', err)
  }
}

let debounceTimer: number | undefined

export function scheduleRemotePush() {
  if (!firebaseEnabled()) return
  window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => void pushRemoteCanvas(), 900)
}

export { firebaseEnabled }
