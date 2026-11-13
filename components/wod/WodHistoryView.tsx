'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Flame, Medal, Users } from '@/components/ui/icons'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { WOD_TYPE_META } from '@/lib/utils/wod-types'
import { formatDateOnly } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'
import type { Profile } from '@/lib/types/database'

export interface HistoryEntry {
  id: string
  date: string
  title: string
  type: string
  durationMins: number | null
  boxName: string | null
  movementCount: number
  athletes: number
  result: { value: string; level: string; place: number } | null
  isToday: boolean
}

type Filter = 'all' | 'done' | 'missed'

export function WodHistoryView({ profile, entries, hasBox }: { profile: Profile; entries: HistoryEntry[]; hasBox: boolean }) {
  const [filter, setFilter] = useState<Filter>('all')

  const done = entries.filter(e => e.result)
  const podiums = done.filter(e => e.result && e.result.place <= 3).length
  const attendance = entries.length ? Math.round((done.length / entries.length) * 100) : 0

  const shown = useMemo(() => entries.filter(e =>
    filter === 'all' ? true : filter === 'done' ? !!e.result : !e.result && !e.isToday,
  ), [entries, filter])

  // Group by month for scannable headers.
  const groups = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>()
    for (const e of shown) {
      const key = e.date.slice(0, 7)
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return Array.from(map.entries())
  }, [shown])

  return (
    <>
      <Topbar title="Historial" profile={profile} />
      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-2xl w-full">
        {!hasBox || entries.length === 0 ? (
          <Card className="text-center py-14 flex flex-col items-center gap-3">
            <div className="size-14 rounded-2xl bg-p2 grid place-items-center text-mu">
              <CalendarDays size={26} aria-hidden />
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight">Aún no hay historial</h2>
            <p className="text-mu text-sm max-w-xs text-pretty">
              {hasBox
                ? 'Cuando tu coach publique WODs y registres tus resultados, verás aquí tus últimos 60 días.'
                : 'Únete a un box con el código de tu coach para empezar a sumar WODs.'}
            </p>
            <Link href={hasBox ? '/wod' : '/settings'}
              className="mt-2 h-11 px-5 rounded-full bg-ac text-onac font-bold text-sm grid place-items-center active:scale-[0.96] transition-transform">
              {hasBox ? 'Ver WOD de hoy' : 'Ingresar código de box'}
            </Link>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 stagger">
              <Stat icon={Flame} label="WODs hechos" value={String(done.length)} sub={`de ${entries.length}`} />
              <Stat icon={CalendarDays} label="Asistencia" value={`${attendance}%`} sub="60 días" />
              <Stat icon={Medal} label="Podios" value={String(podiums)} sub="top 3" />
            </div>

            <div role="tablist" aria-label="Filtrar" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-p2">
              {([['all', 'Todos'], ['done', 'Hechos'], ['missed', 'Pendientes']] as [Filter, string][]).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                  className={cn('min-h-10 rounded-xl text-sm font-bold transition-colors', filter === k ? 'bg-p3 text-t' : 'text-mu hover:text-t')}>
                  {label}
                </button>
              ))}
            </div>

            {groups.length === 0 && (
              <p className="text-center text-mu text-sm py-8">Nada por aquí con este filtro.</p>
            )}

            {groups.map(([month, list]) => (
              <section key={month} className="flex flex-col gap-2">
                <h2 className="text-xs text-mu font-semibold px-1 pt-2">
                  {formatDateOnly(`${month}-01`, { month: 'long', year: 'numeric' })}
                </h2>
                <ol className="flex flex-col gap-2 stagger">
                  {list.map(e => <Row key={e.id} e={e} />)}
                </ol>
              </section>
            ))}
          </>
        )}
      </div>
    </>
  )
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Flame; label: string; value: string; sub: string }) {
  return (
    <Card padding={false} className="p-4">
      <Icon size={16} className="text-ac mb-2" aria-hidden />
      <div className="font-display text-3xl font-bold tabular-nums leading-none tracking-tight">{value}</div>
      <div className="text-[12px] text-mu mt-1.5 leading-tight whitespace-nowrap">{label}</div>
      <div className="text-[11px] text-fa leading-tight whitespace-nowrap">{sub}</div>
    </Card>
  )
}

function Row({ e }: { e: HistoryEntry }) {
  const meta = WOD_TYPE_META[e.type]
  const day = formatDateOnly(e.date, { weekday: 'short' }).replace('.', '')
  const num = formatDateOnly(e.date, { day: 'numeric' })
  const medal = e.result && e.result.place <= 3 ? ['text-ac', 'text-t', 'text-or'][e.result.place - 1] : null

  const body = (
    <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-p">
      <div className={cn('w-12 flex-shrink-0 text-center rounded-xl py-1.5', e.isToday ? 'bg-ac text-onac' : 'bg-p2')}>
        <div className={cn('text-[10px] uppercase font-bold', e.isToday ? '' : 'text-mu')}>{e.isToday ? 'Hoy' : day}</div>
        <div className="font-display text-xl font-bold leading-none tabular-nums tracking-tight">{num}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          {meta && <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase', meta.cls)}>{meta.label}</span>}
          <span className="text-fa text-[11px] flex items-center gap-1 tabular-nums"><Users size={11} aria-hidden />{e.athletes}</span>
        </div>
        <div className="font-semibold text-sm truncate">{e.title}</div>
      </div>
      {e.result ? (
        <div className="text-right flex-shrink-0">
          <div className="font-display text-xl font-bold tabular-nums leading-none tracking-tight">{e.result.value}</div>
          <div className="text-[11px] text-mu mt-1 flex items-center justify-end gap-1">
            {medal && <Medal size={12} className={medal} aria-label="Podio" />}
            #{e.result.place} · {e.result.level.toUpperCase()}
          </div>
        </div>
      ) : (
        <span className={cn('text-xs font-semibold flex-shrink-0', e.isToday ? 'text-ac' : 'text-fa')}>
          {e.isToday ? 'Registrar' : 'Sin registro'}
        </span>
      )}
    </div>
  )

  return <li>{e.isToday ? <Link href="/wod" className="block tap-card rounded-2xl">{body}</Link> : body}</li>
}
