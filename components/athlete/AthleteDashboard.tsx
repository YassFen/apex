'use client'
import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Settings2, Flame, Trophy, ChevronUp, ChevronDown, X, ChevronRight, History, Calculator, Check, Users } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PRModal } from '@/components/athlete/PRModal'
import { StrengthChart } from '@/components/athlete/StrengthChart'
import { RmCelebrationModal, type Celebration } from '@/components/athlete/RmCelebrationModal'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import type { Profile, Movement } from '@/lib/types/database'
import { toDateInput, todayISO, formatDateOnly } from '@/lib/utils/dates'
import { CountUp } from '@/components/ui/CountUp'
import { WOD_TYPE_META } from '@/components/wod/WodView'
import { cn } from '@/lib/utils/cn'

interface PR {
  id: string
  value_lb: number
  recorded_at: string
  movements: { name: string; category: string } | null
  metric: string
  is_pr: boolean
}

const DEFAULT_KPI = ['Deadlift', 'Back Squat', 'Snatch', 'Clean & Jerk']
const KPI_STORAGE_KEY = 'apex.dashboard.kpis'

function formatPrValue(pr: PR, unit: 'kg' | 'lb'): { value: string; unit: string } {
  const metric = pr.metric ?? '1rm'
  const raw = pr.value_lb ?? 0
  if (metric === 'time') {
    const tot = Math.round(raw); const m = Math.floor(tot / 60); const s = tot % 60
    return { value: `${m}:${String(s).padStart(2, '0')}`, unit: 'min' }
  }
  if (metric === 'max_reps' && pr.movements?.category === 'cardio') {
    // calories stored as max_reps under cardio
    return { value: String(Math.round(raw)), unit: 'cal' }
  }
  if (metric === 'max_reps') return { value: String(Math.round(raw)), unit: 'reps' }
  if (unit === 'kg') return { value: String(Math.round(raw * 0.453592)), unit: 'kg' }
  return { value: String(Math.round(raw)), unit: 'lb' }
}

