'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, labelCls } from '@/components/ui/Field'
import { Modal, ModalActions } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Avatar, BoxTabs, Empty, MigrationNotice, selectCls } from '@/components/manage/ui'
import { CalendarCheck, Check, X, Warning, UserPlus } from '@/components/ui/icons'
import { createClient } from '@/lib/supabase/client'
import { useShell } from '@/lib/hooks/useShell'
import { addDaysISO, daysBetween, formatDateOnly } from '@/lib/utils/dates'
import { PLAN_STATE_META, classesLeft, planState } from '@/lib/utils/membership'
import { WEEKDAYS, WEEKDAYS_SHORT, buildSessions, weekdayOf, type Session } from '@/lib/utils/schedule'
import { friendlyError } from '@/lib/utils/errors'
import { playSound } from '@/lib/utils/sound'
import { cn } from '@/lib/utils/cn'
import type { PersonLite } from '@/components/manage/ScheduleView'
import type { Profile, Box, ClassSlot, ClassOverride, ClassBooking, CoachIssue, Membership } from '@/lib/types/database'

const REASONS: Record<string, string> = {
  no_class: 'Esa clase ya no existe.', not_member: 'No eres parte de este box.', cancelled: 'Esa clase fue cancelada.',
  frozen: 'Tu plan está congelado. Habla con tu box para reactivarlo.', too_late: 'Esa clase ya empezó.', no_plan: 'No tienes un plan vigente en este box.', removed: 'Ya no eres parte de este box.', expired: 'Tu plan venció. Renuévalo en tu box para reservar.',
  no_classes: 'Ya usaste todas las clases de tu plan.', out_of_range: 'Solo puedes reservar hasta 30 días adelante.',
}

