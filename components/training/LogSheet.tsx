'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { MagnifyingGlass } from '@/components/ui/icons'
import { Modal } from '@/components/ui/Modal'
import { ActivePill } from '@/components/ui/motion'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { friendlyError, isMissingTable } from '@/lib/utils/errors'
import { cn } from '@/lib/utils/cn'
import type { Unit } from '@/lib/types/database'

export type LogTab = 'log' | 'goal'

const POPULAR = ['Pull-up', 'Push-up', 'Air Squat', 'Burpee', 'Double-Under', 'Toes-to-Bar', 'Wall Ball', 'Kettlebell Swing', 'Row (cal)', 'Run (m)', 'Box Jump', 'Lunge']
const REPS = [5, 10, 15, 20, 25, 30, 50, 100]
const SETS = [1, 2, 3, 4, 5]
const PERIODS = [['today', 'Hoy'], ['week', 'Esta semana'], ['daily', 'Cada día'], ['weekly', 'Cada semana']] as const
type Period = typeof PERIODS[number][0]

const unitOf = (m: string) => /\(cal\)/i.test(m) ? 'cal' : /\(m\)|run|carrera/i.test(m) ? 'm' : 'reps'
const unitWord = (u: string, n: number) => u === 'cal' ? 'calorías' : u === 'm' ? 'metros' : n === 1 ? 'rep' : 'reps'
const clean = (m: string) => m.replace(/\s*\((cal|m)\)/i, '')

/**
 * Log training done on your own (at home, outdoors) or set a goal.
 * One contrasting card with chips, like a quick picker: movement → amount → when → save.
 */
