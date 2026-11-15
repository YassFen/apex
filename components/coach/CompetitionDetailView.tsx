'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Avatar, Chips, Empty } from '@/components/manage/ui'
import { Trophy, Pencil } from '@/components/ui/icons'
import { EVENT_KIND_LABEL, type EventKind } from '@/lib/utils/readiness'
import { rankResults, nativeResultType } from '@/lib/utils/wod-ranking'
import { formatDateOnly } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'
import type { Profile } from '@/lib/types/database'

export interface CompDetail {
  id: string; boxId: string; name: string; kind: EventKind; startsOn: string; endsOn: string; location: string | null
  workouts: { id: string; title: string; type: string }[]
  athletes: { id: string; name: string; avatar: string | null; category: string; division: string; finalPlace: number | null; fieldSize: number | null }[]
  results: { workoutId: string; userId: string; value: string; place: number | null }[]
}

const PODIUM = ['bg-ac text-onac', 'bg-t/15 text-t', 'bg-or/20 text-or']
const DIVISION: Record<string, string> = { rx: 'Rx', scaled: 'Scaled', masters: 'Masters', teens: 'Teens' }

function Place({ n }: { n: number | null }) {
  return (
    <span className={cn('size-7 flex-shrink-0 rounded-full grid place-items-center font-display text-base font-bold tabular-nums tracking-tight',
      n !== null && n <= 3 ? PODIUM[n - 1] : 'text-fa')}>{n ?? '–'}</span>
  )
}