export function ClassesView({ profile, me, boxes, box, staff, today, slots, overrides, bookings, people, membership, issues, missing }: {
  profile: Profile; me: string; boxes: Box[]; box: Box | null; staff: boolean; today: string
  slots: ClassSlot[]; overrides: ClassOverride[]; bookings: ClassBooking[]; people: PersonLite[]; membership: Membership | null; issues: CoachIssue[]; missing: boolean
}) {
  const { viewMode } = useShell()
  const router = useRouter()
  const { fire } = useToast()
  const supabase = createClient()
  const coachView = staff && viewMode !== 'athlete'
  const dates = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i))
  const [day, setDay] = useState(today)
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<Session | null>(null)
  // Classes that already started can't be booked or cancelled by the athlete.
  const nowHM = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
  const started = (s: Session) => s.date < today || (s.date === today && s.time <= nowHM)
  const sessions = useMemo(() => buildSessions(slots, overrides, bookings, today, addDaysISO(today, 6), today), [slots, overrides, bookings, today])
  const nameOf = (id: string | null) => people.find(p => p.id === id)?.name ?? null
  const myStatus = (s: Session) => bookings.find(b => b.slot_id === s.slotId && b.class_date === s.date && b.user_id === me && b.status !== 'cancelled')?.status ?? null
  const state = planState(membership, today)
  const left = classesLeft(membership)

  async function book(s: Session) {
    setBusy(s.key)
    const { data, error } = await supabase.rpc('book_class', { p_slot: s.slotId, p_date: s.date })
    setBusy(null)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    if (data?.ok === false) { fire(REASONS[data.reason] ?? 'No se pudo reservar.', 'error'); return }
    playSound('success')
    fire(data?.status === 'waitlist' ? 'Clase llena: quedaste en lista de espera' : 'Reserva lista', data?.status === 'waitlist' ? 'info' : 'ok')
    router.refresh()
  }
  async function cancel(s: Session) {
    setBusy(s.key)
    const { error } = await supabase.rpc('cancel_booking', { p_slot: s.slotId, p_date: s.date })
    setBusy(null)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire('Reserva cancelada', 'info'); router.refresh()
  }

  const list = sessions.filter(s => s.date === day && (!coachView || s.coachId === me))
  const openSession = sessions.find(s => s.key === open) ?? null

  return (
    <>
      <Topbar title={coachView ? 'Mis clases' : 'Clases'} profile={profile} />
      <div className="p-4 lg:p-6 grid grid-cols-1 gap-4 max-w-2xl w-full">
        <BoxTabs boxes={boxes} current={box?.id ?? ''} base="/classes" />
        {missing && <MigrationNotice />}

        {!box ? (
          <Empty icon={<CalendarCheck size={26} />} title="Únete a un box para reservar" body="Con el código de invitación de tu box verás aquí sus clases y tu plan." />
        ) : slots.length === 0 ? (
          <Empty icon={<CalendarCheck size={26} />} title="Tu box aún no publica horarios" body="Cuando la administración arme la grilla de clases, aquí podrás reservar tu cupo." />
        ) : (
          <>
            {!coachView && membership && (
              <Card className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-mu">Tu plan</div>
                  <div className="font-display text-xl font-bold tracking-tight truncate">{membership.plan_name}</div>
                  <div className={cn('text-sm mt-0.5', state === 'expired' || state === 'no_classes' ? 'text-rd' : state === 'expiring' ? 'text-or' : 'text-mu')}>
                    {state === 'frozen' ? 'Congelado' : membership.ends_on < today ? `Venció el ${formatDateOnly(membership.ends_on, { day: 'numeric', month: 'short' })}`
                      : `Vence en ${daysBetween(today, membership.ends_on)} días`}
                    {left !== null ? ` · ${left} ${left === 1 ? 'clase' : 'clases'} por usar` : ''}
                  </div>
                </div>
                <Badge color={PLAN_STATE_META[state].color}>{PLAN_STATE_META[state].label}</Badge>
              </Card>
            )}

            <div className="grid grid-cols-7 gap-1">
              {dates.map(d => {
                const on = d === day
                const mineThatDay = sessions.some(s => s.date === d && (coachView ? s.coachId === me && !s.cancelled : !!myStatus(s)))
                return (
                  <button key={d} type="button" onClick={() => { playSound('tick'); setDay(d) }} aria-pressed={on}
                    className={cn('relative isolate h-16 rounded-2xl flex flex-col items-center justify-center gap-0.5', on ? 'text-onac' : 'bg-p')}>
                    {on && <motion.span layoutId="classes-day" className="absolute inset-0 -z-10 rounded-2xl bg-ac" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}
                    <span className="text-[11px] font-semibold">{d === today ? 'Hoy' : WEEKDAYS_SHORT[weekdayOf(d)]}</span>
                    <span className="font-display text-lg font-bold leading-none tabular-nums">{Number(d.slice(8))}</span>
                    <span className={cn('size-1.5 rounded-full', mineThatDay ? (on ? 'bg-onac' : 'bg-ac') : 'bg-transparent')} />
                  </button>
                )
              })}
            </div>

            <ul className="flex flex-col gap-2">
              {list.length === 0 && <li className="text-center text-mu text-sm py-10">{coachView ? 'No tienes clases asignadas este día.' : 'Sin clases este día.'}</li>}
              {list.map(s => {
                const mine = myStatus(s)
                const full = s.booked >= s.capacity
                const issue = issues.find(i => i.slot_id === s.slotId && i.class_date === s.date)
                return (
                  <li key={s.key} className={cn('p-4 rounded-[20px] bg-p flex items-center gap-4', s.cancelled && 'opacity-60')}>
                    <div className="w-14 flex-shrink-0">
                      <div className="font-display text-2xl font-bold tabular-nums leading-none tracking-tight">{s.time}</div>
                      <div className="text-[11px] text-fa mt-1">{s.durationMin} min</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{s.name}</div>
                      <div className="text-xs text-mu truncate">
                        {s.cancelled ? `Cancelada${s.cancelReason ? ` · ${s.cancelReason}` : ''}` : coachView ? `${s.booked} de ${s.capacity} inscritos${s.waitlist ? ` · ${s.waitlist} en espera` : ''}`
                          : `${nameOf(s.coachId)?.split(' ')[0] ?? 'Coach por confirmar'} · ${Math.max(0, s.capacity - s.booked)} cupos`}
                      </div>
                      {!s.cancelled && <div className="h-1 rounded-full bg-p3 overflow-hidden mt-2"><div className={cn('h-full rounded-full', full ? 'bg-or' : 'bg-ac')} style={{ width: `${Math.min(100, (s.booked / s.capacity) * 100)}%` }} /></div>}
                      {issue && <div className="text-xs text-or mt-1.5">{issue.status === 'open' ? 'Avisaste que no puedes. Esperando reemplazo.' : 'Ya tiene reemplazo.'}</div>}
                    </div>
                    {s.cancelled ? null : coachView ? (
                      <Button size="sm" variant="secondary" onClick={() => setOpen(s.key)}>Lista</Button>
                    ) : mine ? (
                      <button type="button" disabled={busy === s.key || started(s)} onClick={() => setCancelling(s)}
                        className={cn('h-10 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 flex-shrink-0', mine === 'waitlist' ? 'bg-or/15 text-or' : 'bg-gr/15 text-gr')}>
                        {mine === 'waitlist' ? 'En espera' : <><Check size={14} weight="bold" /> Reservada</>}
                      </button>
                    ) : started(s) ? <span className="text-xs text-fa flex-shrink-0">Ya empezó</span> : (
                      <Button size="sm" disabled={busy === s.key} variant={full ? 'secondary' : 'primary'} onClick={() => book(s)} className="flex-shrink-0">{full ? 'Lista de espera' : 'Reservar'}</Button>
                    )}
                  </li>
                )
              })}
            </ul>
            {!coachView && <p className="text-xs text-mu text-center text-pretty">Toca una reserva para cancelarla antes de que empiece la clase.</p>}
          </>
        )}
      </div>

      <ConfirmDialog open={!!cancelling} onClose={() => setCancelling(null)} busy={!!busy} confirmLabel="Cancelar reserva"
        title="¿Cancelar tu reserva?" body={cancelling ? `${WEEKDAYS[weekdayOf(cancelling.date)]} ${cancelling.time} · ${cancelling.name}. Si tu plan es por clases, la clase vuelve a tu plan.` : undefined}
        onConfirm={async () => { if (cancelling) await cancel(cancelling); setCancelling(null) }} />

      {openSession && box && (
        <RosterSheet key={openSession.key} box={box} me={me} s={openSession} people={people} today={today}
          bookings={bookings.filter(b => b.slot_id === openSession.slotId && b.class_date === openSession.date && b.status !== 'cancelled')}
          issue={issues.find(i => i.slot_id === openSession.slotId && i.class_date === openSession.date) ?? null}
          onClose={() => setOpen(null)} />
      )}
    </>
  )
}

