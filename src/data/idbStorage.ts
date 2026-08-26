import type { StateStorage } from 'zustand/middleware'

import { idbDel, idbGet, idbSet } from '@/lib/idb'

/** Previous persist key, still read once so a refresh after this change keeps work. */
const LEGACY_KEY = 'flowai.canvas.v2'

/**
 * Zustand persist adapter. IndexedDB holds the canvas; localStorage is only
 * consulted on the first run after the migration, then left alone.
 */
export const idbStorage: StateStorage = {
  async getItem(name) {
    try {
      const doomed: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('flowai.embed.')) doomed.push(key)
      }
      for (const key of doomed) localStorage.removeItem(key)
    } catch {
      /* private mode / node */
    }
    const hit = await idbGet<string>(name)
    if (hit != null) return hit
    try {
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (legacy) {
        await idbSet(name, legacy)
        return legacy
      }
    } catch {
      /* private mode */
    }
    return null
  },
  async setItem(name, value) {
    await idbSet(name, value)
  },
  async removeItem(name) {
    await idbDel(name)
  },
}
