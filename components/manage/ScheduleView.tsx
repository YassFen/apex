'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { Field, labelCls } from '@/components/ui/Field'
import { Modal, ModalActions } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { Avatar, BoxTabs, Empty, MigrationNotice, Stat, selectCls } from '@/components/manage/ui'
import { Plus, CaretLeft, CaretRight, CalendarDays, Warning, UserSwitch, PencilSimple } from '@/components/ui/icons'
import { createClient } from '@/lib/supabase/client'
import { addDaysISO, formatDateOnly } from '@/lib/utils/dates'
import { WEEKDAYS, WEEKDAYS_SHORT, WEEK_ORDER, buildSessions, hhmm, hoursLabel, isLowDemand, isOverbooked, occupancy, weekdayOf, type Session } from '@/lib/utils/schedule'
import { friendlyError } from '@/lib/utils/errors'
import { cn } from '@/lib/utils/cn'
import type { Profile, Box, ClassSlot, ClassOverride, ClassBooking, CoachIssue } from '@/lib/types/database'

export interface PersonLite { id: string; name: string; avatar: string | null; role: string }

export function ScheduleView({ profile, box, boxes, today, from, people, slots, overrides, bookings, issues, missing }: {
  profile: Profile; box: Box; boxes: Box[]; today: string; from: string; people: PersonLite[]
  slots: ClassSlot[]; overrides: ClassOverride[]; bookings: ClassBooking[]; issues: CoachIssue[]; missing: boolean
}) {
  const to = addDaysISO(from, 6)
  const sessions = useMemo(() => buildSessions(slots, overrides, bookings, from, to), [slots, overrides, bookings, from, to])
  const coaches = people.filter(p => p.role !== 'athlete')
  const nameOf = (id: string | null) => people.find(p => p.id === id)?.name ?? null
  const dates = Array.from({ length: 7 }, (_, i) => addDaysISO(from, i))
  const [day, setDay] = useState(dates.includes(today) ? today : from)
  const [open, setOpen] = useState<string | null>(null)
  const [slotEdit, setSlotEdit] = useState<ClassSlot | 'new' | null>(null)
  const openSession = sessions.find(s => s.key === open) ?? null

  const live = sessions.filter(s => !s.cancelled)
  const hours = live.reduce((a, s) => a + s.durationMin / 60, 0)
  const past = live.filter(s => s.date <= today)
  const avgOcc = past.length ? Math.round((past.reduce((a, s) => a + Math.min(1, occupancy(s)), 0) / past.length) * 100) : null
  const noCoach = live.filter(s => !s.coachId && s.date >= today)
  const over = live.filter(s => isOverbooked(s) && s.date >= today)
  const low = past.filter(isLowDemand)
  const issueKeys = new Set(issues.map(i => `${i.slot_id}|${i.class_date}`))
  const href = (w: string) => `/manage/schedule?w=${w}${boxes.length > 1 ? `&box=${box.id}` : ''}`

  return (
    <>
      <Topbar title="Horarios" profile={profile} backHref={null} actions={
        <button type="button" onClick={() => setSlotEdit('new')} disabled={missing} aria-label="Nuevo horario"
          className="inline-flex items-center gap-1.5 h-10 px-3 sm:px-4 rounded-full bg-ac text-onac text-sm font-bold disabled:opacity-40">
          <Plus size={16} weight="bold" aria-hidden /><span className="hidden sm:inline">Nuevo horario</span>
        </button>
      } />
      <div className="p-4 lg:p-6 grid grid-cols-1 gap-4 w-full max-w-6xl">
        <BoxTabs boxes={boxes} current={box.id} base="/manage/schedule" />
        {missing && <MigrationNotice />}

        {/* Week switcher */}
        <div className="flex items-center justify-between gap-2">
          <Link href={href(addDaysISO(from, -7))} aria-label="Semana anterior" className="size-11 rounded-full bg-p grid place-items-center"><CaretLeft size={18} weight="bold" /></Link>
          <div className="text-center min-w-0">
            <div className="font-display text-lg font-bold tracking-tight">
              {formatDateOnly(from, { day: 'numeric', month: 'short' })} – {formatDateOnly(to, { day: 'numeric', month: 'short' })}
            </div>
            {!dates.includes(today) && <Link href={href(today)} className="text-xs text-ac font-semibold">Volver a esta semana</Link>}
          </div>
          <Link href={href(addDaysISO(from, 7))} aria-label="Semana siguiente" className="size-11 rounded-full bg-p grid place-items-center"><CaretRight size={18} weight="bold" /></Link>
        </div>

        {slots.length === 0 ? (
          <Empty icon={<CalendarDays size={26} />} title="Arma la grilla de clases" body="Crea cada horario una vez (por ejemplo lunes a viernes 19:00) y se repite todas las semanas. Luego asignas coach y cupos."
            action={<button type="button" onClick={() => setSlotEdit('new')} disabled={missing} className="h-12 px-6 rounded-full bg-ac text-onac font-bold disabled:opacity-40">Crear horario</button>} />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Clases esta semana" value={live.length} hint={sessions.length - live.length ? `${sessions.length - live.length} canceladas` : undefined} />
              <Stat label="Horas de clase" value={hoursLabel(hours)} />
              <Stat label="Ocupación promedio" value={avgOcc === null ? '—' : `${avgOcc}%`} hint="de las clases ya dadas" />
              <Stat label="Sin coach asignado" value={noCoach.length} tone={noCoach.length ? 'text-rd' : undefined} />
            </div>

            {(over.length > 0 || low.length > 0 || issues.length > 0) && (
              <ul className="flex flex-col gap-2">
                {issues.length > 0 && (
                  <li><Link href="/manage/coaches" className="flex gap-2.5 p-3.5 rounded-2xl bg-rd/10 text-rd text-sm"><Warning size={18} className="flex-shrink-0 mt-px" />
                    <span>{issues.length === 1 ? 'Un coach avisó que no puede dar una clase.' : `${issues.length} avisos de coaches que no pueden dar clase.`} Asigna reemplazo.</span></Link></li>
                )}
                {over.length > 0 && <li className="flex gap-2.5 p-3.5 rounded-2xl bg-or/10 text-or text-sm"><Warning size={18} className="flex-shrink-0 mt-px" />
                  <span>{over.length} {over.length === 1 ? 'clase llena con lista de espera' : 'clases llenas con lista de espera'}: {over.slice(0, 3).map(s => `${WEEKDAYS_SHORT[weekdayOf(s.date)]} ${s.time}`).join(', ')}. Considera subir el cupo o abrir otro horario.</span></li>}
                {low.length > 0 && <li className="flex gap-2.5 p-3.5 rounded-2xl bg-p text-mu text-sm"><Warning size={18} className="flex-shrink-0 mt-px" />
                  <span>{low.length} {low.length === 1 ? 'clase con poca demanda' : 'clases con poca demanda'} (menos del 30% del cupo): {low.slice(0, 3).map(s => `${WEEKDAYS_SHORT[weekdayOf(s.date)]} ${s.time}`).join(', ')}.</span></li>}
              </ul>
            )}

            {/* Day picker (phones) */}
            <div className="grid grid-cols-7 gap-1 lg:hidden">
              {dates.map(d => {
                const n = sessions.filter(s => s.date === d && !s.cancelled).length
                const on = d === day
                return (
                  <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={on}
                    className={cn('h-16 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors', on ? 'bg-ac text-onac' : 'bg-p', d === today && !on && 'ring-1 ring-inset ring-ac/60')}>
                    <span className="text-[11px] font-semibold">{WEEKDAYS_SHORT[weekdayOf(d)]}</span>
                    <span className="font-display text-lg font-bold leading-none tabular-nums">{Number(d.slice(8))}</span>
                    <span className={cn('text-[10px] tabular-nums', on ? 'opacity-70' : 'text-fa')}>{n || '·'}</span>
                  </button>
                )
              })}
            </div>

            {/* Grid: one column per day on desktop, the picked day on phones */}
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-2 lg:gap-2">
              {dates.map(d => {
                const list = sessions.filter(s => s.date === d)
                return (
                  <section key={d} className={cn('min-w-0 flex-col gap-2', d === day ? 'flex' : 'hidden lg:flex')}>
                    <h3 className={cn('hidden lg:block text-xs font-semibold px-1', d === today ? 'text-ac' : 'text-mu')}>
                      {WEEKDAYS_SHORT[weekdayOf(d)]} {Number(d.slice(8))}
                    </h3>
                    {list.length === 0 && <p className="text-sm text-mu lg:text-xs p-3 lg:p-1">Sin clases.</p>}
                    {list.map(s => <SessionCard key={s.key} s={s} coach={nameOf(s.coachId)} flagged={issueKeys.has(s.key)} past={s.date < today} onOpen={() => setOpen(s.key)} />)}
                  </section>
                )
              })}
            </div>
          </>
        )}
      </div>

      {openSession && (
        <SessionSheet key={openSession.key} box={box} s={openSession} coaches={coaches} people={people}
          bookings={bookings.filter(b => `${b.slot_id}|${b.class_date}` === openSession.key)}
          onClose={() => setOpen(null)} onEditSlot={() => { const sl = slots.find(x => x.id === openSession.slotId); setOpen(null); if (sl) setSlotEdit(sl) }} />
      )}
      {slotEdit && <SlotSheet key={slotEdit === 'new' ? 'new' : slotEdit.id} box={box} slot={slotEdit === 'new' ? null : slotEdit} coaches={coaches} defaultDay={weekdayOf(day)} onClose={() => setSlotEdit(null)} />}
    </>
  )
}