/** Coach: who is coming, take attendance, add a walk-in, or report that you can't teach it. */
function RosterSheet({ box, me, s, people, bookings, issue, today, onClose }: {
  box: Box; me: string; s: Session; people: PersonLite[]; bookings: ClassBooking[]; issue: CoachIssue | null; today: string; onClose: () => void
}) {
  const router = useRouter()
  const { fire } = useToast()
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [reason, setReason] = useState('')
  const [walkIn, setWalkIn] = useState('')
  const who = (id: string) => people.find(p => p.id === id)
  const inClass = new Set(bookings.map(b => b.user_id))
  const others = people.filter(p => !inClass.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const sorted = [...bookings].sort((a, b) => (a.status === 'waitlist' ? 1 : 0) - (b.status === 'waitlist' ? 1 : 0) || (a.created_at < b.created_at ? -1 : 1))
  const canMark = s.date <= today

  async function call(p: PromiseLike<{ data?: any; error: any }>, ok?: string) {
    setBusy(true)
    const { error, data } = await p
    setBusy(false)
    if (error || data?.ok === false) { fire(error ? friendlyError(error.message) : REASONS[data.reason] ?? 'No se pudo.', 'error'); return false }
    if (data?.status === 'waitlist') fire('La clase está llena: quedó en lista de espera. Sube el cupo en Horarios para que cuente.', 'info')
    else if (ok) fire(ok, 'ok')
    router.refresh()
    return true
  }

  return (
    <>
      <Modal open onClose={onClose} eyebrow={`${WEEKDAYS[weekdayOf(s.date)]} ${formatDateOnly(s.date, { day: 'numeric', month: 'long' })}`} title={`${s.time} · ${s.name}`}
        subtitle={`${s.booked} de ${s.capacity} inscritos${canMark ? '. Marca quién vino.' : ''}`}>
        <div className="flex flex-col gap-4">
          {sorted.length === 0 ? <p className="text-sm text-mu">Nadie se ha inscrito todavía.</p> : (
            <ul className="flex flex-col gap-1.5">
              {sorted.map(b => {
                const p = who(b.user_id)
                return (
                  <li key={b.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-p2">
                    <Avatar name={p?.name ?? '?'} src={p?.avatar} size={36} />
                    <span className="text-sm font-medium flex-1 truncate">{p?.name ?? 'Persona'}</span>
                    {b.status === 'waitlist' ? <span className="text-xs font-semibold text-or pr-2">En espera</span> : canMark ? (
                      <div className="flex gap-1">
                        <button type="button" disabled={busy} aria-label="Asistió" aria-pressed={b.status === 'attended'}
                          onClick={() => call(supabase.rpc('mark_attendance', { p_booking: b.id, p_status: b.status === 'attended' ? 'booked' : 'attended' }))}
                          className={cn('size-10 rounded-full grid place-items-center', b.status === 'attended' ? 'bg-gr text-white' : 'bg-p3 text-mu')}><Check size={18} weight="bold" /></button>
                        <button type="button" disabled={busy} aria-label="No vino" aria-pressed={b.status === 'no_show'}
                          onClick={() => call(supabase.rpc('mark_attendance', { p_booking: b.id, p_status: b.status === 'no_show' ? 'booked' : 'no_show' }))}
                          className={cn('size-10 rounded-full grid place-items-center', b.status === 'no_show' ? 'bg-rd text-white' : 'bg-p3 text-mu')}><X size={18} weight="bold" /></button>
                      </div>
                    ) : <span className="text-xs text-mu pr-2">Inscrito</span>}
                  </li>
                )
              })}
            </ul>
          )}

          <div>
            <label className={labelCls} htmlFor="walkin">Agregar a alguien que llegó sin reservar</label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select id="walkin" className={selectCls} value={walkIn} onChange={e => setWalkIn(e.target.value)}>
                <option value="">Elegir persona</option>
                {others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <Button disabled={!walkIn || busy} aria-label="Agregar"
                onClick={async () => { if (await call(supabase.rpc('book_class', { p_slot: s.slotId, p_date: s.date, p_user: walkIn }), 'Agregado a la clase')) setWalkIn('') }}><UserPlus size={18} /></Button>
            </div>
          </div>

          {s.coachId === me && s.date >= today && (
            issue?.status === 'open' ? (
              <div className="p-3.5 rounded-2xl bg-or/10 text-sm flex items-center gap-3">
                <span className="flex-1 text-or">Avisaste que no puedes dar esta clase.</span>
                <button type="button" disabled={busy} className="text-sm font-semibold underline"
                  onClick={() => setWithdrawing(true)}>Retirar aviso</button>
              </div>
            ) : !issue && (
              <button type="button" onClick={() => setReporting(true)} className="h-11 rounded-full bg-rd/15 text-rd text-sm font-bold flex items-center justify-center gap-2">
                <Warning size={16} /> No puedo dar esta clase
              </button>
            )
          )}
        </div>
      </Modal>

      <ConfirmDialog open={withdrawing} onClose={() => setWithdrawing(false)} busy={busy} confirmLabel="Retirar aviso" title="¿Sí puedes dar la clase?"
        body="Se retira tu aviso y la administración deja de buscar reemplazo."
        onConfirm={async () => { if (issue && await call(supabase.from('coach_issues').delete().eq('id', issue.id), 'Aviso retirado')) setWithdrawing(false) }} />
      <Modal open={reporting} onClose={() => setReporting(false)} title="Avisar a la administración" subtitle="Le llega una alerta para asignar a otro coach en esta clase.">
        <form onSubmit={async e => {
          e.preventDefault()
          if (await call(supabase.from('coach_issues').insert({ box_id: box.id, coach_id: me, slot_id: s.slotId, class_date: s.date, reason: reason.trim() || null, status: 'open' }), 'Aviso enviado')) { setReporting(false); onClose() }
        }}>
          <Field label="Motivo (opcional)" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder="Enfermedad, viaje, tope de horario…" />
          <ModalActions secondary="Volver" primary="Enviar aviso" onSecondary={() => setReporting(false)} primaryType="submit" busy={busy} />
        </form>
      </Modal>
    </>
  )
}
