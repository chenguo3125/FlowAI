import { create } from 'zustand'

export type ThemePref = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

/** Also read by the pre-paint script in `index.html`; keep the two in step. */
export const THEME_KEY = 'flowai.theme'

const query = '(prefers-color-scheme: light)'

function systemTheme(): Theme {
  return window.matchMedia(query).matches ? 'light' : 'dark'
}

// Storage access is guarded: it throws outright under some privacy settings.
function readStoredPref(): ThemePref {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
  } catch {
    return 'system'
  }
}

function storePref(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, pref)
  } catch {
    /* preference is session-only when storage is unavailable */
  }
}

function resolvePref(pref: ThemePref): Theme {
  return pref === 'system' ? systemTheme() : pref
}

let transitionTimer: number | undefined

function apply(theme: Theme, animate = false) {
  const root = document.documentElement
  if (animate) {
    root.classList.add('theme-transition')
    window.clearTimeout(transitionTimer)
    transitionTimer = window.setTimeout(() => root.classList.remove('theme-transition'), 220)
  }
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
  // Keeps native scrollbars and form controls in step with the palette.
  root.style.colorScheme = theme
}

interface ThemeState {
  pref: ThemePref
  theme: Theme
  setPref: (pref: ThemePref) => void
}

const initialPref = readStoredPref()

export const useTheme = create<ThemeState>()((set) => ({
  pref: initialPref,
  theme: resolvePref(initialPref),
  setPref: (pref) => {
    storePref(pref)
    const theme = resolvePref(pref)
    apply(theme, true)
    set({ pref, theme })
  },
}))

// Follow the OS while the preference is 'system'.
window.matchMedia(query).addEventListener('change', () => {
  const { pref } = useTheme.getState()
  if (pref !== 'system') return
  const theme = resolvePref(pref)
  apply(theme, true)
  useTheme.setState({ theme })
})

apply(useTheme.getState().theme)
