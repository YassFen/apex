'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'motion/react'
import { WidgetBoard } from '@/components/home/WidgetBoard'
import { ChallengesWidget, type ChallengeSummary } from '@/components/challenges/ChallengesWidget'
import {
  Plus, Fire, Trophy, CaretRight, ClockCounterClockwise, Calculator, Check, Users, SlidersHorizontal,
  DotsSixVertical, Target, Barbell, PersonSimpleRun, ArrowCounterClockwise, X, Clock,
} from '@/components/ui/icons'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { PRModal } from '@/components/athlete/PRModal'
import { StrengthChart } from '@/components/athlete/StrengthChart'
import { RmCelebrationModal, type Celebration } from '@/components/athlete/RmCelebrationModal'
import { Topbar } from '@/components/layout/Topbar'
import { CountUp } from '@/components/ui/CountUp'
import { useToast } from '@/components/ui/Toast'
import { NextEventCard, type NextEvent } from '@/components/calendar/NextEventCard'
import { HeroRings } from '@/components/home/HeroRings'
import { GenerateWodSheet } from '@/components/home/GenerateWodSheet'
import { ActivityHeatmap } from '@/components/home/ActivityHeatmap'
import { LogSheet, type LogTab } from '@/components/training/LogSheet'
import { createClient } from '@/lib/supabase/client'
import { toDateInput, todayISO, formatDateOnly } from '@/lib/utils/dates'
import { WOD_TYPE_META } from '@/lib/utils/wod-types'
import { cn } from '@/lib/utils/cn'
import type { Hit } from '@/lib/utils/movement-guide'
import type { Profile, Movement } from '@/lib/types/database'

interface PR {
  id: string
  value_lb: number
  recorded_at: string
  movements: { name: string; category: string } | null
  metric: string
  is_pr: boolean
}

export type TodayWod = { title: string; type: string; durationMins: number | null; myResult: string | null; classTime?: string | null; count?: number }
export type GoalProgress = { id: string; movement: string; target: number; unit: string; period: string; done: number }

type WidgetId = 'hero' | 'today' | 'nextEvent' | 'goals' | 'week' | 'highlights' | 'strength' | 'heatmap' | 'records' | 'stats' | 'links' | 'challenges'

const WIDGETS: Record<WidgetId, { label: string; desc: string }> = {
  hero:       { label: 'Tu estado',            desc: 'Recuperación muscular, semana y preparación' },
  today:      { label: 'WOD de hoy',           desc: 'El WOD de tu box con su horario' },
  nextEvent:  { label: 'Próxima competencia',  desc: 'Cuenta regresiva y preparación' },
  challenges: { label: 'Retos',                desc: 'Retos del box en los que participas' },
  goals:      { label: 'Metas',                desc: 'Progreso de tus metas' },
  week:       { label: 'Esta semana',          desc: 'Días entrenados y racha' },
  highlights: { label: 'Tus tops',             desc: 'Hasta 4 ejercicios que eliges' },
  strength:   { label: 'Evolución de fuerza',  desc: 'Gráfico de tu 1RM en el tiempo' },
  heatmap:    { label: 'Constancia',           desc: 'Mapa de días entrenados' },
  records:    { label: 'Tus récords',          desc: 'Tus últimas mejores marcas' },
  stats:      { label: 'Números',              desc: 'Registros y récords vigentes' },
  links:      { label: 'Accesos rápidos',      desc: 'Historial, competencias, ejercicios, calculadora' },
}
const ORDER: WidgetId[] = ['hero', 'today', 'nextEvent', 'challenges', 'goals', 'week', 'highlights', 'strength', 'heatmap', 'records', 'stats', 'links']

const DEFAULT_KPI = ['Deadlift', 'Back Squat', 'Snatch', 'Clean & Jerk']
const KPI_STORAGE_KEY = 'apex.dashboard.kpis'

