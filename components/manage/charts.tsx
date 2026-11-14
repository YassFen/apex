'use client'
// Small chart kit for the administrator and platform panels. No chart library: bars are
// plain elements, lines are one SVG path. Rules followed: one hue per chart (the accent) with
// a neutral for the comparison series, thin marks with rounded data-ends, values in text
// colors, a legend whenever there are two series, and a tooltip on hover or keyboard focus.
import { useId, useState } from 'react'
import { cn } from '@/lib/utils/cn'

export interface Datum { label: string; value: number; hint?: string; highlight?: boolean }

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-10 px-2 py-1 rounded-lg bg-t text-bg text-[11px] font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150">
      {children}
    </span>
  )
}

export function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <div className="flex items-center gap-4 text-xs text-mu">
      {items.map(i => <span key={i.label} className="flex items-center gap-1.5"><span className={cn('size-2.5 rounded-[3px]', i.className)} aria-hidden />{i.label}</span>)}
    </div>
  )
}

/** Vertical bars, one series. The tallest (or `highlight`) bar wears the accent. */
export function Bars({ data, unit = '', height = 132, format }: { data: Datum[]; unit?: string; height?: number; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map(d => d.value))
  const anyFlag = data.some(d => d.highlight)
  const f = format ?? ((n: number) => String(Math.round(n * 10) / 10))
  return (
    <div role="img" aria-label={data.map(d => `${d.label}: ${f(d.value)}${unit}`).join(', ')} className="flex items-end gap-[2px]" style={{ height }}>
      {data.map((d, i) => {
        const top = anyFlag ? d.highlight : d.value === max && d.value > 0
        return (
          <div key={i} tabIndex={0} className="group relative flex-1 min-w-0 h-full flex flex-col justify-end items-center outline-none">
            <Tip>{d.label}: {f(d.value)}{unit}{d.hint ? ` · ${d.hint}` : ''}</Tip>
            {top && <span className="text-[11px] font-semibold tabular-nums mb-1">{f(d.value)}</span>}
            <div className={cn('w-full max-w-9 rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:ring-2 ring-t', top ? 'bg-ac' : 'bg-ac/45')}
              style={{ height: `${d.value ? Math.max(3, (d.value / max) * 78) : 1}%` }} />
            <span className="text-[10px] text-mu mt-1.5 truncate max-w-full">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Two series side by side per category: now (accent) against before (neutral). */
export function CompareBars({ data, nowLabel, beforeLabel, height = 132 }: { data: { label: string; now: number; before: number }[]; nowLabel: string; beforeLabel: string; height?: number }) {
  const max = Math.max(1, ...data.flatMap(d => [d.now, d.before]))
  return (
    <div className="flex flex-col gap-3">
      <Legend items={[{ label: nowLabel, className: 'bg-ac' }, { label: beforeLabel, className: 'bg-fa' }]} />
      <div role="img" aria-label={data.map(d => `${d.label}: ${d.now} ${nowLabel}, ${d.before} ${beforeLabel}`).join('; ')} className="flex items-end gap-2" style={{ height }}>
        {data.map(d => (
          <div key={d.label} tabIndex={0} className="group relative flex-1 min-w-0 h-full flex flex-col justify-end items-center outline-none">
            <Tip>{d.label}: {d.now} · antes {d.before}</Tip>
            <div className="w-full flex items-end justify-center gap-[2px] flex-1">
              <div className="w-1/2 max-w-5 rounded-t-[4px] bg-fa" style={{ height: `${d.before ? Math.max(3, (d.before / max) * 100) : 1}%` }} />
              <div className="w-1/2 max-w-5 rounded-t-[4px] bg-ac" style={{ height: `${d.now ? Math.max(3, (d.now / max) * 100) : 1}%` }} />
            </div>
            <span className="text-[10px] text-mu mt-1.5 truncate max-w-full">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Horizontal bars for rankings (names on the left, value on the right). */
export function RankBars({ data, unit = '', empty = 'Sin datos todavía.' }: { data: Datum[]; unit?: string; empty?: string }) {
  const max = Math.max(1, ...data.map(d => d.value))
  if (!data.length) return <p className="text-sm text-mu">{empty}</p>
  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((d, i) => (
        <li key={i} title={d.hint}>
          <div className="flex justify-between gap-3 text-sm mb-1">
            <span className="truncate">{d.label}</span>
            <span className="font-semibold tabular-nums flex-shrink-0">{d.value}{unit}{d.hint ? <span className="text-fa font-normal"> · {d.hint}</span> : null}</span>
          </div>
          <div className="h-1.5 rounded-full bg-p3 overflow-hidden"><div className="h-full rounded-full bg-ac" style={{ width: `${(d.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

/** Line over time, one or two series (the second one is the neutral comparison). Hover for values. */
export function LineChart({ labels, series, compare, height = 130, nowLabel, beforeLabel }: {
  labels: string[]; series: number[]; compare?: number[]; height?: number; nowLabel?: string; beforeLabel?: string
}) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const n = labels.length
  const W = 320, H = 100, P = 6
  const max = Math.max(1, ...series, ...(compare ?? []))
  const x = (i: number) => (n <= 1 ? W / 2 : P + (i / (n - 1)) * (W - P * 2))
  const y = (v: number) => H - P - (v / max) * (H - P * 2)
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const lastI = series.length - 1
  const at = hover ?? lastI
  return (
    <div className="flex flex-col gap-3">
      {compare && nowLabel && beforeLabel && <Legend items={[{ label: nowLabel, className: 'bg-ac' }, { label: beforeLabel, className: 'bg-fa' }]} />}
      <div className="relative" style={{ height }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible" role="img"
          aria-label={`${nowLabel ?? 'Serie'}: ${series.map((v, i) => `${labels[i]} ${v}`).join(', ')}`}
          onPointerLeave={() => setHover(null)}
          onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(lastI, Math.round(((e.clientX - r.left) / r.width) * (n - 1))))) }}>
          <line x1="0" x2={W} y1={H - P} y2={H - P} className="stroke-p3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {compare && <path d={path(compare)} fill="none" className="stroke-fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          <path d={path(series)} fill="none" className="stroke-ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {hover !== null && <line x1={x(at)} x2={x(at)} y1={P} y2={H - P} className="stroke-mu" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* Marker and value as HTML so they keep their shape when the SVG stretches */}
        {series.length > 0 && (
          <div className="pointer-events-none absolute" style={{ left: `${(x(at) / W) * 100}%`, top: `${(y(series[at]) / H) * 100}%` }}>
            <span className="absolute -translate-x-1/2 -translate-y-1/2 size-2.5 rounded-full bg-ac ring-2 ring-p" />
            <span className={cn('absolute bottom-2.5 px-1.5 py-0.5 rounded-md bg-t text-bg text-[11px] font-semibold whitespace-nowrap tabular-nums', at > n / 2 ? 'right-1' : 'left-1')}>
              {labels[at]}: {series[at]}{compare && compare[at] !== undefined ? ` · antes ${compare[at]}` : ''}
            </span>
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-mu" aria-hidden id={id}>
        <span>{labels[0]}</span>{n > 2 && <span>{labels[Math.floor((n - 1) / 2)]}</span>}<span>{labels[n - 1]}</span>
      </div>
    </div>
  )
}

/** Up / down against the previous period, as text (never color alone). */
export function Delta({ now, before, suffix = 'vs. mes anterior' }: { now: number; before: number; suffix?: string }) {
  if (!before && !now) return <span className="text-fa">Sin datos {suffix}</span>
  const diff = now - before
  const pct = before ? Math.round((diff / before) * 100) : null
  return (
    <span className={diff > 0 ? 'text-gr' : diff < 0 ? 'text-rd' : 'text-mu'}>
      {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {diff > 0 ? '+' : ''}{pct !== null ? `${pct}%` : diff} <span className="text-fa">{suffix}</span>
    </span>
  )
}
