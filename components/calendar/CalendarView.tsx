'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import {
  ChevronLeft, ChevronRight, Plus, Trophy, Lock, MapPin, CheckCircle2, ArrowRight, CalendarPlus, Eye, EyeOff, Flame, Users, Clock,
} from '@/components/ui/icons'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Reveal, SPRING, EASE_OUT, Segmented } from '@/components/ui/motion'
import { BoxFilter, boxTone, useBoxFilter } from '@/components/calendar/BoxFilter'
import { WOD_TYPE_META } from '@/lib/utils/wod-types'
import { EVENT_KIND_LABEL, type EventKind } from '@/lib/utils/readiness'
import { addDaysISO, daysBetween, formatDateOnly, relativeDayLabel } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'
import type { Profile } from '@/lib/types/database'

export interface CalBox { id: string; name: string; logo: string | null; isCoach: boolean }
export interface CalWod {
  id: string; boxId: string; date: string; title: string; type: string; description: string
  duration: number | null; movements: any[]; isLive: boolean; showEarly: boolean; myResult: string | null
  classTime: string | null
}
export interface CalEvent {
  id: string; boxId: string | null; name: string; kind: EventKind; startsOn: string; endsOn: string
  location: string | null; workouts: number; going: boolean; participants: number; mine: boolean
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
const TYPE_BAR: Record<string, string> = { fortime: 'bg-or', amrap: 'bg-ac', emom: 'bg-bl', tabata: 'bg-pu', strength: 'bg-gr' }
const PROGRAM_AHEAD = 13

function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

/** Monday-first grid of whole weeks covering the month. */
function monthGrid(month: string): string[] {
  const first = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7
  return Array.from({ length: cells }, (_, i) => addDaysISO(first, i - offset))
}

export function CalendarView({ profile, today, month: initialMonth, range, boxes, wods, hiddenDays, events, eventsMissing }: {
  profile: Profile; today: string; month: string; range: { from: string; to: string }
  boxes: CalBox[]; wods: CalWod[]; hiddenDays: { boxId: string; date: string }[]; events: CalEvent[]; eventsMissing: boolean
}) {
  const router = useRouter()
  const [month, setMonth] = useState(initialMonth)
  const [dir, setDir] = useState(0)
  const [selected, setSelected] = useState(initialMonth === today.slice(0, 7) ? today : `${initialMonth}-01`)
  const [boxFilter, setBoxFilter] = useBoxFilter(boxes.map(b => b.id))
  const [view, setView] = useState<'month' | 'week'>('week')
  const multiBox = boxes.length > 1
  const coachBoxes = boxes.filter(b => b.isCoach)

  const inBox = (boxId: string | null) => boxFilter === 'all' || boxId === null || boxId === boxFilter
  const fWods = wods.filter(w => inBox(w.boxId))
  const fHidden = hiddenDays.filter(h => inBox(h.boxId))
  const fEvents = events.filter(e => inBox(e.boxId))

  const byDay = useMemo(() => {
    const map = new Map<string, { wods: CalWod[]; hidden: string[]; events: CalEvent[] }>()
    const get = (d: string) => {
      if (!map.has(d)) map.set(d, { wods: [], hidden: [], events: [] })
      return map.get(d)!
    }
    for (const w of [...fWods].sort((a, b) => (a.classTime ?? '').localeCompare(b.classTime ?? ''))) get(w.date).wods.push(w)
    for (const h of fHidden) get(h.date).hidden.push(h.boxId)
    for (const e of fEvents) {
      for (let d = e.startsOn, i = 0; d <= e.endsOn && i < 14; d = addDaysISO(d, 1), i++) get(d).events.push(e)
    }
    return map
  }, [fWods, fHidden, fEvents])

  function go(n: number) {
    const next = shiftMonth(month, n)
    // Outside the loaded window: ask the server for that month.
    if (`${next}-01` < range.from || `${next}-01` > range.to) {
      router.push(`/calendar?m=${next}`, { scroll: false })
      return
    }
    setDir(n)
    setMonth(next)
    setSelected(next === today.slice(0, 7) ? today : `${next}-01`)
  }

  function goToday() {
    if (today < range.from || today > range.to) { router.push('/calendar', { scroll: false }); return }
    setDir(today.slice(0, 7) > month ? 1 : -1)
    setMonth(today.slice(0, 7))
    setSelected(today)
  }

  const grid = monthGrid(month)
  const [y, m] = month.split('-').map(Number)
  const nextEvent = fEvents.find(e => e.endsOn >= today && (e.going || e.mine || e.boxId))
  const upcomingEvents = fEvents.filter(e => e.endsOn >= today).slice(0, 6)
  const day = byDay.get(selected) ?? { wods: [], hidden: [], events: [] }

  return (
    <>
      <Topbar title="Calendario" profile={profile} actions={
        !eventsMissing && (
          <Link href="/calendar/event/new" aria-label="Agregar competencia o evento"
            className="inline-flex items-center gap-1.5 h-10 px-3 sm:px-4 rounded-full bg-ac text-onac text-sm font-bold hover:bg-ac/90 transition active:scale-95">
            <Plus size={16} aria-hidden /><span className="hidden sm:inline">Evento</span>
          </Link>
        )
      } />

      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-5xl w-full mx-auto">
        <BoxFilter boxes={boxes} value={boxFilter} onChange={setBoxFilter} />
        <Segmented id="cal-view" className="lg:max-w-xs" value={view} onChange={setView} options={[['week', 'Semana'], ['month', 'Mes']] as const} />

        {nextEvent && <NextEventHero event={nextEvent} today={today} />}

        <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 items-start">
          {view === 'week' ? (
            <WeekStrip selected={selected} today={today} byDay={byDay} onSelect={d => { setSelected(d); if (d.slice(0, 7) !== month) setMonth(d.slice(0, 7)) }}
              onShift={n => {
                const d = addDaysISO(selected, n * 7)
                if (d < range.from || d > range.to) { router.push(`/calendar?m=${d.slice(0, 7)}`, { scroll: false }); return }
                setSelected(d); setMonth(d.slice(0, 7))
              }} />
          ) : (
          /* ── Month ─────────────────────────────── */
          <Card padding={false} className="p-3 sm:p-4 overflow-hidden">
            <div className="flex items-center justify-between gap-2 mb-3 px-1">
              <h2 className="font-display text-2xl font-bold tracking-tight" aria-live="polite">
                {MONTHS[m - 1]} <span className="text-mu">{y}</span>
              </h2>
              <div className="flex items-center gap-1">
                {month !== today.slice(0, 7) && (
                  <button type="button" onClick={goToday} className="h-9 px-3 rounded-full bg-p2 text-xs font-bold hover:bg-p3 transition-colors">Hoy</button>
                )}
                <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={() => go(-1)} aria-label="Mes anterior"
                  className="size-9 rounded-full grid place-items-center hover:bg-p2"><ChevronLeft size={18} aria-hidden /></motion.button>
                <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={() => go(1)} aria-label="Mes siguiente"
                  className="size-9 rounded-full grid place-items-center hover:bg-p2"><ChevronRight size={18} aria-hidden /></motion.button>
              </div>
            </div>

            <div className="grid grid-cols-7 mb-1" aria-hidden>
              {WEEKDAYS.map((d, i) => <div key={i} className="text-center text-xs font-semibold text-mu py-1">{d}</div>)}
            </div>

            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.div
                key={month}
                custom={dir}
                variants={{
                  enter: (d: number) => ({ opacity: 0, x: d * 48 }),
                  center: { opacity: 1, x: 0 },
                  exit: (d: number) => ({ opacity: 0, x: d * -48 }),
                }}
                initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.32, ease: EASE_OUT }}
                drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18}
                onDragEnd={(_, info) => { if (info.offset.x < -60) go(1); else if (info.offset.x > 60) go(-1) }}
                role="grid" aria-label={`${MONTHS[m - 1]} ${y}`}
                className="grid grid-cols-7 gap-1 touch-pan-y"
              >
                {grid.map(d => {
                  const items = byDay.get(d)
                  const outside = d.slice(0, 7) !== month
                  const isToday = d === today
                  const isSel = d === selected
                  const bars = [
                    ...(items?.events ?? []).map(() => 'bg-rd'),
                    ...(items?.wods ?? []).map(w => w.isLive ? (TYPE_BAR[w.type] ?? 'bg-mu') : 'bg-fa'),
                    ...(items?.hidden ?? []).map(() => 'bg-fa/60'),
                  ].slice(0, 3)
                  const doneDay = items?.wods.some(w => w.myResult)
                  return (
                    <button key={d} type="button" role="gridcell" aria-selected={isSel} onClick={() => setSelected(d)}
                      aria-label={`${formatDateOnly(d, { weekday: 'long', day: 'numeric', month: 'long' })}${items ? `: ${items.events.length ? `${items.events.length} evento` : ''}${items.wods.length ? ` ${items.wods.length} WOD` : ''}` : ''}`}
                      className={cn('relative isolate h-[58px] sm:h-16 lg:h-[72px] rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors',
                        outside ? 'text-fa/60' : 'text-t', !isSel && 'hover:bg-p2')}>
                      {isSel && <motion.span layoutId="cal-selected" transition={SPRING} className="absolute inset-0 -z-10 rounded-2xl bg-p2 ring-1 ring-inset ring-t/25" aria-hidden />}
                      <span className={cn('size-8 grid place-items-center rounded-full font-display text-[15px] font-semibold tabular-nums',
                        isToday && 'bg-ac text-onac font-bold')}>
                        {Number(d.slice(8))}
                      </span>
                      <span className="flex gap-0.5 items-center h-1.5">
                        {bars.map((c, i) => <span key={i} className={cn('h-1.5 w-1.5 sm:w-2.5 rounded-full', c)} />)}
                      </span>
                      {doneDay && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-gr" aria-hidden />}
                    </button>
                  )
                })}
              </motion.div>
            </AnimatePresence>

            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-xs text-mu">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ac" />WOD</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-rd" />Evento</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-gr" />Hecho</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-fa/60" />Por revelar</span>
            </div>
          </Card>
          )}

