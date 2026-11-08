'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Flag, Users, Crown, Plus, Check, Trash, Barbell, PersonSimpleRun, Timer } from '@/components/ui/icons'
import { Topbar } from '@/components/layout/Topbar'
import { Modal, ModalActions } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ActivePill, AnimatedNumber, EASE_OUT } from '@/components/ui/motion'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { addDaysISO, daysBetween, formatDateOnly } from '@/lib/utils/dates'
import { friendlyError, isMissingTable } from '@/lib/utils/errors'
import { UNIT_WORD, isActive, type ChallengeSummary } from '@/lib/utils/challenges'
import { guideFor } from '@/lib/utils/movement-guide'
import { cn } from '@/lib/utils/cn'
import { useShell } from '@/lib/hooks/useShell'
import { CHALLENGE_EXERCISES, TARGETS, cleanExercise, unitOfExercise } from '@/lib/constants/challenge-exercises'
import type { Profile } from '@/lib/types/database'

type Tab = 'active' | 'mine' | 'done'

function Art({ movement, className }: { movement: string; className?: string }) {
  const g = guideFor(movement).muscles
  const { Icon, tone } = g.includes('motor') ? { Icon: Timer, tone: 'from-bl/45 to-bl/5 text-bl' }
    : g.includes('piernas') ? { Icon: Barbell, tone: 'from-or/45 to-or/5 text-or' }
    : { Icon: PersonSimpleRun, tone: 'from-pu/45 to-pu/5 text-pu' }
  return <span className={cn('grid place-items-center bg-gradient-to-br', tone, className)} aria-hidden><Icon size={30} weight="duotone" /></span>
}

/** Box challenges: join, log what you do, climb the ranking. Anyone in the box can create one. */
export function ChallengesView({ profile, boxes, challenges, today, openId, movementNames }: {
  profile: Profile; boxes: { id: string; name: string }[]; challenges: ChallengeSummary[] | null
  today: string; openId: string | null; movementNames: string[]
}) {
  const [tab, setTab] = useState<Tab>('active')
  const [openC, setOpenC] = useState<string | null>(openId)
  const [creating, setCreating] = useState(false)
  const list = challenges ?? []

  const shown = useMemo(() => {
    if (tab === 'mine') return list.filter(c => c.joined && c.endsOn >= today)
    if (tab === 'done') return list.filter(c => c.endsOn < today)
    return list.filter(c => isActive(c, today) || c.startsOn > today)
  }, [list, tab, today])
  const current = list.find(c => c.id === openC) ?? null

  return (
    <>
      <Topbar title="Retos" profile={profile} />
      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-3xl w-full mx-auto pb-28">
        <div className="-mx-4 px-4 flex border-b border-[var(--ln)]" role="tablist">
          {([['active', 'Abiertos'], ['mine', 'Los míos'], ['done', 'Terminados']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn('relative flex-1 h-12 text-[15px] font-semibold transition-colors', tab === k ? 'text-t' : 'text-mu')}>
              {l}
              {tab === k && <motion.span layoutId="ch-tab" className="absolute inset-x-6 -bottom-px h-[3px] rounded-full bg-t" />}
            </button>
          ))}
        </div>

        {challenges === null ? (
          <p className="text-mu text-sm px-1">Los retos se activan al aplicar la migración <code>008_challenges_media.sql</code> en Supabase.</p>
        ) : (
          <>
            <div className="text-[11px] uppercase tracking-[1.4px] text-mu font-semibold px-1">
              {tab === 'done' ? 'Retos terminados' : 'Retos creados por atletas de tu box'}
            </div>
            <AnimatePresence mode="popLayout">
              {shown.length === 0 ? (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 flex flex-col items-center gap-3">
                  <span className="size-14 rounded-2xl bg-or/15 text-or grid place-items-center"><Flag size={26} weight="duotone" /></span>
                  <div className="font-semibold">{tab === 'mine' ? 'Aún no participas en retos' : 'No hay retos por ahora'}</div>
                  <p className="text-mu text-sm max-w-xs">Crea uno y desafía a tu box: “30 días de abdominales” o “500 burpees esta semana”.</p>
                </motion.div>
              ) : shown.map((c, i) => {
                const pct = Math.min(100, Math.round(((c.joined ? c.myTotal : c.ranking[0]?.total ?? 0) / c.target) * 100))
                return (
                  <motion.button key={c.id} type="button" onClick={() => setOpenC(c.id)}
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, ease: EASE_OUT }}
                    className="tap-card w-full flex items-stretch rounded-[20px] bg-p overflow-hidden text-left">
                    <span className="flex-1 min-w-0 p-4">
                      <span className="block font-display text-[17px] font-bold tracking-tight leading-tight text-balance break-words">{c.title}</span>
                      <span className="block text-mu text-sm mt-0.5">{c.ranking.length} participante{c.ranking.length === 1 ? '' : 's'}{boxes.length > 1 ? ` · ${c.boxName}` : ''}</span>
                      <span className="mt-3 block h-1.5 w-28 rounded-full bg-t/10 overflow-hidden">
                        <span className={cn('block h-full rounded-full', c.joined ? 'bg-or' : 'bg-t/40')} style={{ width: `${pct}%` }} />
                      </span>
                      <span className="block text-[11px] text-mu mt-1.5">
                        {c.endsOn < today ? `Terminó el ${formatDateOnly(c.endsOn, { day: 'numeric', month: 'short' })}`
                          : c.startsOn > today ? `Empieza el ${formatDateOnly(c.startsOn, { day: 'numeric', month: 'short' })}`
                          : `${c.joined ? `${c.myTotal}/${c.target} · ` : ''}quedan ${daysBetween(today, c.endsOn) + 1} días`}
                      </span>
                    </span>
                    <Art movement={c.movement} className="w-28 flex-shrink-0" />
                  </motion.button>
                )
              })}
            </AnimatePresence>
          </>
        )}
      </div>

      {challenges !== null && boxes.length > 0 && (
        <div className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] lg:bottom-8 inset-x-0 lg:left-[240px] flex justify-center z-30 pointer-events-none">
          <motion.button type="button" onClick={() => setCreating(true)} whileTap={{ scale: 0.95 }}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 28, delay: 0.3 }}
            className="pointer-events-auto h-12 pl-5 pr-4 rounded-full bg-t text-bg font-semibold flex items-center gap-2 shadow-[0_12px_30px_-10px_rgb(0_0_0/0.5)]">
            Crear un reto <ArrowRight size={18} weight="bold" />
          </motion.button>
        </div>
      )}

      <ChallengeSheet challenge={current} profile={profile} today={today} onClose={() => setOpenC(null)} />
      <CreateChallenge open={creating} onClose={() => setCreating(false)} boxes={boxes} today={today} />
    </>
  )
}

