'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, inputBase, labelCls } from '@/components/ui/Field'
import { Modal, ModalActions } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { Avatar, MigrationNotice, SectionTitle, Stat, selectCls } from '@/components/manage/ui'
import { Snowflake, Play, ArrowsClockwise, Ticket, EnvelopeSimple, Phone, WhatsappLogo } from '@/components/ui/icons'
import { createClient } from '@/lib/supabase/client'
import { addDaysISO, daysBetween, formatDateOnly, toDateInput } from '@/lib/utils/dates'
import { MEMBERSHIP_EVENT_LABEL, PLAN_STATE_META, classesLeft, currentMembership, planState, reactivateMembership, upcomingMembership } from '@/lib/utils/membership'
import { friendlyError, isMissingColumn } from '@/lib/utils/errors'
import { cn, roleLabel } from '@/lib/utils/cn'
import type { Person } from '@/lib/utils/admin-box'
import type { Profile, Box, Membership, MembershipEvent, MembershipPlan, MemberFile } from '@/lib/types/database'

const fmt = (d: string) => formatDateOnly(d, { day: 'numeric', month: 'short', year: 'numeric' })
const GAP_DAYS = 14
const ROLE_REASONS: Record<string, string> = {
  owner: 'El dueño del box siempre es administrador.',
  not_member: 'Esta persona está dada de baja. Reactiva su cuenta antes de cambiarle el rol.',
}

