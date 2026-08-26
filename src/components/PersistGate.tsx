import { useEffect, useState, type ReactNode } from 'react'

import { pullRemoteCanvas, scheduleRemotePush } from '@/data/remoteCanvas'
import { useCanvas } from '@/store/canvasStore'

/**
 * Holds the first paint until IndexedDB has rehydrated the canvas.
 *
 * Async storage hydrates *after* the first render. Without this gate the seed
 * canvas paints, then the saved one replaces it — and a write in between would
 * persist the seed over the real work.
 */
export function PersistGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(() => useCanvas.persist.hasHydrated())

  useEffect(() => {
    const unsub = useCanvas.persist.onFinishHydration(() => setReady(true))
    if (useCanvas.persist.hasHydrated()) setReady(true)
    return unsub
  }, [])

  useEffect(() => {
    if (!ready) return
    void pullRemoteCanvas().then((pulled) => {
      if (!pulled) scheduleRemotePush()
    })
    return useCanvas.subscribe((state, prev) => {
      if (
        state.nodes === prev.nodes &&
        state.edges === prev.edges &&
        state.misconceptions === prev.misconceptions &&
        state.reviewMode === prev.reviewMode
      ) {
        return
      }
      scheduleRemotePush()
    })
  }, [ready])

  if (!ready) {
    return <div className="h-full bg-ink-950" aria-busy="true" aria-label="Loading canvas" />
  }
  return children
}