/* ── Detail: progress, log, ranking ──────────────────────────────────────── */

function ChallengeSheet({ challenge: c, profile, today, onClose }: { challenge: ChallengeSummary | null; profile: Profile; today: string; onClose: () => void }) {
  const router = useRouter()
  const { fire } = useToast()
  const [amount, setAmount] = useState(10)
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const { viewMode } = useShell()
  const [edit, setEdit] = useState({ title: '', target: '', ends: '' })
  useEffect(() => {
    if (!c) return
    setAmount(c.unit === 'm' ? 400 : c.target >= 200 ? 25 : 10)
    setEdit({ title: c.title, target: String(c.target), ends: c.endsOn })
  }, [c])
  if (!c) return <Modal open={false} onClose={onClose}>{null}</Modal>

  const supabase = createClient()
  const active = isActive(c, today)
  const pct = Math.min(100, Math.round((c.myTotal / c.target) * 100))
  const canDelete = c.createdBy === profile.id || profile.role === 'coach'
  const managing = viewMode === 'coach' && canDelete
  const chips = c.unit === 'm' ? [100, 200, 400, 800, 1000] : [5, 10, 15, 20, 25, 50]

  async function act(fn: () => PromiseLike<{ error: any }>, ok: string) {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) { fire(isMissingTable(error) ? 'Falta aplicar la migración 008.' : friendlyError(error.message), 'error'); return false }
    fire(ok, 'pr'); router.refresh(); return true
  }

  return (
    <>
      <Modal open onClose={onClose} eyebrow={`Creado por ${c.creatorName.split(' ')[0]} · ${c.boxName}`} title={c.title}>
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-5 p-4 rounded-[24px] bg-p2">
            <Ring pct={pct} />
            <div className="min-w-0">
              <div className="font-display text-3xl font-bold tracking-tight tabular-nums"><AnimatedNumber value={c.myTotal} /><span className="text-mu text-lg">/{c.target}</span></div>
              <div className="text-mu text-sm">{UNIT_WORD[c.unit] ?? c.unit} de {c.movement}</div>
              <div className="text-xs text-mu mt-1">
                {formatDateOnly(c.startsOn, { day: 'numeric', month: 'short' })} – {formatDateOnly(c.endsOn, { day: 'numeric', month: 'short' })}
                {active && ` · quedan ${daysBetween(today, c.endsOn) + 1} días`}
              </div>
            </div>
          </div>

          {managing && (
            <div className="rounded-[24px] bg-p2 p-4 flex flex-col gap-3">
              <div className="text-[13px] font-semibold text-mu">Editar reto (coach)</div>
              <input value={edit.title} onChange={e => setEdit(v => ({ ...v, title: e.target.value }))} maxLength={80} aria-label="Nombre del reto"
                className="h-11 px-4 rounded-2xl bg-p outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 text-base sm:text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-xs text-mu mb-1 px-1">Meta ({UNIT_WORD[c.unit] ?? c.unit})</span>
                  <input value={edit.target} onChange={e => setEdit(v => ({ ...v, target: e.target.value.replace(/\D/g, '') }))} inputMode="numeric"
                    className="w-full h-11 px-4 rounded-2xl bg-p outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 text-base sm:text-sm tabular-nums" />
                </label>
                <label className="block">
                  <span className="block text-xs text-mu mb-1 px-1">Termina</span>
                  <input type="date" value={edit.ends} min={c.startsOn} onChange={e => setEdit(v => ({ ...v, ends: e.target.value }))}
                    className="w-full h-11 px-3 rounded-2xl bg-p outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 text-base sm:text-sm" />
                </label>
              </div>
              <button type="button" disabled={busy || !edit.title.trim() || !Number(edit.target) || !edit.ends}
                onClick={() => act(() => supabase.from('challenges').update({ title: edit.title.trim(), target: Number(edit.target), ends_on: edit.ends }).eq('id', c.id), 'Reto actualizado')}
                className="h-11 rounded-full bg-ac text-onac font-semibold disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          )}

          {!managing && c.joined && active && (
            <div className="rounded-[24px] bg-t text-bg p-4 flex flex-col gap-3">
              <div className="text-[13px] font-semibold text-bg/60">Sumar a mi total</div>
              <div className="flex gap-1 overflow-x-auto scrollbar-none -mx-1 px-1">
                {chips.map(n => (
                  <button key={n} type="button" onClick={() => setAmount(n)}
                    className={cn('relative isolate flex-shrink-0 h-10 min-w-[52px] px-3 rounded-full font-medium tabular-nums', amount === n ? 'text-t' : 'text-bg/75')}>
                    {amount === n && <ActivePill layoutId="ch-amount" className="rounded-full bg-bg" />}{n}
                  </button>
                ))}
              </div>
              <p className="text-center text-bg/80 text-[15px]">Hoy hice {amount} {UNIT_WORD[c.unit] ?? c.unit} de {c.movement}.</p>
              <button type="button" disabled={busy} onClick={() => act(() => supabase.from('challenge_entries').insert({ challenge_id: c.id, user_id: profile.id, amount }), `+${amount} sumadas`)}
                className="h-12 rounded-full bg-bg text-t font-semibold disabled:opacity-60 active:scale-[0.98] transition">{busy ? 'Guardando…' : 'Sumar'}</button>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2"><Users size={18} />Ranking</h3>
            {c.ranking.length === 0 ? <p className="text-mu text-sm">Nadie se ha sumado todavía.</p> : (
              <ol className="flex flex-col gap-1.5">
                {c.ranking.map((r, i) => (
                  <motion.li key={r.userId} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    className={cn('flex items-center gap-3 p-2.5 pr-4 rounded-2xl', r.userId === profile.id ? 'bg-or/15' : 'bg-p2')}>
                    <span className="w-6 text-center font-display font-bold text-mu">{i === 0 ? <Crown size={18} weight="fill" className="text-or mx-auto" /> : i + 1}</span>
                    {r.avatar ? <img src={r.avatar} alt="" className="size-9 rounded-full object-cover" />
                      : <span className="size-9 rounded-full bg-p3 grid place-items-center text-[11px] font-bold text-mu">{r.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>}
                    <span className="flex-1 min-w-0 font-medium text-sm leading-tight break-words">{r.userId === profile.id ? 'Tú' : r.name}</span>
                    <span className="font-display font-bold tabular-nums">{r.total}</span>
                    {r.total >= c.target && <Check size={14} weight="bold" className="text-gr" />}
                  </motion.li>
                ))}
              </ol>
            )}
          </div>

          {!managing && c.endsOn >= today && (
            c.joined
              ? <button type="button" disabled={busy} onClick={() => act(() => supabase.from('challenge_participants').delete().eq('challenge_id', c.id).eq('user_id', profile.id), 'Saliste del reto')}
                  className="h-11 rounded-full text-mu text-sm font-semibold hover:bg-p2">Salir del reto</button>
              : <ModalActions secondary="Ahora no" primary="Unirme al reto" onSecondary={onClose} busy={busy}
                  onPrimary={() => act(() => supabase.from('challenge_participants').insert({ challenge_id: c.id, user_id: profile.id }), '¡Te uniste al reto!')} />
          )}
          {canDelete && (
            <button type="button" onClick={() => setConfirmDel(true)} className="self-center inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-rd text-sm font-semibold hover:bg-rd/10">
              <Trash size={15} /> Eliminar reto
            </button>
          )}
        </div>
      </Modal>
      <ConfirmDialog open={confirmDel} danger busy={busy} title="¿Eliminar el reto?" body="Se borran el reto, sus participantes y lo que registraron."
        confirmLabel="Eliminar" onClose={() => setConfirmDel(false)}
        onConfirm={async () => { if (await act(() => supabase.from('challenges').delete().eq('id', c.id), 'Reto eliminado')) { setConfirmDel(false); onClose() } }} />
    </>
  )
}

function Ring({ pct }: { pct: number }) {
  const r = 30, C = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 72 72" className="size-[76px] -rotate-90 flex-shrink-0" aria-label={`${pct}%`}>
      <circle cx="36" cy="36" r={r} fill="none" strokeWidth="8" className="stroke-t/10" />
      <motion.circle cx="36" cy="36" r={r} fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-or" strokeDasharray={C}
        initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - pct / 100) }} transition={{ duration: 0.9, ease: EASE_OUT }} />
    </svg>
  )
}