          {/* ── Selected day ──────────────────────── */}
          <div className="flex flex-col gap-3 lg:sticky lg:top-[76px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={selected}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15, ease: EASE_OUT }}
                className="flex flex-col gap-3">
                <div className="text-center py-1">
                  <div className="text-xs text-mu font-semibold">{relativeDayLabel(selected, today)}</div>
                  <h2 className="font-display text-[26px] leading-tight font-bold first-letter:uppercase tracking-tight">
                    {formatDateOnly(selected, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h2>
                </div>

                <ol className="flex flex-col">
                  {day.events.map(e => (
                    <TimelineRow key={e.id} time={null} tone="bg-rd"><EventRow event={e} today={today} /></TimelineRow>
                  ))}
                  {day.wods.map(w => (
                    <TimelineRow key={w.id} time={w.classTime} done={!!w.myResult} tone={w.isLive ? (TYPE_BAR[w.type] ?? 'bg-mu') : 'bg-fa'}>
                      <WodCard wod={w} today={today}
                        boxName={multiBox ? boxes.find(b => b.id === w.boxId)?.name : undefined}
                        tone={boxTone(boxes, w.boxId)}
                        canEdit={!!boxes.find(b => b.id === w.boxId)?.isCoach && w.date >= today && daysBetween(today, w.date) <= PROGRAM_AHEAD} />
                    </TimelineRow>
                  ))}
                  {day.hidden.map(boxId => (
                    <TimelineRow key={boxId} time={null} tone="bg-fa/60">
                      <div className="flex items-center gap-3 p-4 rounded-[20px] bg-p">
                        <span className="size-10 rounded-xl bg-p2 grid place-items-center text-mu"><Lock size={18} aria-hidden /></span>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm">WOD programado</div>
                          <div className="text-mu text-xs">{multiBox ? `${boxes.find(b => b.id === boxId)?.name} · ` : ''}Tu coach lo revela ese día.</div>
                        </div>
                      </div>
                    </TimelineRow>
                  ))}
                </ol>

                {!day.events.length && !day.wods.length && !day.hidden.length && (
                  <EmptyDay date={selected} today={today} coachBoxes={coachBoxes} eventsMissing={eventsMissing} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* ── Upcoming events ─────────────────────── */}
        {eventsMissing ? (
          <p className="text-mu text-xs px-1">Las competencias se activan al aplicar la migración <code>006_calendar_events.sql</code> en Supabase.</p>
        ) : (
          <Reveal>
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="font-display text-xl font-bold tracking-tight">Próximos eventos</h2>
              <Link href="/calendar/event/new" className="text-ac text-sm font-bold flex items-center gap-1">Agregar <Plus size={14} aria-hidden /></Link>
            </div>
            {upcomingEvents.length === 0 ? (
              <Card className="flex items-center gap-4">
                <span className="size-12 rounded-2xl bg-rd/15 text-rd grid place-items-center flex-shrink-0"><Trophy size={22} aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm">¿Tienes una competencia?</div>
                  <div className="text-mu text-xs text-pretty">Agrégala con sus workouts y te decimos qué tan preparado vas, con tus propios récords.</div>
                </div>
              </Card>
            ) : (
              <ul className="grid sm:grid-cols-2 gap-2 stagger">
                {upcomingEvents.map(e => <li key={e.id}><EventRow event={e} today={today} /></li>)}
              </ul>
            )}
          </Reveal>
        )}
      </div>
    </>
  )
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function NextEventHero({ event, today }: { event: CalEvent; today: string }) {
  const days = daysBetween(today, event.startsOn)
  const live = days <= 0
  return (
    <Link href={`/calendar/event/${event.id}`} className="block group">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: EASE_OUT }}
        whileTap={{ scale: 0.985 }}
        className="relative overflow-hidden rounded-[28px] bg-p p-1.5 ring-1 ring-t/[.05]">
        <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-rd/20 via-p2 to-p2 p-5 flex items-center gap-4">
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-[radial-gradient(closest-side,rgb(var(--c-rd)/0.25),transparent)]" aria-hidden />
          <div className="relative text-center flex-shrink-0 w-20">
            <div className="font-display text-6xl font-bold leading-none tabular-nums tracking-tight">{live ? '¡Ya!' : days}</div>
            <div className="text-xs text-mu font-semibold mt-1">{live ? 'En curso' : days === 1 ? 'día' : 'días'}</div>
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rd/15 text-rd text-xs font-semibold ">
              <Trophy size={12} aria-hidden /> {EVENT_KIND_LABEL[event.kind] ?? 'Evento'}
            </div>
            <div className="font-display text-lg font-bold leading-tight mt-1.5 tracking-tight text-balance break-words">{event.name}</div>
            <div className="text-mu text-xs mt-0.5 first-letter:uppercase">
              {formatDateOnly(event.startsOn, { weekday: 'long', day: 'numeric', month: 'long' })}{event.location && <span className="block normal-case">{event.location}</span>}
            </div>
          </div>
          <span className="relative size-10 rounded-full bg-t/10 grid place-items-center flex-shrink-0 transition-transform duration-300 group-hover:translate-x-1">
            <ArrowRight size={18} aria-hidden />
          </span>
        </div>
      </motion.div>
    </Link>
  )
}

function EventRow({ event, today }: { event: CalEvent; today: string }) {
  const days = daysBetween(today, event.startsOn)
  const multi = event.endsOn !== event.startsOn
  return (
    <Link href={`/calendar/event/${event.id}`}
      className="tap-card flex items-center gap-3 p-3.5 rounded-2xl bg-p hover:bg-p2">
      <span className="w-12 flex-shrink-0 text-center rounded-xl bg-rd/15 text-rd py-1.5">
        <span className="block text-[10px] font-bold uppercase">{formatDateOnly(event.startsOn, { month: 'short' }).replace('.', '')}</span>
        <span className="block font-display text-2xl font-bold leading-none tracking-tight">{Number(event.startsOn.slice(8))}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-sm leading-tight break-words">{event.name}</span>
        <span className="flex items-center gap-2 text-mu text-xs mt-0.5">
          <span className="truncate">{EVENT_KIND_LABEL[event.kind] ?? 'Evento'}{multi ? ` · hasta el ${Number(event.endsOn.slice(8))}` : ''}</span>
          {event.location && <span className="hidden sm:flex items-center gap-0.5 truncate"><MapPin size={11} aria-hidden />{event.location}</span>}
        </span>
        <span className="flex items-center gap-2 mt-1">
          {event.going && <span className="px-1.5 py-0.5 rounded-full bg-ac/15 text-ac text-[10px] font-bold uppercase">Vas</span>}
          {event.boxId && event.participants > 0 && <span className="flex items-center gap-1 text-[11px] text-mu"><Users size={11} aria-hidden />{event.participants}</span>}
          <span className="text-[11px] text-fa">{event.workouts} workout{event.workouts === 1 ? '' : 's'}</span>
        </span>
      </span>
      <span className="text-right flex-shrink-0">
        <span className="block font-display text-xl font-bold leading-none tabular-nums tracking-tight">{days > 0 ? days : days === 0 ? 'Hoy' : '—'}</span>
        {days > 0 && <span className="block text-[10px] text-mu">días</span>}
      </span>
    </Link>
  )
}

function WodCard({ wod, today, boxName, tone, canEdit }: { wod: CalWod; today: string; boxName?: string; tone: string; canEdit: boolean }) {
  const meta = WOD_TYPE_META[wod.type] ?? { label: wod.type, cls: 'text-mu bg-p3' }
  const isToday = wod.date === today
  const future = wod.date > today
  return (
    <Card padding={false} className={cn('p-4', isToday && wod.isLive && !wod.myResult && 'bg-gradient-to-br from-ac/20 via-p to-p ring-1 ring-inset ring-ac/25')}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {wod.classTime && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-t text-bg text-[11px] font-bold tabular-nums"><Clock size={12} weight="bold" aria-hidden />{wod.classTime}</span>}
        <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-bold uppercase', meta.cls)}>{meta.label}</span>
        {wod.duration ? <span className="text-mu text-xs">{wod.duration} min</span> : null}
        {boxName && <span className="flex items-center gap-1 text-xs text-mu"><span className={cn('size-2 rounded-full', tone)} />{boxName}</span>}
        {!wod.isLive && <span className="px-2 py-0.5 rounded-full bg-p3 text-mu text-[10px] font-bold uppercase">Oculto</span>}
        {canEdit && future && wod.isLive && (
          <span className="flex items-center gap-1 text-[11px] text-mu">
            {wod.showEarly ? <><Eye size={12} aria-hidden />Visible</> : <><EyeOff size={12} aria-hidden />Se revela ese día</>}
          </span>
        )}
      </div>
      <h3 className="font-display text-2xl font-bold leading-tight tracking-tight">{wod.title}</h3>
      {wod.movements.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {wod.movements.slice(0, 8).map((mv: any, i: number) => (
            <li key={i} className="flex items-baseline gap-2 text-sm">
              <span className="font-display font-bold text-ac tabular-nums min-w-[2.5rem] tracking-tight">{mv.reps}</span>
              <span className="min-w-0 break-words">{mv.name}</span>
              {mv.weight && <span className="text-mu text-xs ml-auto flex-shrink-0">{mv.weight}</span>}
            </li>
          ))}
        </ul>
      )}
      {!wod.movements.length && wod.description && <p className="text-mu text-sm mt-1.5 whitespace-pre-line line-clamp-4">{wod.description}</p>}

      <div className="flex items-center gap-2 mt-3">
        {wod.myResult && (
          <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-gr/15 text-gr text-xs font-bold">
            <CheckCircle2 size={14} aria-hidden /> {wod.myResult}
          </span>
        )}
        {isToday && wod.isLive && (
          <Link href="/wod" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-ac text-onac text-xs font-bold active:scale-95 transition-transform">
            <Flame size={14} aria-hidden /> {wod.myResult ? 'Ver ranking' : 'Ir al WOD'}
          </Link>
        )}
        {canEdit && (
          <Link href={isToday ? '/coach/publish-wod' : `/coach/publish-wod?date=${wod.date}`}
            className="inline-flex items-center h-9 px-4 rounded-full bg-p2 text-xs font-bold hover:bg-p3 ml-auto">Editar</Link>
        )}
      </div>
    </Card>
  )
}

function EmptyDay({ date, today, coachBoxes, eventsMissing }: { date: string; today: string; coachBoxes: CalBox[]; eventsMissing: boolean }) {
  const canProgram = coachBoxes.length > 0 && date >= today && daysBetween(today, date) <= PROGRAM_AHEAD
  return (
    <Card className="text-center py-8 flex flex-col items-center gap-3">
      <span className="size-12 rounded-2xl bg-p2 text-mu grid place-items-center"><CalendarPlus size={22} aria-hidden /></span>
      <div>
        <div className="font-bold text-sm">{date < today ? 'Sin actividad este día' : 'Nada programado'}</div>
        <div className="text-mu text-xs mt-0.5">{date < today ? 'Día de descanso.' : 'Un buen día para trabajar tus debilidades.'}</div>
      </div>
      <div className="flex gap-2 flex-wrap justify-center">
        {canProgram && (
          <Link href={date === today ? '/coach/publish-wod' : `/coach/publish-wod?date=${date}`}
            className="h-10 px-4 rounded-full bg-ac text-onac text-sm font-bold inline-flex items-center gap-1.5 active:scale-95 transition-transform">
            <Plus size={15} aria-hidden /> Programar WOD
          </Link>
        )}
        {!eventsMissing && date >= today && (
          <Link href={`/calendar/event/new?date=${date}`}
            className="h-10 px-4 rounded-full bg-p2 text-sm font-bold inline-flex items-center gap-1.5 hover:bg-p3">
            <Trophy size={15} aria-hidden /> Agregar evento
          </Link>
        )}
      </div>
    </Card>
  )
}

/* ── Timeline row: time on a rail, a dot per item, a line joining the day together ── */

function TimelineRow({ time, tone, done, children }: { time: string | null; tone: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="group grid grid-cols-[44px_minmax(0,1fr)] gap-2">
      <div className="flex flex-col items-center pt-4" aria-hidden={!time}>
        <span className="font-display text-[13px] font-bold tabular-nums leading-none whitespace-nowrap">{time ?? 'Día'}</span>
        <span className={cn('mt-2 size-2.5 rounded-full flex-shrink-0', done ? 'bg-gr' : tone)} />
        <span className="flex-1 w-px bg-t/10 mt-1.5 group-last:opacity-0" />
      </div>
      <div className="pb-3 min-w-0">{children}</div>
    </li>
  )
}

/* ── Week strip: seven days, the selected one in an outlined box, swipe to change week ── */

function WeekStrip({ selected, today, byDay, onSelect, onShift }: {
  selected: string; today: string
  byDay: Map<string, { wods: CalWod[]; hidden: string[]; events: CalEvent[] }>
  onSelect: (d: string) => void
  onShift: (weeks: number) => void
}) {
  const [y, m, d] = selected.split('-').map(Number)
  const offset = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
  const monday = addDaysISO(selected, -offset)
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i))
  const prevMonday = useRef(monday)
  const dir = monday > prevMonday.current ? 1 : monday < prevMonday.current ? -1 : 0
  useEffect(() => { prevMonday.current = monday }, [monday])

  const planned = days.filter(dd => { const it = byDay.get(dd); return !!it && (it.wods.length > 0 || it.hidden.length > 0) }).length
  const done = days.filter(dd => byDay.get(dd)?.wods.some(w => w.myResult)).length
  const hasToday = days.includes(today)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="font-display text-xl font-bold tracking-tight">
          {formatDateOnly(days[0], { day: 'numeric', month: 'short' })} – {formatDateOnly(days[6], { day: 'numeric', month: 'short' })}
        </h2>
        <div className="flex items-center gap-1">
          {!hasToday && <button type="button" onClick={() => onSelect(today)} className="h-9 px-3 rounded-full bg-p2 text-xs font-semibold hover:bg-p3 transition-colors">Hoy</button>}
          <button type="button" onClick={() => onShift(-1)} aria-label="Semana anterior"
            className="size-9 rounded-full grid place-items-center hover:bg-p2"><ChevronLeft size={18} aria-hidden /></button>
          <button type="button" onClick={() => onShift(1)} aria-label="Semana siguiente"
            className="size-9 rounded-full grid place-items-center hover:bg-p2"><ChevronRight size={18} aria-hidden /></button>
        </div>
      </div>

      <motion.div key={monday}
        initial={dir === 0 ? false : { opacity: 0, x: dir * 28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, ease: EASE_OUT }}
        drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18}
        onDragEnd={(_, info) => { if (info.offset.x < -50) onShift(1); else if (info.offset.x > 50) onShift(-1) }}
        role="tablist" aria-label="Días de la semana" className="grid grid-cols-7 gap-1 touch-pan-y">
        {days.map((dd, i) => {
          const it = byDay.get(dd)
          const sel = dd === selected
          const isToday = dd === today
          const bars = [
            ...(it?.events ?? []).map(() => 'bg-rd'),
            ...(it?.wods ?? []).map(w => w.myResult ? 'bg-gr' : w.isLive ? (TYPE_BAR[w.type] ?? 'bg-mu') : 'bg-fa'),
            ...(it?.hidden ?? []).map(() => 'bg-fa/60'),
          ].slice(0, 3)
          return (
            <button key={dd} type="button" role="tab" aria-selected={sel} onClick={() => onSelect(dd)}
              aria-label={formatDateOnly(dd, { weekday: 'long', day: 'numeric', month: 'long' })}
              className={cn('relative isolate flex flex-col items-center gap-1.5 pt-2.5 pb-2.5 rounded-[18px] transition-colors', sel ? 'text-t' : 'text-mu')}>
              {sel && <motion.span layoutId="week-selected" transition={SPRING} className="absolute inset-0 -z-10 rounded-[18px] bg-p ring-1 ring-inset ring-t/25" aria-hidden />}
              <span className="text-xs font-semibold leading-none">{WEEKDAYS[i]}</span>
              <span className={cn('font-display text-xl font-bold tabular-nums leading-none', isToday ? 'text-ac' : sel ? 'text-t' : 'text-t/80')}>{Number(dd.slice(8))}</span>
              <span className="flex gap-0.5 items-center h-1.5">
                {bars.map((c, k) => <span key={k} className={cn('size-1.5 rounded-full', c)} />)}
              </span>
            </button>
          )
        })}
      </motion.div>

      {/* How the week is going */}
      {planned > 0 && (
        <div className="flex items-center gap-3 px-1">
          <div className="flex-1 h-1.5 rounded-full bg-t/10 overflow-hidden">
            <div className="h-full rounded-full bg-ac transition-[width] duration-300 ease-out" style={{ width: `${Math.round((done / planned) * 100)}%` }} />
          </div>
          <span className="text-xs text-mu font-semibold tabular-nums whitespace-nowrap">{done} de {planned} entrenos</span>
        </div>
      )}
    </div>
  )
}
