'use client'
import { useEffect, useState } from 'react'
import { Check, Monitor, Moon, Sun } from '@/components/ui/icons'
import { ACCENTS, DEFAULT_THEME, PALETTES, THEME_EVENT, accentVars, applyTheme, readTheme, type Accent, type Surface, type ThemeMode } from '@/lib/utils/theme'
import { playSound, setSoundEnabled, soundEnabled } from '@/lib/utils/sound'
import { Switch } from '@/components/ui/Switch'
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
  const [sound, setSound] = useState(true)
  useEffect(() => { setTheme(readTheme()); setSound(soundEnabled()) }, [])

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
        <span className={labelCls}>Tema</span>
        <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">
          {PALETTES.map(pl => {
            const active = theme.palette === pl.key
            return (
              <button key={pl.key} type="button" role="radio" aria-checked={active} onClick={() => update({ palette: pl.key })}
                className={cn('p-1.5 rounded-[18px] text-left ring-1 ring-inset transition-colors', active ? 'ring-ac bg-p2' : 'ring-transparent bg-p2 hover:bg-p3')}>
                {/* Mini screen in that palette: background, a card, the accent */}
                <span className="relative block h-14 rounded-[12px] overflow-hidden ring-1 ring-inset ring-white/10" style={{ background: pl.bg }}>
                  <span className="absolute left-1.5 right-1.5 top-1.5 h-5 rounded-md" style={{ background: pl.card }} />
                  <span className="absolute left-1.5 bottom-1.5 h-3 w-8 rounded-full bg-ac" />
                  <span className="absolute right-1.5 bottom-1.5 size-3 rounded-full" style={{ background: pl.card }} />
                </span>
                <span className="block text-xs font-semibold mt-1.5 px-1 pb-0.5">{pl.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <span className={labelCls}>Estilo</span>
        <div role="radiogroup" aria-label="Estilo" className="grid grid-cols-2 gap-2">
          {([['solid', 'Sólido', 'Superficies opacas, máximo contraste'], ['glass', 'Cristal', 'Translúcido, con luz de fondo']] as const).map(([key, label, desc]) => {
            const active = theme.surface === key
            return (
              <button key={key} type="button" role="radio" aria-checked={active} onClick={() => update({ surface: key as Surface })}
                className={cn('p-2 rounded-[20px] text-left transition-colors ring-1 ring-inset', active ? 'ring-ac bg-p2' : 'ring-transparent bg-p2 hover:bg-p3')}>
                {/* Tiny preview of the style */}
                <span className={cn('relative block h-16 rounded-[14px] overflow-hidden', key === 'glass' ? 'bg-[radial-gradient(120%_90%_at_10%_0%,rgb(var(--c-ac)/0.55),transparent_60%),radial-gradient(90%_90%_at_100%_100%,rgb(var(--c-bl)/0.5),transparent_60%)] bg-p3' : 'bg-bg')}>
                  <span className={cn('absolute inset-x-2 top-2 h-6 rounded-lg', key === 'glass' ? 'bg-white/20 ring-1 ring-inset ring-white/25' : 'bg-p3')} />
                  <span className={cn('absolute inset-x-5 bottom-1.5 h-4 rounded-full', key === 'glass' ? 'bg-white/25 ring-1 ring-inset ring-white/30' : 'bg-p3')} />
                </span>
                <span className="block text-sm font-semibold mt-2 px-1">{label}</span>
                <span className="block text-xs text-mu px-1 pb-1 leading-snug">{desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-p2 cursor-pointer">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Sonidos</span>
          <span className="block text-xs text-mu leading-snug">Toques suaves al navegar, guardar y lograr un récord</span>
        </span>
        <Switch checked={sound} label="Sonidos" onChange={v => { setSoundEnabled(v); setSound(v); if (v) playSound('success') }} />
      </label>

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
        {/* Any color: the app derives the light-mode shade and the text color on top of it */}
        <label className={cn('mt-2 flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-colors ring-1 ring-inset', theme.accent === 'custom' ? 'bg-p2 ring-ac' : 'bg-p2 ring-transparent hover:bg-p3')}>
          <span className="relative size-9 rounded-full overflow-hidden ring-1 ring-inset ring-t/15 flex-shrink-0"
            style={{ background: theme.custom ?? 'conic-gradient(#f43f5e, #f59e0b, #84cc16, #06b6d4, #6366f1, #d946ef, #f43f5e)' }}>
            <input type="color" aria-label="Color propio" value={theme.custom ?? '#c8f53e'}
              onChange={e => { const vars = accentVars(e.target.value); if (vars) update({ accent: 'custom', custom: e.target.value, vars }) }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Tu propio color</span>
            <span className="block text-xs text-mu leading-snug">Elige cualquiera; se adapta solo al modo claro</span>
          </span>
        </label>
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