export function CompetitionDetailView({ profile, event }: { profile: Profile; event: CompDetail }) {
  const [view, setView] = useState<string>('general')
  const [division, setDivision] = useState<string>('all')

  const divisions = useMemo(() => [...new Set(event.athletes.map(a => a.division))], [event.athletes])
  const athletes = useMemo(() => event.athletes.filter(a => division === 'all' || a.division === division), [event.athletes, division])
  const byId = useMemo(() => new Map(event.athletes.map(a => [a.id, a])), [event.athletes])

  // General: final place first, then the sum of the places in each workout (lower is better).
  const general = useMemo(() => {
    const rows = athletes.map(a => {
      const places = event.results.filter(r => r.userId === a.id && r.place !== null).map(r => r.place as number)
      return { a, sum: places.length ? places.reduce((s, n) => s + n, 0) : null, played: places.length }
    })
    return rows.sort((x, y) => {
      if ((x.a.finalPlace !== null) !== (y.a.finalPlace !== null)) return x.a.finalPlace !== null ? -1 : 1
      if (x.a.finalPlace !== null && y.a.finalPlace !== null && x.a.finalPlace !== y.a.finalPlace) return x.a.finalPlace - y.a.finalPlace
      if ((x.sum !== null) !== (y.sum !== null)) return x.sum !== null ? -1 : 1
      if (x.sum !== null && y.sum !== null && x.sum !== y.sum) return x.sum - y.sum
      return x.a.name.localeCompare(y.a.name, 'es')
    })
  }, [athletes, event.results])

  const workout = event.workouts.find(w => w.id === view) ?? null
  const perWorkout = useMemo(() => {
    if (!workout) return []
    const rows = event.results.filter(r => r.workoutId === workout.id && byId.has(r.userId) && athletes.some(a => a.id === r.userId))
    // Ordered by the saved place; without one, by the result itself.
    const ranked = rankResults(rows.map(r => ({ ...r, result_type: nativeResultType(workout.type), result_value: r.value, rx_level: 'rx' })))
    return ranked.sort((x, y) => (x.place ?? 9999) - (y.place ?? 9999))
  }, [workout, event.results, byId, athletes])

  const chipOptions = [{ key: 'general', label: 'General' }, ...event.workouts.map((w, i) => ({ key: w.id, label: `${i + 1}. ${w.title}` }))]

  return (
    <>
      <Topbar title="Competencia" profile={profile} backHref="/coach/competitions" actions={
        <Link href={`/calendar/event/${event.id}`} aria-label="Editar competencia"
          className="size-10 grid place-items-center rounded-full text-t hover:bg-p2"><Pencil size={20} aria-hidden /></Link>
      } />
      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-2xl w-full mx-auto">
        <Card>
          <div className="text-xs font-semibold text-mu">{EVENT_KIND_LABEL[event.kind] ?? 'Evento'}</div>
          <h2 className="font-display text-[28px] leading-tight font-bold tracking-tight text-balance break-words mt-0.5">{event.name}</h2>
          <p className="text-mu text-sm mt-1">
            {formatDateOnly(event.startsOn, { day: 'numeric', month: 'long', year: 'numeric' })}
            {event.endsOn !== event.startsOn ? ` – ${formatDateOnly(event.endsOn, { day: 'numeric', month: 'long' })}` : ''}
            {event.location ? ` · ${event.location}` : ''}
          </p>
          <Link href={`/calendar/event/${event.id}`} className="mt-3 h-10 px-4 rounded-full bg-p2 text-t text-sm font-bold inline-flex items-center gap-2 hover:bg-p3">
            <Pencil size={14} aria-hidden /> Editar evento
          </Link>
        </Card>

        {event.athletes.length === 0 ? (
          <Empty icon={<Trophy size={28} aria-hidden />} title="Nadie se ha inscrito" body="Cuando tus atletas se inscriban y registren resultados, verás el ranking aquí." />
        ) : (
          <>
            {divisions.length > 1 && (
              <Chips label="División" value={division} onChange={setDivision}
                options={[{ key: 'all', label: 'Todas' }, ...divisions.map(d => ({ key: d, label: DIVISION[d] ?? d }))]} />
            )}
            {event.workouts.length > 0 && <Chips label="Prueba" value={view} onChange={setView} options={chipOptions} />}

            {view === 'general' || !workout ? (
              <Card padding={false}>
                <div className="px-5 pt-5 pb-3 flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-lg font-bold tracking-tight">Ranking general</h3>
                  <span className="text-mu text-xs tabular-nums">{general.length} {general.length === 1 ? 'atleta' : 'atletas'}</span>
                </div>
                <ol className="px-2 pb-2">
                  {general.map(({ a, sum, played }, i) => (
                    <li key={a.id} className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl">
                      <Place n={a.finalPlace ?? (sum !== null ? i + 1 : null)} />
                      <Avatar name={a.name} src={a.avatar} size={32} />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm font-semibold">{a.name}</span>
                        <span className="block text-xs text-mu">{DIVISION[a.division] ?? a.division} · {a.category === 'f' ? 'Mujeres' : 'Hombres'}</span>
                      </span>
                      <span className="text-right flex-shrink-0">
                        {a.finalPlace !== null && (
                          <span className="block font-display text-lg font-bold tabular-nums leading-none tracking-tight">
                            #{a.finalPlace}{a.fieldSize ? <span className="text-mu text-xs font-sans font-normal"> de {a.fieldSize}</span> : null}
                          </span>
                        )}
                        <span className="block text-xs text-mu tabular-nums mt-0.5">
                          {sum !== null ? `Suma ${sum} · ${played} ${played === 1 ? 'prueba' : 'pruebas'}` : 'Sin resultados'}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
            ) : (
              <Card padding={false}>
                <div className="px-5 pt-5 pb-3 flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-lg font-bold tracking-tight break-words min-w-0">{workout.title}</h3>
                  <span className="text-mu text-xs tabular-nums flex-shrink-0">{perWorkout.length} {perWorkout.length === 1 ? 'resultado' : 'resultados'}</span>
                </div>
                {perWorkout.length === 0 ? (
                  <p className="px-5 pb-5 text-mu text-sm">Nadie ha registrado esta prueba todavía.</p>
                ) : (
                  <ol className="px-2 pb-2">
                    {perWorkout.map(r => {
                      const a = byId.get(r.userId)
                      return (
                        <li key={r.userId} className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl">
                          <Place n={r.place} />
                          <Avatar name={a?.name ?? 'Atleta'} src={a?.avatar} size={32} />
                          <span className="flex-1 min-w-0 truncate text-sm font-semibold">{a?.name ?? 'Atleta'}</span>
                          <span className="font-display text-lg font-bold tabular-nums tracking-tight flex-shrink-0">{r.result_value}</span>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </Card>
            )}
          </>
        )}
      </div>
    </>
  )
}