export function LogSheet({ open, onClose, tab: initialTab = 'log', movements = [], unit }: {
  open: boolean; onClose: () => void; tab?: LogTab; movements?: string[]; unit: Unit
}) {
  const router = useRouter()
  const { fire } = useToast()
  const [tab, setTab] = useState<LogTab>(initialTab)
  const [mov, setMov] = useState('Pull-up')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [sets, setSets] = useState(3)
  const [reps, setReps] = useState(10)
  const [load, setLoad] = useState('')
  const [day, setDay] = useState<'today' | 'yesterday'>('today')
  const [period, setPeriod] = useState<Period>('today')
  const [target, setTarget] = useState(25)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (open) setTab(initialTab) }, [open, initialTab])

  const options = useMemo(() => {
    const all = [...new Set([...POPULAR, ...movements])]
    const q = query.trim().toLowerCase()
    return q ? all.filter(m => m.toLowerCase().includes(q)).slice(0, 30) : all.slice(0, 24)
  }, [movements, query])

  const u = unitOf(mov)
  const name = clean(mov)
  const total = sets * reps
  const summary = tab === 'log'
    ? `${day === 'today' ? 'Hoy' : 'Ayer'} hiciste ${sets > 1 ? `${sets} × ${reps}` : reps} ${unitWord(u, reps)} de ${name}${load ? ` con ${load} ${unit}` : ''}${sets > 1 ? ` (${total} en total)` : ''}.`
    : `${period === 'today' ? 'Haz' : period === 'week' ? 'Esta semana, haz' : period === 'daily' ? 'Cada día, haz' : 'Cada semana, haz'} ${target} ${unitWord(u, target)} de ${name}${period === 'today' ? ' hoy' : ''}.`

  async function save() {
    setBusy(true)
    const supabase = createClient()
    const loadNum = Number(load.replace(',', '.'))
    const { error } = tab === 'log'
      ? await supabase.from('personal_logs').insert({
          movement: name, sets, reps: u === 'reps' ? reps : null,
          distance_m: u === 'm' ? reps : null, duration_sec: null,
          load_lb: loadNum > 0 ? (unit === 'kg' ? Math.round((loadNum / 0.453592) * 10) / 10 : loadNum) : null,
          notes: u === 'cal' ? `${total} cal` : null,
          logged_on: day === 'today' ? todayISO() : addDaysISO(todayISO(), -1),
        })
      : await supabase.from('goals').insert({ movement: name, target, unit: u, period })
    setBusy(false)
    if (error) {
      fire(isMissingTable(error) ? 'Falta aplicar la migración 007 en Supabase.' : friendlyError(error.message), 'error')
      return
    }
    fire(tab === 'log' ? 'Entreno registrado' : 'Meta creada', 'pr')
    onClose()
    router.refresh()
  }

  const chip = (active: boolean) => cn('relative isolate flex-shrink-0 h-10 px-4 rounded-full text-[15px] font-medium transition-colors', active ? 'text-t' : 'text-bg/75 hover:text-bg')

  return (
    <Modal open={open} onClose={onClose} title={tab === 'log' ? 'Registrar entreno' : 'Nueva meta'} subtitle="En el box o por tu cuenta, en casa o al aire libre.">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-p2 mb-4" role="tablist">
        {([['log', 'Registro'], ['goal', 'Meta']] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn('relative isolate h-10 rounded-full text-sm font-semibold', tab === k ? 'text-onac' : 'text-mu')}>
            {tab === k && <ActivePill layoutId="log-tab" className="rounded-full bg-ac" />}{l}
          </button>
        ))}
      </div>

      {/* The contrasting picker card */}
      <motion.div layout className="rounded-[28px] bg-t text-bg p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          {searching ? (
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar ejercicio"
              className="flex-1 h-10 px-4 rounded-full bg-bg/10 text-bg placeholder:text-bg/50 outline-none text-base sm:text-sm" />
          ) : (
            <span className="flex-1 text-[13px] font-semibold text-bg/60 px-1">Ejercicio</span>
          )}
          <button type="button" onClick={() => { setSearching(s => !s); setQuery('') }} aria-label="Buscar ejercicio"
            className="size-10 rounded-full bg-bg/10 grid place-items-center"><MagnifyingGlass size={18} /></button>
        </div>
        <div className="-mx-4 px-4 flex gap-1 overflow-x-auto scrollbar-none">
          {options.map(m => (
            <button key={m} type="button" onClick={() => setMov(m)} className={chip(mov === m)}>
              {mov === m && <ActivePill layoutId="log-mov" className="rounded-full bg-bg" />}{clean(m)}
            </button>
          ))}
        </div>

        <div className="h-px bg-bg/15" />

        {tab === 'log' ? (
          <>
            <div className="grid grid-cols-2 gap-1">
              {([['today', 'Hoy'], ['yesterday', 'Ayer']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setDay(k)} className={cn(chip(day === k), 'w-full')}>
                  {day === k && <ActivePill layoutId="log-day" className="rounded-full bg-bg" />}{l}
                </button>
              ))}
            </div>
            <div>
              <div className="text-[12px] font-semibold text-bg/60 px-1 mb-1">Series</div>
              <div className="flex gap-1">
                {SETS.map(n => (
                  <button key={n} type="button" onClick={() => setSets(n)} className={cn(chip(sets === n), 'flex-1 px-0 tabular-nums')}>
                    {sets === n && <ActivePill layoutId="log-sets" className="rounded-full bg-bg" />}{n}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {PERIODS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPeriod(k)} className={cn(chip(period === k), 'w-full')}>
                {period === k && <ActivePill layoutId="log-period" className="rounded-full bg-bg" />}{l}
              </button>
            ))}
          </div>
        )}

        <div>
          <div className="text-[12px] font-semibold text-bg/60 px-1 mb-1">{tab === 'log' ? (u === 'reps' ? 'Reps por serie' : u === 'cal' ? 'Calorías por serie' : 'Metros por serie') : 'Objetivo'}</div>
          <div className="-mx-4 px-4 flex gap-1 overflow-x-auto scrollbar-none">
            {(u === 'm' ? [100, 200, 400, 800, 1000, 5000] : REPS).map(n => {
              const active = (tab === 'log' ? reps : target) === n
              return (
                <button key={n} type="button" onClick={() => tab === 'log' ? setReps(n) : setTarget(n)} className={cn(chip(active), 'tabular-nums min-w-[52px]')}>
                  {active && <ActivePill layoutId="log-n" className="rounded-xl bg-bg" />}{n}
                </button>
              )
            })}
          </div>
        </div>

        {tab === 'log' && u === 'reps' && (
          <label className="flex items-center gap-2 h-11 px-4 rounded-full bg-bg/10">
            <span className="text-[13px] text-bg/60">Carga (opcional)</span>
            <input value={load} onChange={e => setLoad(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="0"
              className="flex-1 min-w-0 bg-transparent text-right font-semibold outline-none placeholder:text-bg/40 text-base sm:text-sm" />
            <span className="text-[13px] text-bg/60">{unit}</span>
          </label>
        )}

        <p className="text-center text-[15px] text-bg/80 px-2 text-balance">{summary}</p>

        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={save} disabled={busy}
          className="h-12 rounded-full bg-bg text-t font-semibold disabled:opacity-60">
          {busy ? 'Guardando…' : 'Guardar'}
        </motion.button>
      </motion.div>
    </Modal>
  )
}
