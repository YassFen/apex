'use client'
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Minus, Plus, Search, Sparkles, Dumbbell, Flame, X } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { AnimatedNumber, Reveal, Segmented, SPRING, ActivePill } from '@/components/ui/motion'
import { cn } from '@/lib/utils/cn'
import {
  BARS, PLATES, approxRepsAt, fromUnit, loadStep, platesPerSide, repsAtWeight, roundToLoadable, toUnit, warmupSets,
} from '@/lib/utils/rm-calculator'
import type { Profile, Unit } from '@/lib/types/database'

export interface CalcPr {
  id: string
  movement: string
  category: string
  reps: number
  valueLb: number
  recordedAt: string
}

const CAT_LABEL: Record<string, string> = {
  weightlifting: 'Levantamiento',
  olympic:       'Olímpico',
  gymnastics:    'Gimnástico',
  cardio:        'Monoestructural',
  benchmark:     'Benchmark',
}

const PCT_QUICK = [50, 60, 65, 70, 75, 80, 85, 90, 95, 100]
const TABLE_PCTS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50]

/** Rounded for display: whole lb, half kg. */
const shown = (v: number, unit: Unit) => unit === 'kg' ? Math.round(v * 2) / 2 : Math.round(v)
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(v * 10 % 1 === 0 ? 1 : 2)).replace('.', ',')

