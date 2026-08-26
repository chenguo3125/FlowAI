import { useCallback, useEffect, useState } from 'react'

const KEY = 'flowai.sidebar.width'

export const SIDEBAR_MIN = 360
export const SIDEBAR_DEFAULT = 440
/** Leave enough canvas that a node card is still readable beside the sidebar. */
const CANVAS_MIN = 420

function maxWidth() {
  return Math.max(SIDEBAR_MIN, window.innerWidth - CANVAS_MIN)
}

function clamp(px: number) {
  return Math.round(Math.min(Math.max(px, SIDEBAR_MIN), maxWidth()))
}

function read() {
  try {
    const raw = Number(localStorage.getItem(KEY))
    return clamp(Number.isFinite(raw) && raw > 0 ? raw : SIDEBAR_DEFAULT)
  } catch {
    return SIDEBAR_DEFAULT
  }
}

/**
 * Width lives in a CSS variable on <html> rather than in a React style prop.
 * Dragging writes the variable directly, so a drag stays smooth at pointer rate
 * and an unrelated re-render mid-drag (a streaming token, say) can't snap the
 * sidebar back to the last committed value.
 */
function paint(px: number) {
  document.documentElement.style.setProperty('--sidebar-w', `${px}px`)
}

export function useSidebarResize() {
  const [width, setWidth] = useState(read)

  const commit = useCallback((px: number) => {
    const next = clamp(px)
    paint(next)
    setWidth(next)
    try {
      localStorage.setItem(KEY, String(next))
    } catch {
      /* width is session-only when storage is unavailable */
    }
  }, [])

  useEffect(() => {
    paint(width)
  }, [width])

  // A shrinking window must not leave the sidebar wider than the viewport.
  useEffect(() => {
    const onResize = () => setWidth((w) => clamp(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()

      const handle = event.currentTarget
      handle.setPointerCapture(event.pointerId)
      document.body.style.userSelect = 'none'

      // The sidebar is right-aligned, so dragging left widens it.
      const onMove = (e: PointerEvent) => paint(clamp(window.innerWidth - e.clientX))
      const onUp = (e: PointerEvent) => {
        handle.removeEventListener('pointermove', onMove)
        handle.removeEventListener('pointerup', onUp)
        handle.removeEventListener('pointercancel', onUp)
        document.body.style.userSelect = ''
        commit(window.innerWidth - e.clientX)
      }

      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', onUp)
      handle.addEventListener('pointercancel', onUp)
    },
    [commit],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? 64 : 16
      if (event.key === 'ArrowLeft') commit(width + step)
      else if (event.key === 'ArrowRight') commit(width - step)
      else if (event.key === 'Home' || event.key === 'Enter') commit(SIDEBAR_DEFAULT)
      else return
      event.preventDefault()
    },
    [commit, width],
  )

  return {
    width,
    reset: useCallback(() => commit(SIDEBAR_DEFAULT), [commit]),
    handleProps: { onPointerDown, onKeyDown },
  }
}
