// Light/dark mode and accent color. Stored per device in localStorage and
// applied as data-theme / data-accent on <html> (see globals.css).

export type ThemeMode = 'system' | 'light' | 'dark'
export type Accent = 'lima' | 'violeta' | 'cian' | 'naranja' | 'rosa' | 'azul'

export const ACCENTS: { key: Accent; label: string; swatch: string }[] = [
  // Swatches are the dark-mode accent; only used to paint the picker itself.
  { key: 'lima',    label: 'Lima',    swatch: 'rgb(200 245 62)' },
  { key: 'violeta', label: 'Violeta', swatch: 'rgb(139 92 246)' },
  { key: 'cian',    label: 'Cian',    swatch: 'rgb(34 211 238)' },
  { key: 'naranja', label: 'Naranja', swatch: 'rgb(251 146 60)' },
  { key: 'rosa',    label: 'Rosa',    swatch: 'rgb(244 114 182)' },
  { key: 'azul',    label: 'Azul',    swatch: 'rgb(96 165 250)' },
]

export const THEME_STORAGE_KEY = 'apex-theme'
export const THEME_EVENT = 'apex-themechange'
export const DEFAULT_THEME: { mode: ThemeMode; accent: Accent } = { mode: 'dark', accent: 'lima' }

export function readTheme(): { mode: ThemeMode; accent: Accent } {
  try {
    const raw = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? 'null')
    return {
      mode: ['system', 'light', 'dark'].includes(raw?.mode) ? raw.mode : DEFAULT_THEME.mode,
      accent: ACCENTS.some(a => a.key === raw?.accent) ? raw.accent : DEFAULT_THEME.accent,
    }
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(theme: { mode: ThemeMode; accent: Accent }) {
  const root = document.documentElement
  if (theme.mode === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme.mode)
  root.setAttribute('data-accent', theme.accent)
  try { localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme)) } catch {}
  window.dispatchEvent(new Event(THEME_EVENT))
}

/** Runs before first paint (inline in <head>) so the page never flashes the wrong theme. */
export const themeBootScript = `(function(){try{var t=JSON.parse(localStorage.getItem('${THEME_STORAGE_KEY}')||'null')||{};var r=document.documentElement;var m=t.mode||'${DEFAULT_THEME.mode}';if(m!=='system')r.setAttribute('data-theme',m);r.setAttribute('data-accent',t.accent||'${DEFAULT_THEME.accent}');}catch(e){}})();`

/** A theme color as a canvas-friendly rgba() string, for Chart.js and other non-CSS consumers. */
export function themeColor(token: string, alpha = 1): string {
  const channels = getComputedStyle(document.documentElement).getPropertyValue(`--c-${token}`).trim()
  const [r, g, b] = channels.split(/\s+/)
  return r ? `rgba(${r},${g},${b},${alpha})` : `rgba(128,128,128,${alpha})`
}