function computeStreakDays(days: Set<string>): number {
  if (days.size === 0) return 0
  const cursor = new Date()
  // A streak is still alive if the last log was yesterday
  if (!days.has(toDateInput(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(toDateInput(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

type TodayWod = { title: string; type: string; durationMins: number | null; myResult: string | null }

export function AthleteDashboard({ profile, prs, movements = [], today = null, hasBox = false, resultDates = [] }: {
  profile: Profile; prs: PR[]; movements?: Movement[]; today?: TodayWod | null; hasBox?: boolean; resultDates?: string[]
}) {
  const router = useRouter()
  const [prModalOpen, setPrModalOpen] = useState(false)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const [editKpis, setEditKpis] = useState(false)
  const unit = profile.preferred_unit

  // For KPI picker: combine master movement list with any names already in PRs
  // (covers custom or removed movements). Group by category for the chooser.
  const kpiPickerGroups = useMemo(() => {
    const KEY: Record<string, string> = {
      weightlifting: 'Levantamiento', olympic: 'Levantamiento',
      gymnastics: 'Gimnástico', cardio: 'Monoestructural', benchmark: 'Benchmarks',
    }
    const groups: Record<string, Set<string>> = {}
    movements.forEach(m => {
      const label = KEY[m.category] ?? 'Otros'
      ;(groups[label] = groups[label] ?? new Set()).add(m.name)
    })
    prs.forEach(p => {
      const cat = p.movements?.category as string | undefined
      const name = p.movements?.name
      if (!name) return
      const label = (cat && KEY[cat]) || 'Otros'
      ;(groups[label] = groups[label] ?? new Set()).add(name)
    })
    return Object.entries(groups).map(([label, set]) => ({ label, names: Array.from(set).sort() }))
  }, [movements, prs])

  // KPI movements — SSR-safe: start with default, sync from localStorage after mount
  const [kpiMovements, setKpiMovements] = useState<string[]>(DEFAULT_KPI)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KPI_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length) setKpiMovements(parsed.slice(0, 4))
      }
    } catch {}
  }, [])

  function saveKpis(next: string[]) {
    setKpiMovements(next)
    try { localStorage.setItem(KPI_STORAGE_KEY, JSON.stringify(next)) } catch {}
  }

  // For each KPI show best PR + previous record
  const kpiPRs = kpiMovements.map(name => {
    const sorted = prs
      .filter(p => p.movements?.name === name)
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    const best = sorted.find(p => p.is_pr) ?? sorted[0]
    const previous = sorted.filter(p => p.id !== best?.id).sort((a, b) => {
      if (a.metric === 'time') return a.value_lb - b.value_lb
      return b.value_lb - a.value_lb
    })[0]
    return { name, best, previous }
  })

  // Current records only (is_pr), newest first — older, beaten marks don't belong in "tops".
  const topPRs = prs.filter(p => p.is_pr).slice(0, 5)

  // Selector for strength chart: all movements that have at least one weightlifting PR,
  // falling back to the complete movements list (passed from server), then DEFAULT_KPI.
  const strengthMovements = useMemo(() => {
    const fromPrs = Array.from(new Set(
      prs
        .filter(p => (p.metric === '1rm' || p.metric === '2rm' || p.metric === '3rm') && p.movements?.name)
        .map(p => p.movements!.name)
    ))
    if (fromPrs.length > 0) return fromPrs
    // Fallback: show all weightlifting/olympic movements from master list
    const fromMovements = movements
      .filter(m => m.category === 'weightlifting' || m.category === 'olympic')
      .map(m => m.name)
    return fromMovements.length > 0 ? fromMovements : DEFAULT_KPI
  }, [prs, movements])

  const [selectedMovement, setSelectedMovement] = useState<string>(() =>
    prs.find(p => (p.metric === '1rm' || p.metric === '2rm' || p.metric === '3rm'))?.movements?.name ?? 'Deadlift'
  )

  const totalRecords = prs.length
  // Training days = days with a PR logged or a WOD result, in the gym's time zone.
  const activeDays = useMemo(
    () => new Set([...prs.map(p => p.recorded_at), ...resultDates].map(d => toDateInput(d))),
    [prs, resultDates],
  )
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
  const firstName = profile.full_name.split(' ')[0]

  function toggleKpi(name: string) {
    if (kpiMovements.includes(name)) {
      if (kpiMovements.length <= 1) return
      saveKpis(kpiMovements.filter(n => n !== name))
    } else {
      // Replace last slot if at capacity, otherwise append
      if (kpiMovements.length < 4) {
        saveKpis([...kpiMovements, name])
      } else {
        saveKpis([...kpiMovements.slice(0, 3), name])
      }
    }
  }

  function moveKpi(idx: number, dir: -1 | 1) {
    const next = [...kpiMovements]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    saveKpis(next)
  }

  return (
    <>
      <Topbar
        title="Inicio"
        profile={profile}
        actions={
          <Button onClick={() => setPrModalOpen(true)} size="md" aria-label="Nuevo registro" className="!px-3 sm:!px-5">
            <Plus size={16} strokeWidth={2.5} aria-hidden />
            <span className="hidden sm:inline">Nuevo registro</span>
          </Button>
        }
      />

      <div className="p-4 lg:p-6 flex flex-col gap-4 stagger">
        <div className="px-1">
          <p className="text-mu text-sm first-letter:uppercase">{formatDateOnly(todayISO(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h2 className="font-barlow text-4xl font-black tracking-wide uppercase leading-tight">Hola, {firstName}</h2>
        </div>

        {/* Today's WOD */}
        {today ? (
          <Link href="/wod" className={cn('tap-card block rounded-[20px] p-5 relative overflow-hidden', today.myResult ? 'bg-p' : 'bg-ac text-onac')}>
            {!today.myResult && <Flame size={120} className="absolute -right-6 -bottom-8 opacity-15" aria-hidden />}
            <div className="flex items-center gap-2">
              <span className={cn('text-[11px] uppercase tracking-[1.4px] font-bold', today.myResult ? 'text-mu' : 'opacity-80')}>WOD de hoy</span>
              {today.myResult && WOD_TYPE_META[today.type] && (
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase', WOD_TYPE_META[today.type].cls)}>{WOD_TYPE_META[today.type].label}</span>
              )}
            </div>
            <div className="font-barlow text-3xl font-black uppercase leading-tight mt-1 text-balance max-w-[18ch]">{today.title}</div>
            {today.myResult ? (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="size-6 rounded-full bg-gr/15 text-gr grid place-items-center"><Check size={14} strokeWidth={3} aria-hidden /></span>
                <span className="text-mu">Registraste <span className="text-t font-bold tabular-nums">{today.myResult}</span> · mira el leaderboard</span>
              </div>
            ) : (
              <span className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-onac text-ac text-sm font-bold">
                {WOD_TYPE_META[today.type]?.label ?? 'Ver WOD'}{today.durationMins ? ` · ${today.durationMins} min` : ''} <ChevronRight size={16} aria-hidden />
              </span>
            )}
          </Link>
        ) : (
          <Link href={hasBox ? '/wod' : '/settings'} className="tap-card flex items-center gap-4 rounded-[20px] bg-p p-4">
            <span className="size-11 rounded-xl bg-p2 grid place-items-center text-mu flex-shrink-0">
              {hasBox ? <Flame size={20} aria-hidden /> : <Users size={20} aria-hidden />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-sm">{hasBox ? 'Aún no hay WOD hoy' : 'Únete a tu box'}</span>
              <span className="block text-mu text-xs mt-0.5">{hasBox ? 'Te aparecerá en vivo apenas tu coach lo publique' : 'Ingresa el código de tu coach para ver el WOD diario'}</span>
            </span>
            <ChevronRight size={18} className="text-fa" aria-hidden />
          </Link>
        )}

        {/* This week */}
        <Card padding={false} className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] uppercase tracking-[1.4px] text-mu font-bold">Esta semana</span>
            <span className="flex items-center gap-1 text-sm font-bold tabular-nums">
              <Flame size={16} className={streak > 0 ? 'text-or' : 'text-fa'} fill={streak > 0 ? 'currentColor' : 'none'} aria-hidden />
              {streak} {streak === 1 ? 'día' : 'días'} de racha
            </span>
          </div>
          <ol className="grid grid-cols-7 gap-1.5">
            {week.map(d => (
              <li key={d.ymd} className="flex flex-col items-center gap-1.5">
                <span className={cn('text-[10px] font-bold uppercase', d.isToday ? 'text-t' : 'text-fa')}>{d.label}</span>
                <span className={cn(
                  'size-8 rounded-full grid place-items-center transition-colors',
                  d.active ? 'bg-ac text-onac' : d.isToday ? 'ring-2 ring-inset ring-ac/40' : 'bg-p2',
                )} aria-label={d.active ? 'Entrenaste' : 'Sin registro'}>
                  {d.active && <Check size={14} strokeWidth={3} aria-hidden />}
                </span>
              </li>
            ))}
          </ol>
        </Card>

        {/* Mini stats row */}
        <div className="grid grid-cols-2 gap-3">
          <Card padding={false} className="p-4">
            <div className="text-[10px] uppercase tracking-[1.6px] text-mu font-bold mb-1">Registros</div>
            <div className="font-barlow text-4xl font-black leading-none"><CountUp value={totalRecords} /></div>
            <div className="text-fa text-[11px] mt-1">RMs anotados</div>
          </Card>
          <Card padding={false} className="p-4">
            <div className="text-[10px] uppercase tracking-[1.6px] text-mu font-bold mb-1">Récords vigentes</div>
            <div className="font-barlow text-4xl font-black leading-none flex items-center gap-1.5">
              <CountUp value={prs.filter(p => p.is_pr).length} />
              <Trophy size={18} className="text-ac" aria-hidden />
            </div>
            <div className="text-fa text-[11px] mt-1">tus mejores marcas</div>
          </Card>
        </div>

        {/* KPI Cards */}
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[1.8px] text-fa font-bold">Destacados</div>
          <button onClick={() => setEditKpis(v => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-fa hover:text-t transition-colors">
            <Settings2 size={12} /> {editKpis ? 'Listo' : 'Personalizar'}
          </button>
        </div>

        {editKpis ? (
          <Card className="p-4">
            {/* ── Orden actual + controles ── */}
            <div className="text-[10px] uppercase tracking-[1.6px] text-fa font-bold mb-2">
              Destacados seleccionados ({kpiMovements.length}/4) — usa ↑↓ para reordenar
            </div>
            <div className="flex flex-col gap-1.5 mb-4">
              {kpiMovements.map((name, idx) => (
                <div key={name}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-p3 border border-ac/20">
                  <span className="text-[10px] font-bold text-ac w-4 text-center">{idx + 1}</span>
                  <span className="flex-1 text-sm font-semibold text-t">{name}</span>
                  <button onClick={() => moveKpi(idx, -1)} disabled={idx === 0} aria-label={`Subir ${name}`}
                    className="size-9 grid place-items-center rounded-lg text-mu hover:text-t disabled:opacity-30 transition-colors">
                    <ChevronUp size={14} strokeWidth={2.5} />
                  </button>
                  <button onClick={() => moveKpi(idx, 1)} disabled={idx === kpiMovements.length - 1} aria-label={`Bajar ${name}`}
                    className="size-9 grid place-items-center rounded-lg text-mu hover:text-t disabled:opacity-30 transition-colors">
                    <ChevronDown size={14} strokeWidth={2.5} />
                  </button>
                  <button onClick={() => toggleKpi(name)} disabled={kpiMovements.length <= 1} aria-label={`Quitar ${name}`}
                    className="size-9 grid place-items-center rounded-lg text-fa hover:text-rd disabled:opacity-30 transition-colors">
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>

            {/* ── Picker por categoría ── */}
            <div className="text-[10px] uppercase tracking-[1.6px] text-fa font-bold mb-2">
              Agregar movimiento (clic = reemplaza posición 4 si está lleno)
            </div>
            {kpiPickerGroups.length === 0 ? (
              <div className="flex flex-wrap gap-2">
                {DEFAULT_KPI.map(name => {
                  const active = kpiMovements.includes(name)
                  return (
                    <button key={name} onClick={() => toggleKpi(name)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        active ? 'bg-ac/15 text-ac border-ac/30' : 'border-transparent text-mu hover:text-t'
                      }`}>
                      {name}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {kpiPickerGroups.map(group => (
                  <div key={group.label}>
                    <div className="text-[10px] uppercase tracking-[1.6px] text-fa font-bold mb-1.5">{group.label}</div>
                    <div className="flex flex-wrap gap-2">
                      {group.names.map(name => {
                        const active = kpiMovements.includes(name)
                        return (
                          <button key={name} onClick={() => toggleKpi(name)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                              active
                                ? 'bg-ac/15 text-ac border-ac/30'
                                : 'border-transparent text-mu hover:text-t hover:border-mu'
                            }`}>
                            {name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {kpiPRs.map((slot, i) => {
              const pr = slot.best
              const prev = slot.previous
              const prFmt = pr ? formatPrValue(pr, unit) : null
              const prevFmt = prev ? formatPrValue(prev, unit) : null
              return (
                <Card key={i} padding={false} className="p-[18px]">
                  <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2.5">
                    {slot.name}
                  </div>
                  {pr && prFmt ? (
                    <>
                      <div className="font-barlow text-[46px] lg:text-[50px] font-black leading-none">
                        <CountUp value={prFmt.value} />
                        <span className="text-[16px] text-mu font-normal ml-1">{prFmt.unit}</span>
                      </div>
                      <div className="text-fa text-[11px] mt-1">
                        {prevFmt ? <>Anterior: {prevFmt.value} {prevFmt.unit}</> : 'Primer registro'}
                      </div>
                      <Badge color="lime" className="mt-2">★ RM</Badge>
                    </>
                  ) : (
                    <div className="font-barlow text-3xl font-black text-fa">—</div>
                  )}
                </Card>
              )
            })}
          </div>
        )}

        {/* Chart + Top RMs */}
        <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
          <Card padding={false} className="p-5">
            <div className="flex items-center justify-between mb-4 gap-2">
              <div className="font-barlow text-[17px] font-extrabold tracking-wide uppercase">Evolución de fuerza</div>
              <select
                value={selectedMovement}
                onChange={e => setSelectedMovement(e.target.value)}
                className="bg-p2 rounded-xl px-3 py-2 text-sm text-t outline-none focus:border-ac max-w-[180px]"
              >
                {strengthMovements.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="h-[280px]">
              <StrengthChart prs={prs} movement={selectedMovement} unit={unit} />
            </div>
          </Card>

          <Card padding={false} className="p-5">
            <div className="font-barlow text-[17px] font-extrabold tracking-wide uppercase mb-4">
              Tus récords
            </div>
            <div className="flex flex-col gap-2.5">
              {topPRs.length === 0 && (
                <p className="text-mu text-sm">Aún no hay RMs registrados. ¡Empieza ahora!</p>
              )}
              {topPRs.map(pr => {
                const fmt = formatPrValue(pr, unit)
                return (
                  <Link key={pr.id} href="/prs"
                    className="flex items-center justify-between p-3 bg-p2 rounded-xl hover:bg-p3 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{pr.movements?.name}</div>
                      <div className="text-mu text-[11px]">
                        {new Date(pr.recorded_at).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div className="font-barlow text-[26px] font-extrabold text-ac whitespace-nowrap">
                      {fmt.value}
                      <span className="text-[12px] text-mu font-normal ml-1">{fmt.unit}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
            {prs.length > 5 && (
              <Link href="/prs" className="block mt-3 text-center text-ac text-xs font-bold hover:underline">
                Ver todos los RMs →
              </Link>
            )}
          </Card>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { href: '/wod/history', label: 'Historial',   icon: History },
            { href: '/benchmarks',  label: 'Benchmarks',  icon: Trophy },
            { href: '/calc',        label: 'Calculadora', icon: Calculator },
          ].map(item => {
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} className="tap-card rounded-[20px] bg-p p-4 flex flex-col items-center gap-2 text-center">
                <span className="size-10 rounded-xl bg-p2 grid place-items-center text-t"><Icon size={18} aria-hidden /></span>
                <span className="text-xs font-bold">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </div>

      {prModalOpen && (
        <PRModal
          profile={profile}
          onClose={() => setPrModalOpen(false)}
          onSaved={result => {
            setPrModalOpen(false)
            setCelebration(result)
            router.refresh()
          }}
        />
      )}

      {celebration && (
        <RmCelebrationModal celebration={celebration} onClose={() => setCelebration(null)} />
      )}
    </>
  )
}
