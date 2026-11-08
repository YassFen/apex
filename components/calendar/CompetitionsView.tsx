'use client'
import Link from 'next/link'
import { motion } from 'motion/react'
import { Trophy, Medal, CaretRight, Plus, TrendUp, TrendDown } from '@/components/ui/icons'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { AnimatedNumber, EASE_OUT, Reveal } from '@/components/ui/motion'
import { formatDateOnly } from '@/lib/utils/dates'
import { EVENT_KIND_LABEL, type EventKind } from '@/lib/utils/readiness'
import { cn } from '@/lib/utils/cn'
import type { Profile } from '@/lib/types/database'

export interface CompEntry {
  id: string; name: string; kind: EventKind; date: string; location: string | null; division: string
  place: number | null; field: number | null
  workouts: { title: string; value: string | null; place: number | null }[]
}

/** Top-% standing: 1st of 100 → 99, 50th of 100 → 50. Higher is better. */
const percentile = (place: number, field: number) => Math.round(((field - place) / Math.max(1, field - 1)) * 100)

export function CompetitionsView({ profile, entries, today, missingResults }: { profile: Profile; entries: CompEntry[]; today: string; missingResults: boolean }) {
  const past = entries.filter(e => e.date <= today)
  const upcoming = entries.filter(e => e.date > today)
  const ranked = past.filter(e => e.place && e.field).sort((a, b) => a.date.localeCompare(b.date))
  const series = ranked.map(e => ({ date: e.date, name: e.name, pct: percentile(e.place as number, e.field as number) }))
  const best = past.filter(e => e.place).sort((a, b) => (a.place as number) - (b.place as number))[0]
  const trend = series.length >= 2 ? series[series.length - 1].pct - series[series.length - 2].pct : null
  const podiums = past.filter(e => e.place && e.place <= 3).length

  return (
    <>
      <Topbar title="Competencias" profile={profile} actions={
        <Link href="/calendar/event/new" aria-label="Agregar competencia" className="size-10 rounded-full bg-ac text-onac grid place-items-center active:scale-95 transition">
          <Plus size={20} weight="bold" />
        </Link>
      } />
      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-3xl w-full mx-auto">
        {missingResults && <p className="text-mu text-xs px-1">Los resultados por workout se activan con la migración 007.</p>}

        <div className="grid grid-cols-3 gap-3 stagger">
          <Stat label="Competencias" value={past.length} />
          <Stat label="Podios" value={podiums} tone="text-ac" />
          <Stat label="Mejor puesto" value={best?.place ?? null} prefix="#" />
        </div>

        {series.length >= 2 && (
          <Reveal>
            <Card>
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h2 className="font-semibold">Tu progreso</h2>
                  <p className="text-mu text-sm">Qué tan arriba terminaste en cada competencia (100 = primero).</p>
                </div>
                {trend !== null && (
                  <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold', trend >= 0 ? 'bg-gr/15 text-gr' : 'bg-rd/15 text-rd')}>
                    {trend >= 0 ? <TrendUp size={14} weight="bold" /> : <TrendDown size={14} weight="bold" />}{trend >= 0 ? '+' : ''}{trend}
                  </span>
                )}
              </div>
              <ProgressChart series={series} />
            </Card>
          </Reveal>
        )}

        {upcoming.length > 0 && (
          <section>
            <h2 className="text-[13px] text-mu font-medium px-1 mb-2">Próximas</h2>
            <ul className="flex flex-col gap-2 stagger">
              {upcoming.map(e => <EntryRow key={e.id} e={e} />)}
            </ul>
          </section>
        )}

        <section>
          <h2 className="text-[13px] text-mu font-medium px-1 mb-2">Historial</h2>
          {past.length === 0 ? (
            <Card className="text-center py-10 flex flex-col items-center gap-3">
              <span className="size-14 rounded-2xl bg-rd/15 text-rd grid place-items-center"><Trophy size={26} weight="duotone" /></span>
              <div className="font-semibold">Aún no tienes competencias registradas</div>
              <p className="text-mu text-sm max-w-xs">Agrega una desde el calendario, inscríbete y después anota tu marca y tu puesto.</p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2 stagger">
              {past.map(e => <EntryRow key={e.id} e={e} expanded />)}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

function Stat({ label, value, tone, prefix = '' }: { label: string; value: number | null; tone?: string; prefix?: string }) {
  return (
    <Card padding={false} className="p-4">
      <div className={cn('font-display text-3xl font-bold tabular-nums leading-none tracking-tight', tone)}>
        {value === null ? '—' : <>{prefix}<AnimatedNumber value={value} /></>}
      </div>
      <div className="text-xs text-mu mt-1.5">{label}</div>
    </Card>
  )
}

function EntryRow({ e, expanded }: { e: CompEntry; expanded?: boolean }) {
  return (
    <li>
      <Link href={`/calendar/event/${e.id}`} className="tap-card block p-4 rounded-[20px] bg-p hover:bg-p2">
        <div className="flex items-center gap-3">
          <span className={cn('size-12 rounded-2xl grid place-items-center flex-shrink-0',
            e.place && e.place <= 3 ? 'bg-ac/15 text-ac' : 'bg-p2 text-mu')}>
            {e.place ? <span className="font-display font-bold text-lg">#{e.place}</span> : <Medal size={22} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold truncate">{e.name}</span>
            <span className="block text-mu text-xs truncate">
              {formatDateOnly(e.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {EVENT_KIND_LABEL[e.kind] ?? 'Evento'} · {e.division.toUpperCase()}
              {e.place && e.field ? ` · ${e.place} de ${e.field}` : ''}
            </span>
          </span>
          <CaretRight size={16} className="text-fa" />
        </div>
        {expanded && e.workouts.some(w => w.value) && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none mt-3 -mx-1 px-1">
            {e.workouts.filter(w => w.value).map((w, i) => (
              <span key={i} className="flex-shrink-0 px-3 py-2 rounded-xl bg-p2 text-xs">
                <span className="block text-mu truncate max-w-[120px]">{w.title}</span>
                <span className="block font-display font-bold text-sm">{w.value}{w.place ? <span className="text-mu font-normal"> · #{w.place}</span> : null}</span>
              </span>
            ))}
          </div>
        )}
      </Link>
    </li>
  )
}

function ProgressChart({ series }: { series: { date: string; name: string; pct: number }[] }) {
  const W = 320, H = 140, P = 14
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, series.length - 1)
  const y = (v: number) => H - P - (v / 100) * (H - 2 * P)
  const d = series.map((s, i) => `${i ? 'L' : 'M'}${x(i)},${y(s.pct)}`).join(' ')
  const area = `${d} L${x(series.length - 1)},${H - P} L${x(0)},${H - P} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-3" role="img" aria-label="Progreso entre competencias">
      <defs>
        <linearGradient id="cmp-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" className="[stop-color:rgb(var(--c-ac))]" stopOpacity="0.35" />
          <stop offset="1" className="[stop-color:rgb(var(--c-ac))]" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[25, 50, 75].map(v => <line key={v} x1={P} x2={W - P} y1={y(v)} y2={y(v)} className="stroke-t/10" strokeDasharray="3 4" />)}
      <motion.path d={area} fill="url(#cmp-fill)" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }} />
      <motion.path d={d} fill="none" className="stroke-ac" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.1, ease: EASE_OUT }} />
      {series.map((s, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(s.pct)} r="5" className="fill-p stroke-ac" strokeWidth="3" />
          <text x={x(i)} y={y(s.pct) - 10} textAnchor="middle" className="fill-t text-[10px] font-bold">{s.pct}</text>
        </g>
      ))}
    </svg>
  )
}