export function RMCalcView({ profile, prs }: { profile: Profile; prs: CalcPr[] }) {
  const [unit, setUnit]       = useState<Unit>(profile.preferred_unit ?? 'kg')
  const [weight, setWeight]   = useState('')
  const [reps, setReps]       = useState(1)
  const [pct, setPct]         = useState(75)
  const [barIdx, setBarIdx]   = useState(0)
  const [prId, setPrId]       = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [tab, setTab]         = useState<'table' | 'warmup'>('table')

  const bar = BARS[unit][barIdx].weight
  const selectedPr = prs.find(p => p.id === prId) ?? null
  const w = Number(weight.replace(',', '.')) || 0

  const oneRM = w > 0 ? (reps <= 1 ? w : w * (1 + reps / 30)) : 0
  const target = oneRM > 0 ? roundToLoadable(oneRM * pct / 100, unit) : 0
  const loadable = target >= bar
  const { plates, leftover } = loadable ? platesPerSide(target, bar, unit) : { plates: [], leftover: 0 }
  const repsPossible = oneRM > 0 ? repsAtWeight(oneRM, target) : 0

  // The athlete's real 1RM for the chosen movement, to compare the estimate with.
  const realOneRM = selectedPr
    ? prs.find(p => p.movement === selectedPr.movement && p.reps === 1)
    : null
  const realOneRMu = realOneRM ? toUnit(realOneRM.valueLb, unit) : 0
  const gain = realOneRM && reps > 1 && oneRM > realOneRMu ? oneRM - realOneRMu : 0

  function choosePr(p: CalcPr) {
    setPrId(p.id)
    setWeight(String(shown(toUnit(p.valueLb, unit), unit)))
    setReps(p.reps)
    setPickerOpen(false)
  }

  function changeUnit(next: Unit) {
    if (next === unit) return
    if (w > 0) setWeight(String(shown(toUnit(fromUnit(w, unit), next), next)))
    setUnit(next)
  }

  function nudgeWeight(dir: 1 | -1) {
    const step = loadStep(unit)
    const next = Math.max(0, Math.round((w + dir * step) / step) * step)
    setWeight(next ? String(next) : '')
    setPrId(null)
  }

  return (
    <>
      <Topbar title="Calculadora" profile={profile} actions={
        <Segmented id="calc-unit" size="sm" className="w-[104px]" value={unit} onChange={changeUnit}
          options={[['kg', 'kg'], ['lb', 'lb']] as const} />
      } />

      <div className="p-4 lg:p-6 grid lg:grid-cols-[1fr_1fr] gap-4 max-w-5xl mx-auto w-full items-start">
        {/* ── 1RM ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <section className="rounded-[28px] bg-p p-1.5 ring-1 ring-t/[.05]" aria-label="Calcular 1RM">
            <div className="rounded-[22px] bg-p2 p-4 sm:p-5 shadow-[inset_0_1px_0_rgb(var(--c-t)/0.06)]">
              {prs.length > 0 && (
                <button type="button" onClick={() => setPickerOpen(true)}
                  className="tap-card w-full flex items-center gap-3 p-3 rounded-2xl bg-p mb-4 text-left">
                  <span className="size-10 rounded-xl bg-ac/15 text-ac grid place-items-center flex-shrink-0"><Dumbbell size={18} aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] uppercase tracking-[1.6px] text-fa font-bold">Desde tus récords</span>
                    <span className="block font-semibold text-sm truncate">
                      {selectedPr ? `${selectedPr.movement} · ${selectedPr.reps}RM` : 'Elegir ejercicio'}
                    </span>
                  </span>
                  {selectedPr
                    ? <span role="button" tabIndex={0} aria-label="Quitar ejercicio"
                        onClick={e => { e.stopPropagation(); setPrId(null) }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setPrId(null) } }}
                        className="size-8 rounded-full grid place-items-center text-mu hover:text-t hover:bg-p3"><X size={16} aria-hidden /></span>
                    : <ChevronRight size={18} className="text-mu" aria-hidden />}
                </button>
              )}

              <div className="grid grid-cols-[1fr_auto] gap-3">
                <Stepper label={`Peso (${unit})`} onMinus={() => nudgeWeight(-1)} onPlus={() => nudgeWeight(1)}>
                  <input type="text" inputMode="decimal" value={weight} placeholder="0" aria-label={`Peso levantado en ${unit}`}
                    onChange={e => { setWeight(e.target.value.replace(/[^\d.,]/g, '')); setPrId(null) }}
                    className="w-full min-w-0 bg-transparent text-center font-barlow text-3xl font-black outline-none placeholder:text-fa tabular-nums" />
                </Stepper>
                <Stepper label="Reps" onMinus={() => setReps(r => Math.max(1, r - 1))} onPlus={() => setReps(r => Math.min(15, r + 1))}>
                  <span className="w-9 text-center font-barlow text-3xl font-black tabular-nums" aria-live="polite">{reps}</span>
                </Stepper>
              </div>

              <div className="mt-5 text-center">
                <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold">
                  {reps === 1 ? 'Tu 1RM' : '1RM estimado'}
                </div>
                <div className="font-barlow font-black leading-none text-ac mt-1">
                  <span className="text-[72px]">{oneRM > 0 ? <AnimatedNumber value={shown(oneRM, unit)} decimals={unit === 'kg' && shown(oneRM, unit) % 1 ? 1 : 0} /> : '—'}</span>
                  <span className="text-2xl text-mu font-bold ml-1.5">{unit}</span>
                </div>
                <div className="text-mu text-xs mt-1.5 tabular-nums">
                  {oneRM > 0 && <>{fmt(shown(toUnit(fromUnit(oneRM, unit), unit === 'kg' ? 'lb' : 'kg'), unit === 'kg' ? 'lb' : 'kg'))} {unit === 'kg' ? 'lb' : 'kg'}</>}
                  {reps > 10 && <span className="block text-or mt-1">Con más de 10 reps la estimación es menos precisa.</span>}
                </div>
                <AnimatePresence>
                  {gain > 0 && (
                    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={SPRING}
                      className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full bg-ac/15 text-ac text-xs font-bold">
                      <Sparkles size={14} aria-hidden /> {fmt(shown(gain, unit))} {unit} sobre tu 1RM registrado
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </section>

          {oneRM > 0 && (
            <Reveal>
              <Card>
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <h2 className="font-barlow text-lg font-extrabold tracking-wide uppercase">Carga de trabajo</h2>
                    <p className="text-mu text-xs">Desliza o elige un porcentaje</p>
                  </div>
                  <div className="font-barlow text-4xl font-black text-ac leading-none"><AnimatedNumber value={pct} />%</div>
                </div>
                <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1 scrollbar-none">
                  {PCT_QUICK.map(p => (
                    <button key={p} type="button" onClick={() => setPct(p)} aria-pressed={pct === p}
                      className={cn('relative isolate flex-shrink-0 h-9 px-3.5 rounded-full text-xs font-bold transition-colors',
                        pct === p ? 'text-onac' : 'text-mu bg-p2 hover:text-t')}>
                      {pct === p && <ActivePill layoutId="calc-pct" className="rounded-full bg-ac" />}
                      {p}%
                    </button>
                  ))}
                </div>
                <input type="range" min="30" max="105" step="1" value={pct} aria-label="Porcentaje del 1RM"
                  onChange={e => setPct(Number(e.target.value))}
                  className="w-full accent-ac mt-4" />

                <div className="grid grid-cols-2 gap-2.5 mt-4">
                  <div className="p-4 rounded-2xl bg-p2">
                    <div className="text-[10px] uppercase tracking-[1.5px] text-fa font-bold mb-1.5">Carga la barra con</div>
                    <div className="font-barlow text-4xl font-black leading-none">
                      <AnimatedNumber value={target} decimals={target % 1 ? 1 : 0} /><span className="text-base text-mu font-bold ml-1">{unit}</span>
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-p2">
                    <div className="text-[10px] uppercase tracking-[1.5px] text-fa font-bold mb-1.5">Reps posibles</div>
                    <div className="font-barlow text-4xl font-black leading-none">
                      {repsPossible > 0 ? <>~<AnimatedNumber value={repsPossible} /></> : '—'}
                    </div>
                    <div className="text-[11px] text-mu mt-1">{repsPossible > 0 ? 'al fallo, aprox.' : 'sobre tu 1RM'}</div>
                  </div>
                </div>
              </Card>
            </Reveal>
          )}
        </div>

        {/* ── Barbell + tables ─────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {oneRM > 0 && (
            <Reveal delay={0.05}>
              <Card padding={false} className="p-5 overflow-hidden">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h2 className="font-barlow text-lg font-extrabold tracking-wide uppercase">La barra</h2>
                  <Segmented id="calc-bar" size="sm" className="w-[210px]" value={String(barIdx)} onChange={v => setBarIdx(Number(v))}
                    options={BARS[unit].map((b, i) => [String(i), `${b.weight} ${unit}`] as const)} />
                </div>
                <p className="text-mu text-xs mb-2">Barra de {BARS[unit][barIdx].label.toLowerCase()} · discos por lado</p>

                <Barbell plates={plates} unit={unit} />

                {loadable ? (
                  <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                    {groupPlates(plates).map(([p, n]) => (
                      <span key={p} className="inline-flex items-center gap-1.5 h-8 pl-1.5 pr-3 rounded-full bg-p2 text-xs font-bold tabular-nums">
                        <span className={cn('size-5 rounded-full', plateLook(p, unit).color)} aria-hidden />
                        {n} × {fmt(p)}
                      </span>
                    ))}
                    {plates.length === 0 && <span className="text-mu text-sm">Solo la barra</span>}
                  </div>
                ) : (
                  <p className="text-center text-mu text-sm">Es menos que la barra vacía ({bar} {unit}).</p>
                )}
                {leftover > 0 && <p className="text-center text-or text-xs mt-2">Faltan {fmt(leftover)} {unit} que no se pueden cargar con discos estándar.</p>}
              </Card>
            </Reveal>
          )}

          {oneRM > 0 && (
            <Reveal delay={0.1}>
              <Card padding={false} className="overflow-hidden">
                <div className="p-4 pb-3">
                  <Segmented id="calc-tab" value={tab} onChange={setTab}
                    options={[['table', 'Porcentajes'], ['warmup', 'Calentamiento']] as const} />
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  {tab === 'table' ? (
                    <motion.ul key="table" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.2 }}
                      className="px-2 pb-2">
                      {TABLE_PCTS.map(p => {
                        const wt = roundToLoadable(oneRM * p / 100, unit)
                        const active = p === pct
                        return (
                          <li key={p}>
                            <button type="button" onClick={() => setPct(p)}
                              className={cn('relative isolate w-full grid grid-cols-[64px_1fr_auto] items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors', active ? '' : 'hover:bg-p2')}>
                              {active && <ActivePill layoutId="calc-row" className="bg-ac/15 rounded-xl" />}
                              <span className={cn('font-barlow text-lg font-black', active ? 'text-ac' : 'text-mu')}>{p}%</span>
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="h-1.5 flex-1 max-w-[120px] rounded-full bg-t/[.08] overflow-hidden">
                                  <motion.span className="block h-full rounded-full bg-ac" initial={{ width: 0 }} animate={{ width: `${p}%` }} transition={{ duration: 0.6, delay: (100 - p) / 200 }} />
                                </span>
                                <span className="font-barlow text-2xl font-black tabular-nums">{fmt(wt)}</span>
                                <span className="text-mu text-xs">{unit}</span>
                              </span>
                              <span className="text-mu text-xs tabular-nums">~{approxRepsAt(p)} reps</span>
                            </button>
                          </li>
                        )
                      })}
                    </motion.ul>
                  ) : (
                    <motion.div key="warmup" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}
                      className="px-4 pb-4">
                      <p className="text-mu text-xs mb-3 flex items-center gap-1.5"><Flame size={14} className="text-or" aria-hidden />Rampa hasta {fmt(target)} {unit} ({pct}%)</p>
                      <ol className="flex flex-col gap-1.5">
                        {warmupSets(target, bar, unit).map((s, i) => (
                          <li key={i} className="flex items-center gap-3 p-3 rounded-xl bg-p2">
                            <span className="size-7 rounded-full bg-p3 grid place-items-center text-xs font-bold text-mu">{i + 1}</span>
                            <span className="font-barlow text-2xl font-black tabular-nums">{fmt(s.weight)}<span className="text-xs text-mu font-bold ml-1">{unit}</span></span>
                            <span className="text-mu text-sm">× {s.reps}</span>
                            <span className="ml-auto text-[11px] text-fa truncate">{i === 0 ? 'Barra vacía' : platesLabel(platesPerSide(s.weight, bar, unit).plates)}</span>
                          </li>
                        ))}
                        <li className="flex items-center gap-3 p-3 rounded-xl bg-ac/15 text-ac">
                          <span className="size-7 rounded-full bg-ac text-onac grid place-items-center text-xs font-bold">★</span>
                          <span className="font-barlow text-2xl font-black tabular-nums">{fmt(target)}<span className="text-xs font-bold ml-1">{unit}</span></span>
                          <span className="text-sm font-bold">Series de trabajo</span>
                        </li>
                      </ol>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </Reveal>
          )}

          {oneRM === 0 && (
            <Card className="text-center py-10 flex flex-col items-center gap-3">
              <div className="size-14 rounded-2xl bg-ac/15 text-ac grid place-items-center animate-pop"><Dumbbell size={26} aria-hidden /></div>
              <h2 className="font-barlow text-2xl font-black uppercase">Ingresa un peso</h2>
              <p className="text-mu text-sm max-w-xs text-pretty">Escribe cuánto levantaste y cuántas reps, o elige uno de tus récords. Te mostramos tu 1RM, los porcentajes, los discos y el calentamiento.</p>
            </Card>
          )}
        </div>
      </div>

      <PrPicker open={pickerOpen} onClose={() => setPickerOpen(false)} prs={prs} unit={unit} selectedId={prId} onPick={choosePr} />
    </>
  )
}

function Stepper({ label, onMinus, onPlus, children }: { label: string; onMinus: () => void; onPlus: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[1.6px] text-fa font-bold mb-1.5 px-1">{label}</div>
      <div className="flex items-center gap-1 h-16 p-1.5 rounded-2xl bg-p focus-within:ring-2 focus-within:ring-ac/50 transition-shadow">
        <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={onMinus} aria-label={`Menos ${label}`}
          className="size-11 flex-shrink-0 rounded-xl bg-p2 grid place-items-center text-mu hover:text-t"><Minus size={18} aria-hidden /></motion.button>
        <div className="flex-1 min-w-0 flex justify-center">{children}</div>
        <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={onPlus} aria-label={`Más ${label}`}
          className="size-11 flex-shrink-0 rounded-xl bg-p2 grid place-items-center text-mu hover:text-t"><Plus size={18} aria-hidden /></motion.button>
      </div>
    </div>
  )
}

/* ── Barbell ───────────────────────────────────────────────────────────── */

function plateLook(p: number, unit: Unit): { color: string; text: string; h: number; w: number } {
  const big = 92
  if (unit === 'kg') {
    switch (p) {
      case 25:   return { color: 'bg-plate-red',    text: 'text-white', h: big, w: 22 }
      case 20:   return { color: 'bg-plate-blue',   text: 'text-white', h: big, w: 19 }
      case 15:   return { color: 'bg-plate-yellow', text: 'text-black', h: big, w: 16 }
      case 10:   return { color: 'bg-plate-green',  text: 'text-white', h: big, w: 13 }
      case 5:    return { color: 'bg-plate-white',  text: 'text-black', h: 66, w: 10 }
      case 2.5:  return { color: 'bg-plate-red',    text: 'text-white', h: 52, w: 8 }
      default:   return { color: 'bg-plate-steel',  text: 'text-black', h: 42, w: 7 }
    }
  }
  switch (p) {
    case 55:  return { color: 'bg-plate-red',    text: 'text-white', h: big, w: 22 }
    case 45:  return { color: 'bg-plate-blue',   text: 'text-white', h: big, w: 19 }
    case 35:  return { color: 'bg-plate-yellow', text: 'text-black', h: big, w: 16 }
    case 25:  return { color: 'bg-plate-green',  text: 'text-white', h: big, w: 13 }
    case 15:  return { color: 'bg-plate-black',  text: 'text-white', h: big, w: 11 }
    case 10:  return { color: 'bg-plate-black',  text: 'text-white', h: 80, w: 10 }
    case 5:   return { color: 'bg-plate-steel',  text: 'text-black', h: 56, w: 8 }
    default:  return { color: 'bg-plate-steel',  text: 'text-black', h: 44, w: 7 }
  }
}

function Barbell({ plates, unit }: { plates: number[]; unit: Unit }) {
  // Shrink plates when there are many so both sleeves fit on a phone.
  const raw = plates.reduce((s, p) => s + plateLook(p, unit).w + 2, 0)
  const scale = Math.min(1, 118 / Math.max(raw, 1))

  const side = (dir: 'l' | 'r') => {
    const list = dir === 'l' ? [...plates].reverse() : plates
    return (
      <div className={cn('flex items-center gap-[2px] h-full', dir === 'l' ? 'justify-end' : 'justify-start')}>
        <AnimatePresence initial={false} mode="popLayout">
          {list.map((p, i) => {
            const look = plateLook(p, unit)
            const idx = dir === 'l' ? list.length - 1 - i : i
            return (
              <motion.div
                key={`${dir}-${idx}-${p}`}
                layout
                initial={{ opacity: 0, x: dir === 'l' ? -28 : 28, scaleY: 0.7 }}
                animate={{ opacity: 1, x: 0, scaleY: 1 }}
                exit={{ opacity: 0, x: dir === 'l' ? -28 : 28, scaleY: 0.7 }}
                transition={{ ...SPRING, delay: idx * 0.025 }}
                className={cn('rounded-[4px] flex-shrink-0 grid place-items-center shadow-[inset_0_1px_0_rgb(255_255_255/0.25),inset_0_-2px_0_rgb(0_0_0/0.2)]', look.color)}
                style={{ height: look.h, width: Math.max(5, look.w * scale) }}
              >
                {look.w * scale >= 12 && (
                  <span className={cn('text-[9px] font-black -rotate-90 whitespace-nowrap', look.text)}>{fmt(p)}</span>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="relative h-[120px] grid grid-cols-[1fr_auto_1fr] items-center" aria-hidden>
      {/* Shaft runs under everything */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2.5 rounded-full bg-gradient-to-b from-plate-steel to-plate-black" />
      <div className="relative flex items-center h-full justify-end">
        <div className="h-4 w-3 rounded-l-sm bg-plate-steel" />
        {side('l')}
        <div className="h-6 w-2 rounded-sm bg-plate-steel ml-[2px]" />
      </div>
      <div className="relative w-16 sm:w-24 h-3 rounded-sm bg-[repeating-linear-gradient(90deg,rgb(var(--c-t)/0.15)_0_2px,transparent_2px_4px)]" />
      <div className="relative flex items-center h-full justify-start">
        <div className="h-6 w-2 rounded-sm bg-plate-steel mr-[2px]" />
        {side('r')}
        <div className="h-4 w-3 rounded-r-sm bg-plate-steel" />
      </div>
    </div>
  )
}

function groupPlates(plates: number[]): [number, number][] {
  const m = new Map<number, number>()
  for (const p of plates) m.set(p, (m.get(p) ?? 0) + 1)
  return [...m.entries()]
}

function platesLabel(plates: number[]): string {
  return plates.length ? groupPlates(plates).map(([p, n]) => n > 1 ? `${n}×${fmt(p)}` : fmt(p)).join(' + ') + ' /lado' : 'Barra'
}

/* ── PR picker ─────────────────────────────────────────────────────────── */

function PrPicker({ open, onClose, prs, unit, selectedId, onPick }: {
  open: boolean; onClose: () => void; prs: CalcPr[]; unit: Unit; selectedId: string | null; onPick: (p: CalcPr) => void
}) {
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const query = q.trim().toLowerCase()
    const g = new Map<string, CalcPr[]>()
    for (const p of prs) {
      if (query && !p.movement.toLowerCase().includes(query)) continue
      const k = p.category
      g.set(k, [...(g.get(k) ?? []), p])
    }
    return [...g.entries()]
  }, [prs, q])

  return (
    <Modal open={open} onClose={onClose} title="Tus récords" subtitle="Elige uno para calcular desde ahí">
      <label className="relative block mb-3">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fa" aria-hidden />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar ejercicio" aria-label="Buscar ejercicio"
          className="w-full h-11 pl-10 pr-3 rounded-xl bg-p2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-ac/50 placeholder:text-fa" />
      </label>
      <div className="flex flex-col gap-4 min-h-[200px]">
        {groups.length === 0 && <p className="text-center text-mu text-sm py-8">Nada coincide con “{q}”.</p>}
        {groups.map(([cat, items]) => (
          <div key={cat}>
            <div className="text-[10px] uppercase tracking-[1.6px] text-fa font-bold mb-1.5 px-1">{CAT_LABEL[cat] ?? cat}</div>
            <ul className="flex flex-col gap-1 stagger">
              {items.map(p => (
                <li key={p.id}>
                  <button type="button" onClick={() => onPick(p)}
                    className={cn('tap-card w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left', p.id === selectedId ? 'bg-ac/15' : 'bg-p2 hover:bg-p3')}>
                    <span className="flex-1 min-w-0 font-semibold text-sm truncate">{p.movement}</span>
                    <span className="px-2 py-0.5 rounded-full bg-p3 text-[10px] font-bold uppercase text-mu">{p.reps}RM</span>
                    <span className={cn('font-barlow text-xl font-black tabular-nums', p.id === selectedId && 'text-ac')}>
                      {fmt(shown(toUnit(p.valueLb, unit), unit))}<span className="text-xs text-mu font-bold ml-0.5">{unit}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  )
}
