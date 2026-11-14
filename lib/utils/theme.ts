// Light/dark mode and accent color. Stored per device in localStorage and
// applied as data-theme / data-accent on <html> (see globals.css).

export type ThemeMode = 'system' | 'light' | 'dark'
export type Surface = 'solid' | 'glass'
export type Accent = 'lima' | 'violeta' | 'cian' | 'naranja' | 'rosa' | 'azul' | 'custom'
export type Palette = 'negro' | 'grafito' | 'oceano' | 'bosque' | 'vino' | 'arena'

/** Surface palettes. `bg`/`card` are the dark-mode colors, only used to paint the picker. */
export const PALETTES: { key: Palette; label: string; bg: string; card: string }[] = [
  { key: 'negro',   label: 'Negro',   bg: 'rgb(0 0 0)',     card: 'rgb(26 26 26)' },
  { key: 'grafito', label: 'Grafito', bg: 'rgb(13 15 18)',  card: 'rgb(31 35 42)' },
  { key: 'oceano',  label: 'Océano',  bg: 'rgb(5 12 24)',   card: 'rgb(18 33 56)' },
  { key: 'bosque',  label: 'Bosque',  bg: 'rgb(6 14 11)',   card: 'rgb(19 35 28)' },
  { key: 'vino',    label: 'Vino',    bg: 'rgb(16 7 14)',   card: 'rgb(40 21 36)' },
  { key: 'arena',   label: 'Arena',   bg: 'rgb(17 14 10)',  card: 'rgb(40 34 26)' },
]

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
/** `custom` is the hex the person picked; `vars` are the CSS variables derived from it (also read by the boot script). */
export type Theme = { mode: ThemeMode; accent: Accent; surface: Surface; palette: Palette; custom?: string; vars?: Record<string, string> }
export const DEFAULT_THEME: Theme = { mode: 'dark', accent: 'lima', surface: 'solid', palette: 'negro' }
const ACCENT_VARS = ['--ac-d', '--onac-d', '--ac-l', '--onac-l']

const lum = ([r, g, b]: number[]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
/** Any hex → accent for dark mode, a deeper one for light mode, and readable text on each. */
export function accentVars(hex: string): Record<string, string> | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const rgb = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16))
  let light = rgb
  // On white the accent must be dark enough to read as text.
  for (let i = 0; i < 12 && lum(light) > 0.32; i++) light = light.map(c => Math.round(c * 0.88))
  return {
    '--ac-d': rgb.join(' '), '--onac-d': lum(rgb) > 0.5 ? '0 0 0' : '255 255 255',
    '--ac-l': light.join(' '), '--onac-l': '255 255 255',
  }
}

export function readTheme(): Theme {
  try {
    const raw = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? 'null')
    return {
      mode: ['system', 'light', 'dark'].includes(raw?.mode) ? raw.mode : DEFAULT_THEME.mode,
      accent: raw?.accent === 'custom' && raw?.vars ? 'custom' : ACCENTS.some(a => a.key === raw?.accent) ? raw.accent : DEFAULT_THEME.accent,
      palette: PALETTES.some(p => p.key === raw?.palette) ? raw.palette : DEFAULT_THEME.palette,
      custom: typeof raw?.custom === 'string' ? raw.custom : undefined,
      vars: raw?.vars && typeof raw.vars === 'object' ? raw.vars : undefined,
      surface: raw?.surface === 'glass' ? 'glass' : 'solid',
    }
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme.mode === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme.mode)
  root.setAttribute('data-accent', theme.accent)
  if (theme.palette === 'negro') root.removeAttribute('data-palette')
  else root.setAttribute('data-palette', theme.palette)
  for (const k of ACCENT_VARS) {
    if (theme.accent === 'custom' && theme.vars?.[k]) root.style.setProperty(k, theme.vars[k])
    else root.style.removeProperty(k)
  }
  if (theme.surface === 'glass') root.setAttribute('data-surface', 'glass')
  else root.removeAttribute('data-surface')
  try { localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme)) } catch {}
  window.dispatchEvent(new Event(THEME_EVENT))
}

/** Runs before first paint (inline in <head>) so the page never flashes the wrong theme. */
export const themeBootScript = `(function(){try{var t=JSON.parse(localStorage.getItem('${THEME_STORAGE_KEY}')||'null')||{};var r=document.documentElement;var m=t.mode||'${DEFAULT_THEME.mode}';if(m!=='system')r.setAttribute('data-theme',m);r.setAttribute('data-accent',t.accent||'${DEFAULT_THEME.accent}');if(t.surface==='glass')r.setAttribute('data-surface','glass');if(t.palette&&t.palette!=='negro')r.setAttribute('data-palette',t.palette);if(t.accent==='custom'&&t.vars){for(var k in t.vars){if(/^--(on)?ac-[dl]$/.test(k)&&/^[0-9 ]+$/.test(t.vars[k]))r.style.setProperty(k,t.vars[k]);}}}catch(e){}})();`

/** A theme color as a canvas-friendly rgba() string, for Chart.js and other non-CSS consumers. */
export function themeColor(token: string, alpha = 1): string {
  const channels = getComputedStyle(document.documentElement).getPropertyValue(`--c-${token}`).trim()
  const [r, g, b] = channels.split(/\s+/)
  return r ? `rgba(${r},${g},${b},${alpha})` : `rgba(128,128,128,${alpha})`
}