function formatPrValue(pr: PR, unit: 'kg' | 'lb'): { value: string; unit: string } {
  const metric = pr.metric ?? '1rm'
  const raw = pr.value_lb ?? 0
  if (metric === 'time') {
    const tot = Math.round(raw); const m = Math.floor(tot / 60); const s = tot % 60
    return { value: `${m}:${String(s).padStart(2, '0')}`, unit: 'min' }
  }
  if (metric === 'max_reps' && pr.movements?.category === 'cardio') return { value: String(Math.round(raw)), unit: 'cal' }
  if (metric === 'max_reps') return { value: String(Math.round(raw)), unit: 'reps' }
  if (unit === 'kg') return { value: String(Math.round(raw * 0.453592)), unit: 'kg' }
  return { value: String(Math.round(raw)), unit: 'lb' }
}

function computeStreakDays(days: Set<string>): number {
  if (days.size === 0) return 0
  const cursor = new Date()
  if (!days.has(toDateInput(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(toDateInput(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1) }
  return streak
}

export function AthleteDashboard({ profile, prs, movements = [], today = null, hasBox = false, resultDates = [], nextEvent = null, hits = [], goals = [], logDates = [], goalsMissing = false, challenges = null }: {
  profile: Profile; prs: PR[]; movements?: Movement[]; today?: TodayWod | null; hasBox?: boolean; resultDates?: string[]
  nextEvent?: NextEvent | null; hits?: Hit[]; goals?: GoalProgress[]; logDates?: string[]; goalsMissing?: boolean
  challenges?: ChallengeSummary[] | null
}) {
  const router = useRouter()
  const { fire } = useToast()
  const unit = profile.preferred_unit

  const [prModalOpen, setPrModalOpen] = useState(false)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [logTab, setLogTab] = useState<LogTab | null>(null)
  const [genOpen, setGenOpen] = useState(false)

  /* KPIs (Tus tops) */
  const [kpiMovements, setKpiMovements] = useState<string[]>(DEFAULT_KPI)
  const [kpiPicker, setKpiPicker] = useState(false)
  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(KPI_STORAGE_KEY) ?? 'null')
      if (Array.isArray(parsed) && parsed.length) setKpiMovements(parsed.slice(0, 4))
    } catch {}
  }, [])
  function saveKpis(next: string[]) {
    setKpiMovements(next)
    try { localStorage.setItem(KPI_STORAGE_KEY, JSON.stringify(next)) } catch {}
  }
  const kpiOptions = useMemo(() => [...new Set([
    ...prs.map(p => p.movements?.name).filter(Boolean) as string[],
    ...movements.filter(m => m.category === 'weightlifting' || m.category === 'olympic').map(m => m.name),
  ])].sort((a, b) => a.localeCompare(b, 'es')), [prs, movements])
  const kpiPRs = kpiMovements.map(name => {
    const sorted = prs.filter(p => p.movements?.name === name).sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    const best = sorted.find(p => p.is_pr) ?? sorted[0]
    const previous = sorted.filter(p => p.id !== best?.id).sort((a, b) => a.metric === 'time' ? a.value_lb - b.value_lb : b.value_lb - a.value_lb)[0]
    return { name, best, previous }
  })

  const topPRs = prs.filter(p => p.is_pr).slice(0, 5)
  const strengthMovements = useMemo(() => {
    const fromPrs = [...new Set(prs.filter(p => /^[123]rm$/.test(p.metric) && p.movements?.name).map(p => p.movements!.name))]
    return fromPrs.length ? fromPrs : DEFAULT_KPI
  }, [prs])
  const [selectedMovement, setSelectedMovement] = useState<string>(() => strengthMovements[0] ?? 'Deadlift')

  /* Activity */
  const dayCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of [...prs.map(p => p.recorded_at), ...resultDates].map(x => toDateInput(x))) m.set(d, (m.get(d) ?? 0) + 1)
    for (const d of logDates) m.set(d, (m.get(d) ?? 0) + 1)
    return m
  }, [prs, resultDates, logDates])
  const activeDays = useMemo(() => new Set(dayCounts.keys()), [dayCounts])
  const streak = useMemo(() => computeStreakDays(activeDays), [activeDays])
  const week = useMemo(() => {
    const out: { ymd: string; label: string; active: boolean; isToday: boolean }[] = []
    const base = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base); d.setDate(base.getDate() - i)
      const ymd = toDateInput(d)
      out.push({ ymd, label: formatDateOnly(ymd, { weekday: 'narrow' }), active: activeDays.has(ymd), isToday: i === 0 })
    }
    return out
  }, [activeDays])
  const maxesLb = useMemo(() => new Map(prs.filter(p => p.is_pr && p.metric === '1rm' && p.movements?.name).map(p => [p.movements!.name, p.value_lb])), [prs])
  const firstName = profile.full_name.split(' ')[0]
  const heroData = useMemo(() => ({
    hits, unit, streak, weekDays: week.filter(d => d.active).length,
    readiness: nextEvent && nextEvent.readiness !== null ? { name: nextEvent.name, score: nextEvent.readiness, days: nextEvent.days } : null,
    maxes: [...maxesLb.entries()].map(([name, valueLb]) => ({ name, valueLb })),
    goals: goals.map(g => ({ id: g.id, movement: g.movement, target: g.target, done: g.done, period: g.period })),
    challenges: (challenges ?? []).map(c => ({ id: c.id, title: c.title, target: c.target, myTotal: c.myTotal, joined: c.joined })),
  }), [hits, unit, streak, week, nextEvent, maxesLb, goals, challenges])

  function renderWidget(id: WidgetId) {
    switch (id) {
      case 'hero':
        return <HeroRings data={heroData} onLog={() => setAddOpen(true)} onGenerate={() => setGenOpen(true)} />
      case 'today':
        return today ? (
          <Link href="/wod" className={cn('tap-card block rounded-[24px] p-5 relative overflow-hidden', today.myResult ? 'bg-p' : 'bg-ac text-onac')}>
            {!today.myResult && <Fire size={130} weight="fill" className="absolute -right-6 -bottom-8 opacity-15" aria-hidden />}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-[13px] font-semibold', today.myResult ? 'text-mu' : 'opacity-80')}>WOD de hoy</span>
              {today.classTime && (
                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums', today.myResult ? 'bg-p2' : 'bg-onac/15')}>
                  <Clock size={12} weight="bold" aria-hidden />{today.classTime}
                </span>
              )}
              {(today.count ?? 1) > 1 && <span className={cn('text-[11px]', today.myResult ? 'text-mu' : 'opacity-70')}>+{(today.count ?? 1) - 1} clase{(today.count ?? 1) > 2 ? 's' : ''} más</span>}
            </div>
            <div className="font-display text-3xl font-bold leading-tight mt-1 text-balance max-w-[18ch] tracking-tight">{today.title}</div>
            {today.myResult ? (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="size-6 rounded-full bg-gr/15 text-gr grid place-items-center"><Check size={14} weight="bold" aria-hidden /></span>
                <span className="text-mu">Registraste <span className="text-t font-bold tabular-nums">{today.myResult}</span> · mira el ranking</span>
              </div>
            ) : (
              <span className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-onac text-ac text-sm font-bold">
                {WOD_TYPE_META[today.type]?.label ?? 'Ver WOD'}{today.durationMins ? ` · ${today.durationMins} min` : ''} <CaretRight size={16} weight="bold" aria-hidden />
              </span>
            )}
          </Link>
        ) : (
          <Link href={hasBox ? '/calendar' : '/settings/boxes'} className="tap-card flex items-center gap-4 rounded-[24px] bg-p p-4">
            <span className="size-11 rounded-2xl bg-p2 grid place-items-center text-mu flex-shrink-0">{hasBox ? <Fire size={22} /> : <Users size={22} />}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold">{hasBox ? 'Aún no hay WOD hoy' : 'Únete a tu box'}</span>
              <span className="block text-mu text-sm mt-0.5">{hasBox ? 'Mira lo programado en tu calendario' : 'Ingresa el código de tu coach'}</span>
            </span>
            <CaretRight size={18} className="text-fa" aria-hidden />
          </Link>
        )
      case 'nextEvent':
        return <NextEventCard event={nextEvent} />
      case 'challenges':
        return <ChallengesWidget challenges={challenges} />
      case 'goals':
        return (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Metas</h3>
              <button type="button" onClick={() => setLogTab('goal')} className="text-ac text-sm font-semibold flex items-center gap-1"><Plus size={14} weight="bold" />Nueva</button>
            </div>
            {goalsMissing ? <p className="text-mu text-sm">Las metas se activan con la migración 007.</p>
              : goals.length === 0 ? (
                <button type="button" onClick={() => setLogTab('goal')} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-p2 text-left">
                  <span className="size-10 rounded-xl bg-ac/15 text-ac grid place-items-center"><Target size={20} weight="duotone" /></span>
                  <span className="text-sm text-mu">Ponte una meta: “25 dominadas hoy” o “100 burpees esta semana”.</span>
                </button>
              ) : (
                <ul className="flex flex-col gap-3">
                  {goals.map(g => {
                    const pct = Math.min(100, Math.round((g.done / g.target) * 100))
                    return (
                      <li key={g.id}>
                        <div className="flex items-baseline justify-between text-sm mb-1.5">
                          <span className="font-medium">{g.movement} <span className="text-mu">· {g.period === 'today' ? 'hoy' : g.period === 'week' ? 'esta semana' : g.period === 'daily' ? 'cada día' : 'cada semana'}</span></span>
                          <span className="tabular-nums font-semibold">{g.done}/{g.target}{pct >= 100 && <Check size={14} weight="bold" className="inline ml-1 text-gr" />}</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-t/[.08] overflow-hidden">
                          <motion.div className={cn('h-full rounded-full', pct >= 100 ? 'bg-gr' : 'bg-ac')} initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
          </Card>
        )
      case 'week':
        return (
          <Card padding={false} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Mi semana</h3>
              <span className="flex items-center gap-1 text-sm font-semibold tabular-nums">
                <Fire size={16} weight={streak > 0 ? 'fill' : 'regular'} className={streak > 0 ? 'text-or' : 'text-fa'} aria-hidden />
                {streak} {streak === 1 ? 'día' : 'días'} de racha
              </span>
            </div>
            <ol className="grid grid-cols-7 gap-1.5">
              {week.map(d => (
                <li key={d.ymd} className="flex flex-col items-center gap-1.5">
                  <span className={cn('size-10 rounded-full grid place-items-center text-sm font-semibold tabular-nums transition-colors',
                    d.active ? 'bg-t text-bg' : d.isToday ? 'ring-2 ring-inset ring-ac/50' : 'bg-p2 text-mu')}>
                    {d.active ? <Check size={16} weight="bold" aria-label="Entrenaste" /> : Number(d.ymd.slice(8))}
                  </span>
                  <span className={cn('text-[10px] font-semibold uppercase', d.isToday ? 'text-t' : 'text-fa')}>{d.label}</span>
                </li>
              ))}
            </ol>
          </Card>
        )
      case 'highlights':
        return (
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="font-semibold">Tus tops</h3>
              <button type="button" onClick={() => setKpiPicker(true)} className="text-mu text-sm hover:text-t flex items-center gap-1"><SlidersHorizontal size={14} />Elegir</button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {kpiPRs.map(slot => {
                const f = slot.best ? formatPrValue(slot.best, unit) : null
                const prev = slot.previous ? formatPrValue(slot.previous, unit) : null
                return (
                  <Card key={slot.name} padding={false} className="p-4">
                    <div className="text-[13px] text-mu font-medium leading-tight mb-2 min-h-[2lh] break-words">{slot.name}</div>
                    {f ? (
                      <>
                        <div className="font-display text-[42px] font-bold leading-none tracking-tight"><CountUp value={f.value} /><span className="text-base text-mu font-medium ml-1">{f.unit}</span></div>
                        <div className="text-fa text-[11px] mt-1.5">{prev ? `Antes: ${prev.value} ${prev.unit}` : 'Primer registro'}</div>
                      </>
                    ) : <div className="font-display text-3xl font-bold text-fa">—</div>}
                  </Card>
                )
              })}
            </div>
          </div>
        )
      case 'strength':
        return (
          <Card padding={false} className="p-5">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h3 className="font-semibold">Evolución de fuerza</h3>
              <select value={selectedMovement} onChange={e => setSelectedMovement(e.target.value)} aria-label="Ejercicio del gráfico"
                className="bg-p2 rounded-full px-3 h-9 text-sm outline-none max-w-[170px]">
                {strengthMovements.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div className="h-[260px]"><StrengthChart prs={prs} movement={selectedMovement} unit={unit} /></div>
          </Card>
        )
      case 'heatmap':
        return <Card><h3 className="font-semibold mb-1">Constancia</h3><ActivityHeatmap counts={dayCounts} /></Card>
      case 'records':
        return (
          <Card padding={false} className="p-5">
            <div className="flex items-center justify-between mb-3"><h3 className="font-semibold">Tus récords</h3><Link href="/prs" className="text-ac text-sm font-semibold">Ver todos</Link></div>
            {topPRs.length === 0 && <p className="text-mu text-sm">Aún no hay RMs registrados.</p>}
            <ul className="flex flex-col gap-2">
              {topPRs.map(pr => {
                const f = formatPrValue(pr, unit)
                return (
                  <li key={pr.id}>
                    <Link href="/prs" className="flex items-center justify-between p-3 bg-p2 rounded-2xl hover:bg-p3 transition-colors">
                      <span className="min-w-0">
                        <span className="block font-medium text-sm leading-tight break-words">{pr.movements?.name}</span>
                        <span className="block text-mu text-xs">{pr.metric !== '1rm' ? `${pr.metric.replace('max_reps', 'Máx reps').toUpperCase()} · ` : ''}{new Date(pr.recorded_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</span>
                      </span>
                      <span className="font-display text-2xl font-bold tracking-tight">{f.value}<span className="text-xs text-mu font-medium ml-1">{f.unit}</span></span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      case 'stats':
        return (
          <div className="grid grid-cols-2 gap-3">
            <Card padding={false} className="p-4">
              <div className="font-display text-4xl font-bold leading-none tracking-tight"><CountUp value={prs.length} /></div>
              <div className="text-mu text-sm mt-1.5">RMs anotados</div>
            </Card>
            <Card padding={false} className="p-4">
              <div className="font-display text-4xl font-bold leading-none tracking-tight flex items-center gap-1.5"><CountUp value={prs.filter(p => p.is_pr).length} /><Trophy size={20} weight="fill" className="text-ac" /></div>
              <div className="text-mu text-sm mt-1.5">Récords vigentes</div>
            </Card>
          </div>
        )
      case 'links':
        return (
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { href: '/wod/history', label: 'Historial', icon: ClockCounterClockwise, tone: 'bg-bl/15 text-bl' },
              { href: '/competitions', label: 'Competencias', icon: Trophy, tone: 'bg-rd/15 text-rd' },
              { href: '/movements', label: 'Ejercicios', icon: Barbell, tone: 'bg-gr/15 text-gr' },
              { href: '/calc', label: 'Calculadora', icon: Calculator, tone: 'bg-or/15 text-or' },
            ].map(item => (
              <Link key={item.href} href={item.href} className="tap-card rounded-[20px] bg-p p-3 flex items-center gap-3 min-w-0">
                <span className={cn('size-10 rounded-2xl grid place-items-center flex-shrink-0', item.tone)}><item.icon size={20} weight="duotone" aria-hidden /></span>
                <span className="text-sm font-semibold whitespace-nowrap">{item.label}</span>
              </Link>
            ))}
          </div>
        )
    }
  }


  return (
    <>
      <Topbar title="Inicio" profile={profile} actions={
        <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => setAddOpen(true)} aria-label="Agregar registro"
          className="size-10 rounded-full bg-ac text-onac grid place-items-center">
          <Plus size={20} weight="bold" />
        </motion.button>
      } />

      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-5xl w-full mx-auto">
        <WidgetBoard scope="athlete" profile={profile}
          header={<>
            <p className="text-mu text-sm first-letter:uppercase">{formatDateOnly(todayISO(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h2 className="font-display text-[34px] font-bold leading-tight tracking-tight">Hola, {firstName}</h2>
          </>}
          widgets={ORDER.map(id => ({ id, ...WIDGETS[id], render: () => renderWidget(id) }))} />
      </div>

      {/* "+": what do you want to log? */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={<>¿Qué quieres <span className="text-ac">registrar</span>?</>}>
        <div className="flex flex-col gap-2">
          {[
            { icon: Trophy, tone: 'bg-ac/15 text-ac', title: 'Un récord (RM)', sub: 'Tu nuevo máximo en un levantamiento', run: () => setPrModalOpen(true) },
            { icon: PersonSimpleRun, tone: 'bg-bl/15 text-bl', title: 'Un entreno por mi cuenta', sub: 'En casa, al aire libre o extra en el box', run: () => setLogTab('log') },
            { icon: Target, tone: 'bg-or/15 text-or', title: 'Una meta', sub: 'Ej: 25 dominadas hoy', run: () => setLogTab('goal') },
          ].map(o => (
            <button key={o.title} type="button" onClick={() => { setAddOpen(false); o.run() }}
              className="flex items-center gap-4 p-4 rounded-[20px] bg-p2 hover:bg-p3 text-left active:scale-[0.98] transition">
              <span className={cn('size-12 rounded-2xl grid place-items-center', o.tone)}><o.icon size={24} weight="duotone" /></span>
              <span className="flex-1 min-w-0"><span className="block font-semibold">{o.title}</span><span className="block text-mu text-sm">{o.sub}</span></span>
              <CaretRight size={18} className="text-fa" />
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={kpiPicker} onClose={() => setKpiPicker(false)} title="Tus tops" subtitle={`Elige hasta 4 (${kpiMovements.length}/4)`}>
        <div className="flex flex-wrap gap-2">
          {kpiOptions.map(name => {
            const on = kpiMovements.includes(name)
            return (
              <button key={name} type="button" onClick={() => {
                if (on) { if (kpiMovements.length > 1) saveKpis(kpiMovements.filter(n => n !== name)) }
                else saveKpis(kpiMovements.length < 4 ? [...kpiMovements, name] : [...kpiMovements.slice(0, 3), name])
              }}
                className={cn('h-10 px-4 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5', on ? 'bg-ac text-onac' : 'bg-p2 text-mu hover:text-t')}>
                {on && <Check size={14} weight="bold" />}{name}
              </button>
            )
          })}
        </div>
        <button type="button" onClick={() => setKpiPicker(false)} className="w-full h-[52px] mt-6 rounded-full bg-ac text-onac font-semibold">Listo</button>
      </Modal>

      <LogSheet open={logTab !== null} tab={logTab ?? 'log'} onClose={() => setLogTab(null)} unit={unit}
        movements={movements.map(m => m.name)} />
      <GenerateWodSheet open={genOpen} onClose={() => setGenOpen(false)} hits={hits} maxesLb={maxesLb} unit={unit} />

      {prModalOpen && (
        <PRModal profile={profile} onClose={() => setPrModalOpen(false)}
          onSaved={result => { setPrModalOpen(false); setCelebration(result); router.refresh() }} />
      )}
      {celebration && <RmCelebrationModal celebration={celebration} onClose={() => setCelebration(null)} />}
    </>
  )
}
