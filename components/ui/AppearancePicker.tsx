'use client'
import { useEffect, useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { ACCENTS, DEFAULT_THEME, THEME_EVENT, applyTheme, readTheme, type Accent, type ThemeMode } from '@/lib/utils/theme'
import { labelCls } from '@/components/ui/Field'
import { cn } from '@/lib/utils/cn'

const MODES: { key: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { key: 'light',  label: 'Claro',   Icon: Sun },
  { key: 'dark',   label: 'Oscuro',  Icon: Moon },
  { key: 'system', label: 'Sistema', Icon: Monitor },
]

export function AppearancePicker() {
  const [theme, setTheme] = useState(DEFAULT_THEME)

  // The saved choice lives in localStorage, which only exists in the browser.
  useEffect(() => { setTheme(readTheme()) }, [])

  function update(next: Partial<typeof theme>) {
    const merged = { ...theme, ...next }
    setTheme(merged)
    applyTheme(merged)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <span className={labelCls}>Modo</span>
        <div role="radiogroup" aria-label="Modo" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-p2">
          {MODES.map(({ key, label, Icon }) => (
            <button key={key} type="button" role="radio" aria-checked={theme.mode === key} onClick={() => update({ mode: key })}
              className={cn('min-h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors',
                theme.mode === key ? 'bg-p3 text-t' : 'text-mu hover:text-t')}>
              <Icon size={16} aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={labelCls}>Color de acento</span>
        <div role="radiogroup" aria-label="Color de acento" className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {ACCENTS.map(a => {
            const active = theme.accent === a.key
            return (
              <button key={a.key} type="button" role="radio" aria-checked={active} onClick={() => update({ accent: a.key as Accent })}
                className={cn('flex flex-col items-center gap-1.5 py-2.5 rounded-xl transition-colors',
                  active ? 'bg-p3' : 'hover:bg-p2')}>
                <span className="size-8 rounded-full grid place-items-center ring-1 ring-inset ring-t/10" style={{ background: a.swatch }}>
                  {active && <Check size={16} strokeWidth={3} className="text-black/80" aria-hidden />}
                </span>
                <span className={cn('text-xs font-semibold', active ? 'text-t' : 'text-mu')}>{a.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** One-tap light/dark switch for the top bar. */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_THEME.mode)
  useEffect(() => { setMode(readTheme().mode) }, [])

  function toggle() {
    const current = readTheme()
    const isDark = current.mode === 'dark' ||
      (current.mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    const next: ThemeMode = isDark ? 'light' : 'dark'
    applyTheme({ ...current, mode: next })
    setMode(next)
  }

  const label = mode === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label}
      className="size-10 grid place-items-center rounded-xl text-mu hover:text-t hover:bg-p2 transition-colors">
      {mode === 'light' ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
    </button>
  )
}

/** Bumps whenever the theme changes (picker or OS), for code that paints with JS such as Chart.js. */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const bump = () => setVersion(v => v + 1)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    window.addEventListener(THEME_EVENT, bump)
    media.addEventListener('change', bump)
    return () => { window.removeEventListener(THEME_EVENT, bump); media.removeEventListener('change', bump) }
  }, [])
  return version
}