/* ── Create ─────────────────────────────────────────────────────────────── */

const DURATIONS = [[1, 'Hoy'], [7, '7 días'], [14, '14 días'], [30, '30 días']] as const

function CreateChallenge({ open, onClose, boxes, today }: { open: boolean; onClose: () => void; boxes: { id: string; name: string }[]; today: string }) {
  const router = useRouter()
  const { fire } = useToast()
  const [catId, setCatId] = useState(CHALLENGE_EXERCISES[0].id)
  const [subIdx, setSubIdx] = useState(0)
  const [mov, setMov] = useState(CHALLENGE_EXERCISES[0].subs[0].items[0])
  const [target, setTarget] = useState(100)
  const cat = CHALLENGE_EXERCISES.find(c => c.id === catId) ?? CHALLENGE_EXERCISES[0]
  const sub = cat.subs[Math.min(subIdx, cat.subs.length - 1)]
  const [days, setDays] = useState<number>(7)
  const [boxId, setBoxId] = useState(boxes[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const unit = unitOfExercise(mov)
  const name = cleanExercise(mov)
  const auto = `${target} ${unit === 'reps' ? '' : `${UNIT_WORD[unit] ?? unit} de `}${name}${days === 1 ? ' hoy' : ` en ${days} días`}`
  const targets = TARGETS[unit] ?? TARGETS.reps
  function pickExercise(m: string) {
    setMov(m)
    const t = TARGETS[unitOfExercise(m)] ?? TARGETS.reps
    if (!t.includes(target)) setTarget(t[1] ?? t[0])
  }

  async function save() {
    setBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('challenges').insert({
      box_id: boxId, title: title.trim() || auto, movement: name, target, unit, starts_on: today, ends_on: addDaysISO(today, days - 1),
    }).select('id').single()
    if (!error && data) await supabase.from('challenge_participants').insert({ challenge_id: (data as any).id })
    setBusy(false)
    if (error) { fire(isMissingTable(error) ? 'Falta aplicar la migración 008 en Supabase.' : friendlyError(error.message), 'error'); return }
    fire('Reto creado. Tu box ya lo ve.', 'pr')
    setTitle(''); onClose(); router.refresh()
  }

  const chip = (on: boolean) => cn('relative isolate flex-shrink-0 h-10 px-4 rounded-full text-[15px] font-medium', on ? 'text-t' : 'text-bg/75')
  return (
    <Modal open={open} onClose={onClose} title={<>Nuevo <span className="text-or">reto</span></>} subtitle="Todos en tu box pueden sumarse.">
      <div className="rounded-[28px] bg-t text-bg p-4 flex flex-col gap-4">
        {/* 1. Category */}
        <div className="grid grid-cols-2 gap-1">
          {CHALLENGE_EXERCISES.map(c => (
            <button key={c.id} type="button" onClick={() => { setCatId(c.id); setSubIdx(0); pickExercise(c.subs[0].items[0]) }}
              className={cn(chip(catId === c.id), 'w-full px-2 whitespace-nowrap')}>
              {catId === c.id && <ActivePill layoutId="nc-cat" className="rounded-full bg-bg" />}{c.label}
            </button>
          ))}
        </div>
        {/* 2. Subcategory */}
        <div className="flex flex-wrap gap-1">
          {cat.subs.map((sb, k) => (
            <button key={sb.label} type="button" onClick={() => { setSubIdx(k); pickExercise(sb.items[0]) }}
              className={cn('relative isolate h-8 px-3 rounded-full text-[13px] font-semibold whitespace-nowrap', subIdx === k ? 'text-bg' : 'text-bg/60')}>
              {subIdx === k && <ActivePill layoutId="nc-sub" className="rounded-full bg-bg/15 ring-1 ring-inset ring-bg/30" />}{sb.label}
            </button>
          ))}
        </div>
        {/* 3. Exercise */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${catId}-${subIdx}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
            className="flex flex-wrap gap-1">
            {sub.items.map(m => (
              <button key={m} type="button" onClick={() => pickExercise(m)} className={cn(chip(mov === m), 'whitespace-nowrap')}>
                {mov === m && <ActivePill layoutId="nc-mov" className="rounded-full bg-bg" />}{cleanExercise(m)}
              </button>
            ))}
          </motion.div>
        </AnimatePresence>
        <div className="h-px bg-bg/15" />
        <div className="grid grid-cols-4 gap-1">
          {DURATIONS.map(([d, l]) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={cn(chip(days === d), 'w-full px-0 whitespace-nowrap')}>
              {days === d && <ActivePill layoutId="nc-days" className="rounded-full bg-bg" />}{l}
            </button>
          ))}
        </div>
        <div className="-mx-4 px-4 flex gap-1 overflow-x-auto scrollbar-none">
          {targets.map(n => (
            <button key={n} type="button" onClick={() => setTarget(n)} className={cn(chip(target === n), 'tabular-nums min-w-[60px] whitespace-nowrap')}>
              {target === n && <ActivePill layoutId="nc-target" className="rounded-xl bg-bg" />}{n}
            </button>
          ))}
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={auto} aria-label="Nombre del reto" maxLength={80}
          className="h-11 px-4 rounded-full bg-bg/10 text-bg placeholder:text-bg/50 outline-none text-base sm:text-sm" />
        {boxes.length > 1 && (
          <select value={boxId} onChange={e => setBoxId(e.target.value)} aria-label="Box" className="h-11 px-4 rounded-full bg-bg/10 text-bg outline-none text-sm">
            {boxes.map(b => <option key={b.id} value={b.id} className="text-black">{b.name}</option>)}
          </select>
        )}
        <p className="text-center text-[15px] text-bg/80">{title.trim() || auto}.</p>
        <button type="button" onClick={save} disabled={busy || !boxId} className="h-12 rounded-full bg-bg text-t font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
          <Plus size={18} weight="bold" />{busy ? 'Creando…' : 'Crear reto'}
        </button>
      </div>
    </Modal>
  )
}