export function MemberFileView({ profile, box, person, me, today, days, memberships, events, plans, file, missing }: {
  profile: Profile; box: Box; person: Person; me: string; today: string; days: string[]
  memberships: Membership[]; events: MembershipEvent[]; plans: MembershipPlan[]; file: MemberFile | null; missing: boolean
}) {
  const router = useRouter()
  const { fire } = useToast()
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<null | 'assign' | 'freeze' | 'adjust'>(null)
  const [confirm, setConfirm] = useState<null | 'cancel' | 'deactivate'>(null)

  const m = currentMembership(memberships, today)
  const next = upcomingMembership(memberships, today)
  const state = planState(m, today)
  const meta = PLAN_STATE_META[state]
  const left = classesLeft(m)

  /* ── Attendance ── */
  const monthKey = today.slice(0, 7)
  const prevKey = addDaysISO(`${monthKey}-01`, -1).slice(0, 7)
  const thisMonth = days.filter(d => d.startsWith(monthKey)).length
  const prevMonth = days.filter(d => d.startsWith(prevKey)).length
  const last = days[days.length - 1] ?? null
  const months = useMemo(() => {
    const out: { key: string; label: string; n: number }[] = []
    let k = `${monthKey}-01`
    for (let i = 0; i < 6; i++) {
      const key = k.slice(0, 7)
      out.unshift({ key, label: formatDateOnly(k, { month: 'short' }).replace('.', ''), n: days.filter(d => d.startsWith(key)).length })
      k = `${addDaysISO(k, -1).slice(0, 7)}-01`
    }
    return out
  }, [days, monthKey])
  const maxMonth = Math.max(1, ...months.map(x => x.n))
  // Stretches of 14+ days without coming, most recent first.
  const gaps = useMemo(() => {
    const out: { from: string; to: string | null; days: number }[] = []
    for (let i = 1; i < days.length; i++) {
      const n = daysBetween(days[i - 1], days[i])
      if (n >= GAP_DAYS) out.push({ from: days[i - 1], to: days[i], days: n })
    }
    if (last && daysBetween(last, today) >= GAP_DAYS) out.push({ from: last, to: null, days: daysBetween(last, today) })
    return out.reverse()
  }, [days, last, today])

  async function run(fn: () => Promise<{ error: any } | void>, ok: string) {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (res && res.error) { fire(friendlyError(res.error.message), 'error'); return false }
    fire(ok, 'ok'); setSheet(null); setConfirm(null); router.refresh()
    return true
  }
  const log = (membershipId: string, type: MembershipEvent['type'], extra: { reason?: string | null; days?: number } = {}) =>
    supabase.from('membership_events').insert({ membership_id: membershipId, box_id: box.id, user_id: person.id, type, happened_on: today, created_by: me, reason: extra.reason ?? null, days: extra.days ?? null })

  const reactivate = () => run(async () => {
    if (!m) return
    // Gives back the frozen days and moves a renewal already loaded by the same days.
    const { error } = await reactivateMembership(supabase, m, memberships, today, me)
    if (error) return { error }
  }, next ? 'Plan reactivado. La renovación se corrió los días congelados' : 'Plan reactivado')

  // The plan to cancel: the one in force, or the one waiting to start.
  const target = m ?? next
  const cancelPlan = () => run(async () => {
    if (!target) return
    const { error } = await supabase.from('memberships').update({ status: 'cancelled' }).eq('id', target.id)
    if (error) return { error }
    return log(target.id, 'cancelled')
  }, 'Plan cancelado')

  const setActive = (on: boolean) => run(async () => {
    const full = await supabase.from('box_members').update({ is_active: on, left_at: on ? null : new Date().toISOString() }).eq('box_id', box.id).eq('user_id', person.id)
    // Only when the server doesn't have the "left on" date yet: switch the account without it.
    if (!full.error || !isMissingColumn(full.error)) return full
    return supabase.from('box_members').update({ is_active: on }).eq('box_id', box.id).eq('user_id', person.id)
  }, on ? 'Cuenta reactivada' : 'Cuenta desactivada')

  const setRole = (role: string) => run(async () => {
    const { data, error } = await supabase.rpc('set_member_role', { p_box: box.id, p_user: person.id, p_role: role })
    if (error) return { error }
    if (data && data.ok === false) return { error: { message: ROLE_REASONS[data.reason as string] ?? 'No se pudo cambiar el rol. Inténtalo de nuevo.' } }
  }, 'Rol actualizado')

  const phone = file?.phone?.replace(/[^\d+]/g, '') ?? ''

  return (
    <>
      <Topbar title="Ficha" profile={profile} backHref={`/manage/members?box=${box.id}`} />
      <div className="p-4 lg:p-6 grid grid-cols-1 gap-4 max-w-3xl w-full">
        {missing && <MigrationNotice />}

        {/* Identity */}
        <Card className="flex items-center gap-4">
          <Avatar name={person.name} src={person.avatar} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-2xl font-bold tracking-tight truncate">{person.name}</h2>
              <Badge color={person.role === 'athlete' ? 'neutral' : 'lime'}>{roleLabel(person.role)}</Badge>
            </div>
            <div className="text-sm text-mu truncate">{person.email}</div>
            <div className="text-xs text-fa mt-1">
              En el box desde {fmt(toDateInput(person.joinedAt))} · {person.isActive ? 'Cuenta activa' : `Cuenta desactivada${person.leftAt ? ` el ${fmt(toDateInput(person.leftAt))}` : ''}`}
            </div>
          </div>
        </Card>
        <div className="flex gap-2 flex-wrap -mt-1">
          {person.email && <a href={`mailto:${person.email}`} className="h-10 px-4 rounded-full bg-p text-sm font-semibold inline-flex items-center gap-2"><EnvelopeSimple size={16} /> Correo</a>}
          {phone && <a href={`tel:${phone}`} className="h-10 px-4 rounded-full bg-p text-sm font-semibold inline-flex items-center gap-2"><Phone size={16} /> Llamar</a>}
          {phone && <a href={`https://wa.me/${phone.replace('+', '')}`} target="_blank" rel="noreferrer" className="h-10 px-4 rounded-full bg-p text-sm font-semibold inline-flex items-center gap-2"><WhatsappLogo size={16} /> WhatsApp</a>}
        </div>

        {/* Plan */}
        <Card className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-mu">Plan contratado</div>
              <div className="font-display text-2xl font-bold tracking-tight mt-0.5 truncate">{m?.plan_name ?? next?.plan_name ?? 'Sin plan'}</div>
              {m && <div className="text-sm text-mu mt-0.5">{fmt(m.starts_on)} → {fmt(m.ends_on)}</div>}
              {!m && next && <div className="text-sm text-mu mt-0.5">Empieza el {fmt(next.starts_on)} · vence el {fmt(next.ends_on)}</div>}
            </div>
            {!m && next ? <Badge color="blue">Por empezar</Badge> : <Badge color={meta.color}>{meta.label}</Badge>}
          </div>
          {m && state !== 'frozen' && (
            <div className="text-sm">
              {m.ends_on < today ? <span className="text-rd">Venció hace {daysBetween(m.ends_on, today)} días</span>
                : <span className={state === 'expiring' ? 'text-or' : 'text-mu'}>Vence en {daysBetween(today, m.ends_on)} días</span>}
            </div>
          )}
          {m?.status === 'frozen' && m.frozen_on && (
            <div className="text-sm text-bl">
              Congelado desde {fmt(m.frozen_on)} ({daysBetween(m.frozen_on, today)} días). Al reactivar, esos días se suman al vencimiento{memberships.some(x => x.id !== m.id && x.status !== 'cancelled' && x.starts_on > m.starts_on) ? ' y la renovación se corre los mismos días' : ''}. Mientras tanto no puede reservar clases.
            </div>
          )}
          {m && next && next.id !== m.id && (
            <div className="text-sm text-gr">Renovación cargada: {next.plan_name} desde el {fmt(next.starts_on)}.</div>
          )}
          {m?.kind === 'classes' && (
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-mu">Clases usadas</span>
                <span className="font-semibold tabular-nums">{m.classes_used} de {m.classes_total ?? 0} · quedan {left}</span>
              </div>
              <div className="h-2 rounded-full bg-p3 overflow-hidden">
                <div className={cn('h-full rounded-full', left === 0 ? 'bg-rd' : 'bg-ac')} style={{ width: `${Math.min(100, (m.classes_used / Math.max(1, m.classes_total ?? 1)) * 100)}%` }} />
              </div>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => setSheet('assign')} disabled={missing}><ArrowsClockwise size={15} /> {m ? 'Renovar o cambiar' : 'Asignar plan'}</Button>
            {m?.status === 'active' && state !== 'expired' && <Button size="sm" variant="secondary" onClick={() => setSheet('freeze')}><Snowflake size={15} /> Congelar</Button>}
            {m?.status === 'frozen' && <Button size="sm" variant="secondary" onClick={reactivate} disabled={busy}><Play size={15} /> Reactivar</Button>}
            {m?.kind === 'classes' && <Button size="sm" variant="secondary" onClick={() => setSheet('adjust')}><Ticket size={15} /> Ajustar clases</Button>}
            {target && <Button size="sm" variant="danger" onClick={() => setConfirm('cancel')}>Cancelar plan</Button>}
          </div>
        </Card>

        {/* Attendance */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Asistencias este mes" value={thisMonth} hint={`${prevMonth} el mes anterior`} />
          <Stat label="Última clase" value={last ? (daysBetween(last, today) === 0 ? 'Hoy' : `${daysBetween(last, today)} d`) : '—'} hint={last ? fmt(last) : 'Aún no viene'}
            tone={last && daysBetween(last, today) >= GAP_DAYS ? 'text-or' : undefined} />
          <Stat label="Clases disponibles" value={left ?? (m ? '∞' : '—')} hint={m?.kind === 'classes' ? 'del plan actual' : m ? 'Plan ilimitado' : 'Sin plan'} />
        </div>
        <Card>
          <div className="text-xs font-semibold text-mu mb-3">Asistencia por mes</div>
          <div className="flex items-end gap-2 h-28" role="img" aria-label={`Asistencia de los últimos 6 meses: ${months.map(x => `${x.label} ${x.n}`).join(', ')}`}>
            {months.map(x => (
              <div key={x.key} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                <span className="text-xs font-semibold tabular-nums">{x.n}</span>
                <div className={cn('w-full rounded-t-lg', x.key === monthKey ? 'bg-ac' : 'bg-p3')} style={{ height: `${Math.max(4, (x.n / maxMonth) * 70)}%` }} />
                <span className="text-[11px] text-mu">{x.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <ContactCard box={box} person={person} file={file} disabled={missing} onSaved={() => { fire('Ficha guardada', 'ok'); router.refresh() }} />

        {/* Plan history */}
        <SectionTitle>Movimientos del plan</SectionTitle>
        {events.length === 0 ? <p className="text-sm text-mu">Sin movimientos todavía.</p> : (
          <ul className="flex flex-col gap-2">
            {events.map(e => (
              <li key={e.id} className="p-3.5 rounded-2xl bg-p flex items-start gap-3">
                <span className={cn('mt-1.5 size-2 rounded-full flex-shrink-0', e.type === 'frozen' ? 'bg-bl' : e.type === 'cancelled' ? 'bg-rd' : e.type === 'adjusted' ? 'bg-or' : 'bg-gr')} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">
                    {MEMBERSHIP_EVENT_LABEL[e.type] ?? e.type}
                    {e.type === 'reactivated' && e.days !== null ? ` · ${e.days} días congelado` : ''}
                  </div>
                  {e.reason && <div className="text-xs text-mu mt-0.5 text-pretty">{e.reason}</div>}
                </div>
                <span className="text-xs text-fa flex-shrink-0 tabular-nums">{fmt(e.happened_on)}</span>
              </li>
            ))}
          </ul>
        )}

        <SectionTitle>Historial de inactividad</SectionTitle>
        {gaps.length === 0 ? <p className="text-sm text-mu">Sin periodos de {GAP_DAYS} días o más sin venir en los últimos 6 meses.</p> : (
          <ul className="flex flex-col gap-2">
            {gaps.map(g => (
              <li key={g.from} className="p-3.5 rounded-2xl bg-p flex items-center justify-between gap-3">
                <span className="text-sm">{fmt(g.from)} → {g.to ? fmt(g.to) : 'hoy'}</span>
                <span className={cn('text-sm font-semibold tabular-nums', g.to ? 'text-mu' : 'text-or')}>{g.days} días{g.to ? '' : ' y sigue'}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Account */}
        <SectionTitle>Cuenta en el box</SectionTitle>
        <Card className="flex flex-col gap-4">
          <div>
            <label className={labelCls} htmlFor="role">Rol</label>
            <select id="role" className={selectCls} value={person.role} disabled={busy || person.isOwner || person.id === me || !person.isActive} onChange={e => setRole(e.target.value)}>
              <option value="athlete">Atleta</option>
              <option value="coach">Coach</option>
              <option value="admin">Administrador</option>
            </select>
            <p className="text-xs text-mu mt-1.5">{person.isOwner ? 'El dueño del box siempre es administrador.' : !person.isActive ? 'Reactiva la cuenta para cambiarle el rol.' : 'Un coach publica WODs y pasa lista. Un administrador además gestiona personas, planes y horarios.'}</p>
          </div>
          {!person.isOwner && person.id !== me && (
            person.isActive
              ? <Button variant="danger" onClick={() => setConfirm('deactivate')}>Dar de baja del box</Button>
              : <Button variant="secondary" onClick={() => setActive(true)} disabled={busy}>Reactivar cuenta</Button>
          )}
        </Card>
      </div>

      {sheet === 'assign' && <AssignSheet open onClose={() => setSheet(null)} plans={plans} today={today} current={next ?? m} busy={busy}
        onSave={(plan, start) => run(async () => {
          const { data, error } = await supabase.from('memberships').insert({
            box_id: box.id, user_id: person.id, plan_id: plan.id, plan_name: plan.name, kind: plan.kind, starts_on: start,
            ends_on: addDaysISO(start, plan.duration_days - 1), classes_total: plan.kind === 'classes' ? plan.classes_count : null, classes_used: 0, status: 'active', created_by: me,
          }).select('id').single()
          if (error || !data) return { error: error ?? { message: 'No se pudo guardar' } }
          return log((data as any).id, m ? 'renewed' : 'assigned', { reason: plan.name })
        }, m ? 'Plan renovado' : 'Plan asignado')} />}

      {sheet === 'freeze' && <ReasonSheet open onClose={() => setSheet(null)} busy={busy} title="Congelar plan"
        subtitle="El plan se pausa desde hoy. Al reactivarlo, los días congelados se suman a la fecha de vencimiento." label="Motivo (opcional)" cta="Congelar"
        onSave={reason => run(async () => {
          if (!m) return
          const { error } = await supabase.from('memberships').update({ status: 'frozen', frozen_on: today }).eq('id', m.id)
          if (error) return { error }
          return log(m.id, 'frozen', { reason: reason || null })
        }, 'Plan congelado')} />}

      {sheet === 'adjust' && <AdjustSheet open onClose={() => setSheet(null)} busy={busy} used={m?.classes_used ?? 0} total={m?.classes_total ?? 0}
        onSave={(used, reason) => run(async () => {
          if (!m) return
          const { error } = await supabase.from('memberships').update({ classes_used: used }).eq('id', m.id)
          if (error) return { error }
          return log(m.id, 'adjusted', { reason: `Clases usadas: ${m.classes_used} → ${used}${reason ? `. ${reason}` : ''}` })
        }, 'Clases ajustadas')} />}

      <ConfirmDialog open={confirm === 'cancel'} onClose={() => setConfirm(null)} onConfirm={cancelPlan} busy={busy} danger
        title="¿Cancelar el plan?" body="El plan deja de estar vigente y queda en el historial. Las reservas que ningún otro plan cubra se liberan. Puedes asignar otro después." confirmLabel="Cancelar plan" />
      <ConfirmDialog open={confirm === 'deactivate'} onClose={() => setConfirm(null)} onConfirm={() => setActive(false)} busy={busy} danger
        title={`¿Dar de baja a ${person.name.split(' ')[0]}?`} body="Deja de ver el WOD y las clases del box, y se liberan sus reservas de las próximas clases. Su historial se conserva y puedes reactivar la cuenta cuando quieras." confirmLabel="Dar de baja" />
    </>
  )
}

function ContactCard({ box, person, file, disabled, onSaved }: { box: Box; person: Person; file: MemberFile | null; disabled: boolean; onSaved: () => void }) {
  const supabase = createClient()
  const { fire } = useToast()
  const [phone, setPhone] = useState(file?.phone ?? '')
  const [emergency, setEmergency] = useState(file?.emergency_contact ?? '')
  const [birth, setBirth] = useState(file?.birth_date ?? '')
  const [notes, setNotes] = useState(file?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const dirty = phone !== (file?.phone ?? '') || emergency !== (file?.emergency_contact ?? '') || birth !== (file?.birth_date ?? '') || notes !== (file?.notes ?? '')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('member_files').upsert({
      box_id: box.id, user_id: person.id, phone: phone.trim() || null, emergency_contact: emergency.trim() || null,
      birth_date: birth || null, notes: notes.trim() || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'box_id,user_id' })
    setBusy(false)
    if (error) fire(friendlyError(error.message), 'error'); else onSaved()
  }

  return (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="text-xs font-semibold text-mu">Datos de contacto y notas · solo los ve la administración</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Teléfono" type="tel" inputMode="tel" maxLength={40} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+56 9 1234 5678" />
          <Field label="Fecha de nacimiento" type="date" value={birth} onChange={e => setBirth(e.target.value)} />
        </div>
        <Field label="Contacto de emergencia" maxLength={120} value={emergency} onChange={e => setEmergency(e.target.value)} placeholder="Nombre y teléfono" />
        <div>
          <label className={labelCls} htmlFor="notes">Notas</label>
          <textarea id="notes" rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Lesiones, acuerdos de pago, lo que haga falta recordar"
            className={cn(inputBase, 'py-3 resize-none')} />
        </div>
        {dirty && <Button type="submit" disabled={busy || disabled}>{busy ? 'Guardando…' : 'Guardar ficha'}</Button>}
      </form>
    </Card>
  )
}

function AssignSheet({ open, onClose, plans, today, current, busy, onSave }: {
  open: boolean; onClose: () => void; plans: MembershipPlan[]; today: string; current: Membership | null; busy: boolean
  onSave: (plan: MembershipPlan, start: string) => void
}) {
  // A renewal starts the day after the current plan ends, unless it already expired.
  const suggested = current && current.ends_on >= today && current.status !== 'cancelled' ? addDaysISO(current.ends_on, 1) : today
  const [planId, setPlanId] = useState<string>(current?.plan_id ?? '')
  const [start, setStart] = useState(suggested)
  const plan = plans.find(p => p.id === planId) ?? plans[0]
  return (
    <Modal open={open} onClose={onClose} title={current ? 'Renovar o cambiar plan' : 'Asignar plan'} subtitle="El periodo anterior queda guardado en el historial.">
      {plans.length === 0 ? (
        <p className="text-sm text-mu">Primero crea un plan en la sección Planes.</p>
      ) : (
        <form onSubmit={e => { e.preventDefault(); if (plan) onSave(plan, start) }} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {plans.map(p => {
              const on = p.id === plan?.id
              return (
                <button key={p.id} type="button" onClick={() => setPlanId(p.id)} aria-pressed={on}
                  className={cn('p-3.5 rounded-2xl text-left ring-1 ring-inset transition-colors', on ? 'bg-ac/10 ring-ac/60' : 'bg-p2 ring-transparent')}>
                  <div className="font-semibold text-sm">{p.name}</div>
                  <div className="text-xs text-mu mt-0.5">{p.kind === 'classes' ? `${p.classes_count} clases` : 'Clases ilimitadas'} · {p.duration_days} días</div>
                </button>
              )
            })}
          </div>
          <Field label="Empieza el" type="date" value={start} onChange={e => setStart(e.target.value)} required
            hint={plan ? `Vence el ${fmt(addDaysISO(start, plan.duration_days - 1))}` : undefined} />
          <ModalActions secondary="Cancelar" primary="Guardar" onSecondary={onClose} primaryType="submit" busy={busy} disabled={!plan} />
        </form>
      )}
    </Modal>
  )
}

function ReasonSheet({ open, onClose, busy, title, subtitle, label, cta, onSave }: { open: boolean; onClose: () => void; busy: boolean; title: string; subtitle: string; label: string; cta: string; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <form onSubmit={e => { e.preventDefault(); onSave(reason.trim()) }}>
        <Field label={label} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder="Viaje, lesión, vacaciones…" />
        <ModalActions secondary="Cancelar" primary={cta} onSecondary={onClose} primaryType="submit" busy={busy} />
      </form>
    </Modal>
  )
}

function AdjustSheet({ open, onClose, busy, used, total, onSave }: { open: boolean; onClose: () => void; busy: boolean; used: number; total: number; onSave: (used: number, reason: string) => void }) {
  const [value, setValue] = useState(String(used))
  const [reason, setReason] = useState('')
  const n = Math.max(0, Math.min(total, Number(value) || 0))
  return (
    <Modal open={open} onClose={onClose} title="Ajustar clases" subtitle={`El plan tiene ${total} clases. Corrige cuántas lleva usadas.`}>
      <form onSubmit={e => { e.preventDefault(); onSave(n, reason.trim()) }} className="flex flex-col gap-4">
        <Field label="Clases usadas" type="number" inputMode="numeric" min={0} max={total} value={value} onChange={e => setValue(e.target.value)} hint={`Quedarían ${total - n}`} />
        <Field label="Motivo (opcional)" maxLength={200} value={reason} onChange={e => setReason(e.target.value)} placeholder="Clase de regalo, error al pasar lista…" />
        <ModalActions secondary="Cancelar" primary="Guardar" onSecondary={onClose} primaryType="submit" busy={busy} />
      </form>
    </Modal>
  )
}
