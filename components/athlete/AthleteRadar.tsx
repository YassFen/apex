'use client'

import { useEffect, useMemo, useState } from 'react'
import { Settings2 } from 'lucide-react'

/**
 * Minimal SVG radar showing athlete strengths across training categories.
 * Axes are configurable per-user (persisted in localStorage). A radar needs
 * at least 3 axes to look sensible, so the picker enforces that minimum.
 */

interface PrRow {
  metric: string
  value_lb: number
  movements: { name: string; category: string } | null
}

type AxisKey =
  | 'weightlifting'
  | 'olympic'
  | 'gymnastics'
  | 'cardio'
  | 'benchmark'
  | 'monostructural'  // alias of cardio for display purposes if a coach prefers
  | 'endurance'       // long-distance / aerobic — derived from cardio + benchmarks

const AVAILABLE_AXES: { key: AxisKey; label: string; sourceCats: string[] }[] = [
  { key: 'weightlifting', label: 'Fuerza',          sourceCats: ['weightlifting'] },
  { key: 'olympic',       label: 'Olímpico',        sourceCats: ['olympic'] },
  { key: 'gymnastics',    label: 'Gimnástico',      sourceCats: ['gymnastics'] },
  { key: 'cardio',        label: 'Monoestr.',       sourceCats: ['cardio'] },
  { key: 'benchmark',     label: 'Benchmarks',      sourceCats: ['benchmark'] },
  { key: 'endurance',     label: 'Resistencia',     sourceCats: ['cardio', 'benchmark'] },
]

const DEFAULT_AXES: AxisKey[] = ['weightlifting', 'olympic', 'gymnastics', 'cardio', 'benchmark']
const RADAR_AXES_KEY = 'apex.radarAxes'

function loadAxes(): AxisKey[] {
  if (typeof window === 'undefined') return DEFAULT_AXES
  try {
    const raw = localStorage.getItem(RADAR_AXES_KEY)
    if (!raw) return DEFAULT_AXES
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length >= 3) {
      const valid = parsed.filter((k: string): k is AxisKey =>
        AVAILABLE_AXES.some(a => a.key === k))
      if (valid.length >= 3) return valid
    }
    return DEFAULT_AXES
  } catch { return DEFAULT_AXES }
}

function computeScores(prs: PrRow[], axes: AxisKey[]): Record<string, number> {
  // Score per axis: count PRs whose category is one of the axis source cats.
  // Cap at 8 RMs per category for "full" score (early users readable).
  const out: Record<string, number> = {}
  for (const k of axes) {
    const def = AVAILABLE_AXES.find(a => a.key === k)
    if (!def) { out[k] = 0; continue }
    const matches = prs.filter(p => {
      const cat = p.movements?.category
      return cat ? def.sourceCats.includes(cat) : false
    }).length
    out[k] = Math.min(100, Math.round((matches / 8) * 100))
  }
  return out
}

export function AthleteRadar({ prs, size = 280 }: { prs: PrRow[]; size?: number }) {
  // SSR-safe: start with default, hydrate from localStorage after mount
  const [axisKeys, setAxisKeys] = useState<AxisKey[]>(DEFAULT_AXES)
  const [editing, setEditing] = useState(false)

  useEffect(() => { setAxisKeys(loadAxes()) }, [])

  function persist(next: AxisKey[]) {
    setAxisKeys(next)
    try { localStorage.setItem(RADAR_AXES_KEY, JSON.stringify(next)) } catch {}
  }

  function toggleAxis(key: AxisKey) {
    if (axisKeys.includes(key)) {
      if (axisKeys.length <= 3) return // minimum 3 to keep radar shape
      persist(axisKeys.filter(k => k !== key))
    } else {
      persist([...axisKeys, key])
    }
  }

  const axes = useMemo(
    () => axisKeys.map(k => AVAILABLE_AXES.find(a => a.key === k)!).filter(Boolean),
    [axisKeys]
  )
  const scores = useMemo(() => computeScores(prs, axisKeys), [prs, axisKeys])

  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.38
  const n = axes.length

  function point(axisIndex: number, value: number) {
    const r = radius * (value / 100)
    const angle = (Math.PI * 2 * axisIndex) / n - Math.PI / 2
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const
  }

  const gridLevels = [25, 50, 75, 100]
  const polygon = axes
    .map((a, i) => point(i, scores[a.key] ?? 0))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')

  const totalRMs = prs.length

  return (
    <div className="flex flex-col items-center">
      <div className="w-full flex justify-end mb-1">
        <button onClick={() => setEditing(v => !v)}
          className="inline-flex items-center gap-1 text-[11px] text-fa hover:text-t transition-colors">
          <Settings2 size={12} /> {editing ? 'Listo' : 'Personalizar'}
        </button>
      </div>

      {editing ? (
        <div className="w-full p-3 rounded-xl bg-p3 border border-[var(--ln)] mb-3">
          <div className="text-[10px] uppercase tracking-[1.6px] text-fa font-bold mb-2">
            Ejes del perfil ({axisKeys.length}, mín. 3)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_AXES.map(a => {
              const active = axisKeys.includes(a.key)
              const lockOff = active && axisKeys.length <= 3
              return (
                <button key={a.key} onClick={() => toggleAxis(a.key)} disabled={lockOff}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                    active
                      ? 'bg-ac/15 text-ac border-ac/30'
                      : 'border-[var(--ln2)] text-mu hover:text-t'
                  } ${lockOff ? 'opacity-60 cursor-not-allowed' : ''}`}>
                  {a.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="max-w-full">
        {gridLevels.map(level => {
          const pts = axes.map((_, i) => point(i, level))
            .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
            .join(' ')
          return (
            <polygon key={level} points={pts} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="1" />
          )
        })}
        {axes.map((_, i) => {
          const [x, y] = point(i, 100)
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,.07)" strokeWidth="1" />
        })}
        <polygon points={polygon} fill="rgba(200,245,62,.2)" stroke="#c8f53e" strokeWidth="2" strokeLinejoin="round" />
        {axes.map((a, i) => {
          const [x, y] = point(i, scores[a.key] ?? 0)
          return <circle key={a.key} cx={x} cy={y} r="3.5" fill="#c8f53e" />
        })}
        {axes.map((a, i) => {
          const [x, y] = point(i, 118)
          const anchor = Math.abs(x - cx) < 2 ? 'middle' : x > cx ? 'start' : 'end'
          return (
            <text key={a.key} x={x} y={y} fontSize="11" fill="#8a96a8" fontWeight="700"
              textAnchor={anchor} dominantBaseline="middle" className="uppercase tracking-wider">
              {a.label}
            </text>
          )
        })}
      </svg>
      <div className="mt-2 text-[11px] text-fa">
        {totalRMs === 0 ? 'Registra RMs para construir tu perfil atlético' : `Basado en ${totalRMs} registros`}
      </div>
    </div>
  )
}