function SessionCard({ s, coach, flagged, past, onOpen }: { s: Session; coach: string | null; flagged: boolean; past: boolean; onOpen: () => void }) {
  const pct = Math.min(100, occupancy(s) * 100)
  const full = s.booked >= s.capacity
  return (
    <button type="button" onClick={onOpen}
      className={cn('tap-card w-full text-left p-3 rounded-2xl bg-p flex flex-col gap-1.5 min-w-0', s.cancelled && 'opacity-50', past && !s.cancelled && 'opacity-80')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-lg font-bold tabular-nums leading-none">{s.time}</span>
        <span className="text-[11px] text-fa">{s.durationMin} min</span>
      </div>
      <div className="text-xs font-semibold truncate">{s.name}</div>
      <div className={cn('text-xs truncate', s.cancelled ? 'text-rd' : !coach ? 'text-rd font-semibold' : flagged ? 'text-or' : 'text-mu')}>
        {s.cancelled ? 'Cancelada' : !coach ? 'Sin coach' : `${coach.split(' ')[0]}${s.regularCoachId ? ' (reemplazo)' : ''}${flagged ? ' · con problema' : ''}`}
      </div>
      {!s.cancelled && (
        <>
          <div className="h-1.5 rounded-full bg-p3 overflow-hidden"><div className={cn('h-full rounded-full', full ? 'bg-or' : 'bg-ac')} style={{ width: `${pct}%` }} /></div>
          <div className="text-[11px] text-mu tabular-nums">{s.booked}/{s.capacity}{s.waitlist ? ` · ${s.waitlist} en espera` : ''}</div>
        </>
      )}
    </button>
  )
}

function SessionSheet({ box, s, coaches, people, bookings, onClose, onEditSlot }: {
  box: Box; s: Session; coaches: PersonLite[]; people: PersonLite[]; bookings: ClassBooking[]; onClose: () => void; onEditSlot: () => void
}) {
  const router = useRouter()
  const { fire } = useToast()
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const [coach, setCoach] = useState(s.coachId ?? '')
  const [capacity, setCapacity] = useState(String(s.capacity))
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const who = (id: string) => people.find(p => p.id === id)
  const going = bookings.filter(b => b.status !== 'cancelled').sort((a, b) => (a.status === 'waitlist' ? 1 : 0) - (b.status === 'waitlist' ? 1 : 0) || (a.created_at < b.created_at ? -1 : 1))

  async function override(patch: Partial<ClassOverride>, ok: string) {
    setBusy(true)
    const { error } = await supabase.from('class_overrides').upsert({ slot_id: s.slotId, box_id: box.id, class_date: s.date, ...patch }, { onConflict: 'slot_id,class_date' })
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire(ok, 'ok'); onClose(); router.refresh()
  }
  const dirty = coach !== (s.coachId ?? '') || Number(capacity) !== s.capacity

  return (
    <>
      <Modal open onClose={onClose} eyebrow={`${WEEKDAYS[weekdayOf(s.date)]} ${formatDateOnly(s.date, { day: 'numeric', month: 'long' })}`} title={`${s.time} · ${s.name}`}
        subtitle={s.cancelled ? `Cancelada${s.cancelReason ? `: ${s.cancelReason}` : ''}` : `${s.booked} de ${s.capacity} cupos${s.waitlist ? ` · ${s.waitlist} en lista de espera` : ''}`}>
        <div className="flex flex-col gap-4">
          {!s.cancelled && (
            <>
              <div>
                <label className={labelCls} htmlFor="s-coach">Coach de este día</label>
                <select id="s-coach" className={selectCls} value={coach} onChange={e => setCoach(e.target.value)}>
                  <option value="">Sin coach</option>
                  {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <p className="text-xs text-mu mt-1.5">Cambia solo esta fecha. Para cambiarlo todas las semanas, edita el horario.</p>
              </div>
              <Field label="Cupo de este día" type="number" inputMode="numeric" min={1} max={200} value={capacity} onChange={e => setCapacity(e.target.value)} />
              {dirty && <Button disabled={busy} onClick={() => override({ coach_id: coach || null, capacity: Math.max(1, Number(capacity) || s.capacity), cancelled: false }, 'Clase actualizada')}><UserSwitch size={16} /> Guardar cambios de este día</Button>}
            </>
          )}

          <div>
            <div className="text-xs font-semibold text-mu mb-2">Inscritos</div>
            {going.length === 0 ? <p className="text-sm text-mu">Nadie se ha inscrito todavía.</p> : (
              <ul className="flex flex-col gap-1.5">
                {going.map(b => {
                  const p = who(b.user_id)
                  return (
                    <li key={b.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-p2">
                      <Avatar name={p?.name ?? '?'} src={p?.avatar} size={32} />
                      <span className="text-sm font-medium flex-1 truncate">{p?.name ?? 'Persona'}</span>
                      <span className={cn('text-xs font-semibold', b.status === 'waitlist' ? 'text-or' : b.status === 'no_show' ? 'text-rd' : b.status === 'attended' ? 'text-gr' : 'text-mu')}>
                        {b.status === 'waitlist' ? 'En espera' : b.status === 'no_show' ? 'No vino' : b.status === 'attended' ? 'Asistió' : 'Inscrito'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={onEditSlot}><PencilSimple size={16} /> Editar horario</Button>
            {s.cancelled
              ? <Button variant="secondary" disabled={busy} onClick={() => override({ cancelled: false, cancel_reason: null }, 'Clase reactivada')}>Reactivar clase</Button>
              : <Button variant="danger" onClick={() => setCancelling(true)}>Cancelar este día</Button>}
          </div>
        </div>
      </Modal>
      <Modal open={cancelling} onClose={() => setCancelling(false)} title="Cancelar esta clase" subtitle="Solo se cancela esta fecha. Los inscritos la verán como cancelada.">
        <form onSubmit={e => { e.preventDefault(); override({ cancelled: true, cancel_reason: reason.trim() || null }, 'Clase cancelada') }}>
          <Field label="Motivo (opcional)" maxLength={200} value={reason} onChange={e => setReason(e.target.value)} placeholder="Feriado, mantención, evento…" />
          <ModalActions secondary="Volver" primary="Cancelar clase" onSecondary={() => setCancelling(false)} primaryType="submit" busy={busy} danger />
        </form>
      </Modal>
    </>
  )
}

function SlotSheet({ box, slot, coaches, defaultDay, onClose }: { box: Box; slot: ClassSlot | null; coaches: PersonLite[]; defaultDay: number; onClose: () => void }) {
  const router = useRouter()
  const { fire } = useToast()
  const supabase = createClient()
  const [days, setDays] = useState<number[]>(slot ? [slot.weekday] : [defaultDay])
  const [time, setTime] = useState(slot ? hhmm(slot.start_time) : '19:00')
  const [duration, setDuration] = useState(String(slot?.duration_min ?? 60))
  const [name, setName] = useState(slot?.name ?? 'CrossFit')
  const [capacity, setCapacity] = useState(String(slot?.capacity ?? 16))
  const [coach, setCoach] = useState(slot?.coach_id ?? '')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!days.length) return
    setBusy(true)
    const base = { box_id: box.id, start_time: `${time}:00`, duration_min: Math.max(15, Number(duration) || 60), name: name.trim() || 'CrossFit', capacity: Math.max(1, Number(capacity) || 16), coach_id: coach || null, is_active: true }
    const { error } = slot
      ? await supabase.from('class_slots').update({ ...base, weekday: days[0] }).eq('id', slot.id)
      : await supabase.from('class_slots').insert(days.map(weekday => ({ ...base, weekday })))
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire(slot ? 'Horario actualizado' : days.length > 1 ? `${days.length} horarios creados` : 'Horario creado', 'ok'); onClose(); router.refresh()
  }
  async function remove() {
    if (!slot) return
    setBusy(true)
    const { error } = await supabase.from('class_slots').update({ is_active: false }).eq('id', slot.id)
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire('Horario eliminado', 'ok'); onClose(); router.refresh()
  }

  return (
    <>
      <Modal open onClose={onClose} title={slot ? 'Editar horario' : 'Nuevo horario'} subtitle={slot ? 'Vale para todas las semanas.' : 'Se repite cada semana en los días que elijas.'}>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div>
            <span className={labelCls}>{slot ? 'Día' : 'Días'}</span>
            <div className="grid grid-cols-7 gap-1">
              {WEEK_ORDER.map(d => {
                const on = days.includes(d)
                return (
                  <button key={d} type="button" aria-pressed={on}
                    onClick={() => setDays(slot ? [d] : on ? days.filter(x => x !== d) : [...days, d])}
                    className={cn('h-11 rounded-xl text-xs font-bold transition-colors', on ? 'bg-ac text-onac' : 'bg-p2 text-mu')}>
                    {WEEKDAYS_SHORT[d]}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hora" type="time" required value={time} onChange={e => setTime(e.target.value)} />
            <Field label="Duración (min)" type="number" inputMode="numeric" min={15} max={240} step={5} value={duration} onChange={e => setDuration(e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label="Nombre de la clase" maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="CrossFit, Halterofilia, Open Box…" />
            <Field label="Cupo" type="number" inputMode="numeric" min={1} max={200} value={capacity} onChange={e => setCapacity(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="slot-coach">Coach</label>
            <select id="slot-coach" className={selectCls} value={coach} onChange={e => setCoach(e.target.value)}>
              <option value="">Sin asignar</option>
              {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {slot && <button type="button" onClick={() => setConfirm(true)} className="text-sm font-semibold text-rd self-start h-10">Eliminar este horario</button>}
          <ModalActions secondary="Cancelar" primary={slot ? 'Guardar' : 'Crear'} onSecondary={onClose} primaryType="submit" busy={busy} disabled={!days.length} />
        </form>
      </Modal>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={remove} busy={busy} danger title="¿Eliminar este horario?"
        body="Deja de aparecer desde ahora en todas las semanas. Las asistencias ya registradas se conservan." confirmLabel="Eliminar" />
    </>
  )
}
