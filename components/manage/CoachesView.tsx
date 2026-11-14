'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { labelCls } from '@/components/ui/Field'
import { Modal, ModalActions } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { Avatar, BoxTabs, Empty, MigrationNotice, SectionTitle, Stat, selectCls } from '@/components/manage/ui'
import { CaretLeft, CaretRight, ChalkboardTeacher, Warning, CheckCircle } from '@/components/ui/icons'
import { createClient } from '@/lib/supabase/client'
import { addDaysISO, formatDateOnly } from '@/lib/utils/dates'
import { WEEKDAYS, WEEKDAYS_SHORT, WEEK_ORDER, buildSessions, coachLoad, hhmm, hoursLabel, weekdayOf } from '@/lib/utils/schedule'
import { friendlyError } from '@/lib/utils/errors'
import { cn, roleLabel } from '@/lib/utils/cn'
import type { PersonLite } from '@/components/manage/ScheduleView'
import type { Profile, Box, ClassSlot, ClassOverride, ClassBooking, CoachIssue } from '@/lib/types/database'

export function CoachesView({ profile, box, boxes, today, period, from, to, coaches, slots, overrides, bookings, issues, missing }: {
  profile: Profile; box: Box; boxes: Box[]; today: string; period: 'week' | 'month'; from: string; to: string; coaches: PersonLite[]
  slots: ClassSlot[]; overrides: ClassOverride[]; bookings: Pick<ClassBooking, 'slot_id' | 'class_date' | 'status'>[]; issues: CoachIssue[]; missing: boolean
}) {
  const sessions = useMemo(() => buildSessions(slots, overrides, bookings, from, to), [slots, overrides, bookings, from, to])
  const load = useMemo(() => coachLoad(sessions), [sessions])
  const [resolving, setResolving] = useState<CoachIssue | null>(null)
  const nameOf = (id: string | null) => coaches.find(c => c.id === id)?.name ?? 'Coach'
  const openIssues = issues.filter(i => i.status === 'open' && i.class_date >= today)
  const doneIssues = issues.filter(i => i.status === 'resolved').slice(-5).reverse()
  const unassigned = sessions.filter(s => !s.cancelled && !s.coachId && s.date >= today)
  const idle = coaches.filter(c => !slots.some(s => s.is_active && s.coach_id === c.id))
  const totalHours = [...load.values()].reduce((a, c) => a + c.hours, 0)
  const maxHours = Math.max(1, ...[...load.values()].map(c => c.hours))
  const q = (p: string, d: string) => `/manage/coaches?p=${p}&d=${d}${boxes.length > 1 ? `&box=${box.id}` : ''}`
  const step = (dir: 1 | -1) => period === 'month' ? addDaysISO(dir === 1 ? to : from, dir) : addDaysISO(from, 7 * dir)
  const slotOf = (id: string | null) => slots.find(s => s.id === id)

  return (
    <>
      <Topbar title="Coaches" profile={profile} backHref={null} />
      <div className="p-4 lg:p-6 grid grid-cols-1 gap-4 max-w-3xl w-full">
        <BoxTabs boxes={boxes} current={box.id} base="/manage/coaches" />
        {missing && <MigrationNotice />}

        {/* Alerts first: what needs a decision today */}
        {openIssues.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-rd flex items-center gap-1.5"><Warning size={14} weight="fill" /> No pueden dar clase</h2>
            {openIssues.map(i => {
              const sl = slotOf(i.slot_id)
              return (
                <div key={i.id} className="p-3.5 rounded-2xl bg-rd/10 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{nameOf(i.coach_id)} · {WEEKDAYS[weekdayOf(i.class_date)]} {formatDateOnly(i.class_date, { day: 'numeric', month: 'short' })}{sl ? ` · ${hhmm(sl.start_time)}` : ''}</div>
                    {i.reason && <div className="text-xs text-mu mt-0.5 text-pretty">{i.reason}</div>}
                  </div>
                  <Button size="sm" onClick={() => setResolving(i)}>Reemplazo</Button>
                </div>
              )
            })}
          </section>
        )}
        {unassigned.length > 0 && (
          <Link href="/manage/schedule" className="flex gap-2.5 p-3.5 rounded-2xl bg-or/10 text-or text-sm">
            <Warning size={18} className="flex-shrink-0 mt-px" />
            <span>{unassigned.length} {unassigned.length === 1 ? 'clase sin coach' : 'clases sin coach'} en este periodo: {unassigned.slice(0, 3).map(s => `${WEEKDAYS_SHORT[weekdayOf(s.date)]} ${s.time}`).join(', ')}. Asígnalas en Horarios.</span>
          </Link>
        )}
        {idle.length > 0 && slots.length > 0 && (
          <div className="flex gap-2.5 p-3.5 rounded-2xl bg-p text-mu text-sm">
            <Warning size={18} className="flex-shrink-0 mt-px" />
            <span>Sin clases asignadas: {idle.map(c => c.name.split(' ')[0]).join(', ')}.</span>
          </div>
        )}

        {/* Period */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-p2">
          {(['week', 'month'] as const).map(p => (
            <Link key={p} href={q(p, today)} aria-current={period === p} className={cn('min-h-10 rounded-xl text-sm font-bold grid place-items-center', period === p ? 'bg-p3 text-t' : 'text-mu')}>
              {p === 'week' ? 'Semana' : 'Mes'}
            </Link>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Link href={q(period, step(-1))} aria-label="Anterior" className="size-11 rounded-full bg-p grid place-items-center"><CaretLeft size={18} weight="bold" /></Link>
          <div className="font-display text-lg font-bold tracking-tight text-center">
            {period === 'month' ? formatDateOnly(from, { month: 'long', year: 'numeric' }) : `${formatDateOnly(from, { day: 'numeric', month: 'short' })} – ${formatDateOnly(to, { day: 'numeric', month: 'short' })}`}
          </div>
          <Link href={q(period, step(1))} aria-label="Siguiente" className="size-11 rounded-full bg-p grid place-items-center"><CaretRight size={18} weight="bold" /></Link>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Coaches" value={coaches.length} />
          <Stat label="Horas en el periodo" value={hoursLabel(totalHours)} />
          <Stat label="Clases" value={sessions.filter(s => !s.cancelled).length} />
        </div>

        {coaches.length === 0 ? (
          <Empty icon={<ChalkboardTeacher size={26} />} title="Aún no hay coaches" body="Abre la ficha de una persona en Personas y cámbiale el rol a Coach." />
        ) : (
          <ul className="flex flex-col gap-3 stagger">
            {coaches.map(c => {
              const l = load.get(c.id) ?? { hours: 0, classes: 0, athletes: 0 }
              const mine = slots.filter(s => s.is_active && s.coach_id === c.id)
              const weekly = mine.reduce((a, s) => a + s.duration_min / 60, 0)
              return (
                <li key={c.id}>
                  <Card className="flex flex-col gap-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} src={c.avatar} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/manage/members/${c.id}`} className="font-semibold text-sm truncate block hover:underline">{c.name}</Link>
                        <div className="text-xs text-mu">{roleLabel(c.role)} · {hoursLabel(weekly)} por semana fijas</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-display text-2xl font-bold tabular-nums leading-none tracking-tight">{hoursLabel(l.hours)}</div>
                        <div className="text-[11px] text-fa mt-0.5">{l.classes} clases · {l.athletes} asistentes</div>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-p3 overflow-hidden"><div className="h-full rounded-full bg-ac" style={{ width: `${(l.hours / maxHours) * 100}%` }} /></div>
                    {mine.length === 0 ? <p className="text-xs text-or">Sin horarios asignados.</p> : (
                      <div className="grid grid-cols-7 gap-1" aria-label={`Horario semanal de ${c.name}`}>
                        {WEEK_ORDER.map(d => (
                          <div key={d} className="min-w-0">
                            <div className="text-[10px] text-fa text-center mb-1">{WEEKDAYS_SHORT[d]}</div>
                            <div className="flex flex-col gap-1">
                              {mine.filter(s => s.weekday === d).map(s => (
                                <span key={s.id} title={s.name} className="h-6 rounded-md bg-ac/15 text-ac text-[10px] font-bold grid place-items-center tabular-nums">{hhmm(s.start_time)}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </li>
              )
            })}
          </ul>
        )}

        {doneIssues.length > 0 && (
          <>
            <SectionTitle>Reemplazos recientes</SectionTitle>
            <ul className="flex flex-col gap-2">
              {doneIssues.map(i => (
                <li key={i.id} className="p-3.5 rounded-2xl bg-p flex items-center gap-3 text-sm">
                  <CheckCircle size={18} className="text-gr flex-shrink-0" weight="fill" />
                  <span className="min-w-0 flex-1">{formatDateOnly(i.class_date, { day: 'numeric', month: 'short' })}: {nameOf(i.coach_id).split(' ')[0]} → {i.replacement_id ? nameOf(i.replacement_id).split(' ')[0] : 'clase cancelada'}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {resolving && <ResolveSheet key={resolving.id} box={box} issue={resolving} coaches={coaches} slot={slotOf(resolving.slot_id)} onClose={() => setResolving(null)} />}
    </>
  )
}

/** Pick who covers the class (or cancel it); the change applies to that date only. */
function ResolveSheet({ box, issue, coaches, slot, onClose }: { box: Box; issue: CoachIssue; coaches: PersonLite[]; slot?: ClassSlot; onClose: () => void }) {
  const router = useRouter()
  const { fire } = useToast()
  const supabase = createClient()
  const others = coaches.filter(c => c.id !== issue.coach_id)
  const [pick, setPick] = useState(others[0]?.id ?? '')
  const [busy, setBusy] = useState(false)

  async function resolve(cancel: boolean) {
    setBusy(true)
    if (issue.slot_id) {
      const { error } = await supabase.from('class_overrides').upsert(
        cancel ? { slot_id: issue.slot_id, box_id: box.id, class_date: issue.class_date, cancelled: true, cancel_reason: 'Sin coach disponible' }
               : { slot_id: issue.slot_id, box_id: box.id, class_date: issue.class_date, coach_id: pick, cancelled: false },
        { onConflict: 'slot_id,class_date' })
      if (error) { setBusy(false); fire(friendlyError(error.message), 'error'); return }
    }
    const { error } = await supabase.from('coach_issues').update({ status: 'resolved', replacement_id: cancel ? null : pick, resolved_at: new Date().toISOString() }).eq('id', issue.id)
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire(cancel ? 'Clase cancelada' : 'Reemplazo asignado', 'ok'); onClose(); router.refresh()
  }

  return (
    <Modal open onClose={onClose} title="Asignar reemplazo"
      subtitle={`${WEEKDAYS[weekdayOf(issue.class_date)]} ${formatDateOnly(issue.class_date, { day: 'numeric', month: 'long' })}${slot ? ` a las ${hhmm(slot.start_time)}` : ''}. El cambio vale solo para ese día.`}>
      {others.length === 0 ? <p className="text-sm text-mu">No hay otro coach en el box. Puedes cancelar la clase de ese día.</p> : (
        <div>
          <label className={labelCls} htmlFor="rep">Quién la cubre</label>
          <select id="rep" className={selectCls} value={pick} onChange={e => setPick(e.target.value)}>
            {others.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <button type="button" disabled={busy} onClick={() => resolve(true)} className="mt-4 text-sm font-semibold text-rd h-10">Cancelar la clase de ese día</button>
      <ModalActions secondary="Volver" primary="Asignar" onSecondary={onClose} onPrimary={() => resolve(false)} busy={busy} disabled={!pick} />
    </Modal>
  )
}
