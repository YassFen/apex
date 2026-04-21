'use client'

/**
 * Minimal SVG radar showing athlete strengths across training categories.
 * Each axis is a 0–100 score computed from how many RMs the athlete has
 * in that category relative to their overall volume (capped to look sensible
 * for new users).
 */

interface PrRow {
  metric: string
  value_lb: number
  movements: { name: string; category: string } | null
}

const AXES: { key: string; label: string }[] = [
  { key: 'weightlifting', label: 'Fuerza' },
  { key: 'olympic',       label: 'Olímpico' },
  { key: 'gymnastics',    label: 'Gimnástico' },
  { key: 'cardio',        label: 'Monoestr.' },
  { key: 'benchmark',     label: 'Benchmark' },
]

function computeScores(prs: PrRow[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const axis of AXES) counts[axis.key] = 0
  for (const p of prs) {
    const cat = p.movements?.category
    if (cat && counts[cat] !== undefined) counts[cat] += 1
  }
  // Cap at 8 RMs per category for full score (keeps early users readable)
  const out: Record<string, number> = {}
  for (const k in counts) out[k] = Math.min(100, Math.round((counts[k] / 8) * 100))
  return out
}

export function AthleteRadar({ prs, size = 280 }: { prs: PrRow[]; size?: number }) {
  const scores = computeScores(prs)
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.38
  const n = AXES.length

  function point(axisIndex: number, value: number) {
    // value 0..100 → 0..1
    const r = radius * (value / 100)
    const angle = (Math.PI * 2 * axisIndex) / n - Math.PI / 2
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const
  }

  const gridLevels = [25, 50, 75, 100]
  const polygon = AXES
    .map((a, i) => point(i, scores[a.key] ?? 0))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')

  const totalRMs = prs.length

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="max-w-full">
        {/* Grid polygons */}
        {gridLevels.map(level => {
          const pts = AXES.map((_, i) => point(i, level))
            .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
            .join(' ')
          return (
            <polygon key={level} points={pts} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="1" />
          )
        })}
        {/* Axes */}
        {AXES.map((_, i) => {
          const [x, y] = point(i, 100)
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,.07)" strokeWidth="1" />
        })}
        {/* Data polygon */}
        <polygon points={polygon} fill="rgba(200,245,62,.2)" stroke="#c8f53e" strokeWidth="2" strokeLinejoin="round" />
        {/* Data points */}
        {AXES.map((a, i) => {
          const [x, y] = point(i, scores[a.key] ?? 0)
          return <circle key={a.key} cx={x} cy={y} r="3.5" fill="#c8f53e" />
        })}
        {/* Labels */}
        {AXES.map((a, i) => {
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
