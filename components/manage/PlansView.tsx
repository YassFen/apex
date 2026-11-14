'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Field, labelCls } from '@/components/ui/Field'
import { Modal, ModalActions } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/motion'
import { Switch } from '@/components/ui/Switch'
import { useToast } from '@/components/ui/Toast'
import { BoxTabs, Empty, MigrationNotice, selectCls } from '@/components/manage/ui'
import { Plus, Ticket, PencilSimple } from '@/components/ui/icons'
import { createClient } from '@/lib/supabase/client'
import { money } from '@/lib/utils/membership'
import { friendlyError } from '@/lib/utils/errors'
import { cn } from '@/lib/utils/cn'
import type { Profile, Box, MembershipPlan, MembershipKind } from '@/lib/types/database'

const DURATIONS: [number, string][] = [[7, '1 semana'], [30, '1 mes'], [90, '3 meses'], [180, '6 meses'], [365, '1 año']]
const durationLabel = (d: number) => DURATIONS.find(x => x[0] === d)?.[1] ?? `${d} días`

export function PlansView({ profile, box, boxes, plans, counts, missing }: { profile: Profile; box: Box; boxes: Box[]; plans: MembershipPlan[]; counts: Record<string, number>; missing: boolean }) {
  const [editing, setEditing] = useState<MembershipPlan | 'new' | null>(null)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const active = plans.filter(p => p.is_active)
  const archived = plans.filter(p => !p.is_active)

  return (
    <>
      <Topbar title="Planes" profile={profile} backHref={null} actions={
        <button type="button" onClick={() => setEditing('new')} disabled={missing} aria-label="Crear plan"
          className="inline-flex items-center gap-1.5 h-10 px-3 sm:px-4 rounded-full bg-ac text-onac text-sm font-bold disabled:opacity-40">
          <Plus size={16} weight="bold" aria-hidden /><span className="hidden sm:inline">Crear plan</span>
        </button>
      } />
      <div className="p-4 lg:p-6 grid grid-cols-1 gap-4 max-w-3xl w-full">
        <BoxTabs boxes={boxes} current={box.id} base="/manage/plans" />
        {missing && <MigrationNotice />}
        {plans.length === 0 ? (
          <Empty icon={<Ticket size={26} />} title="Crea tu primer plan" body="Mensual ilimitado, 12 clases al mes, trimestral… Después lo asignas a cada atleta desde su ficha."
            action={<button type="button" onClick={() => setEditing('new')} disabled={missing} className="h-12 px-6 rounded-full bg-ac text-onac font-bold disabled:opacity-40">Crear plan</button>} />
        ) : (
          <>
            <p className="text-sm text-mu">{total} {total === 1 ? 'atleta con plan vigente' : 'atletas con plan vigente'}.</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger">
              {active.map(p => <PlanCard key={p.id} plan={p} count={counts[p.id] ?? 0} total={total} onEdit={() => setEditing(p)} />)}
            </ul>
            {archived.length > 0 && (
              <>
                <h2 className="text-xs font-semibold text-mu mt-2">Archivados · no se pueden asignar</h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {archived.map(p => <PlanCard key={p.id} plan={p} count={counts[p.id] ?? 0} total={total} onEdit={() => setEditing(p)} />)}
                </ul>
              </>
            )}
          </>
        )}
      </div>
      {editing && <PlanSheet key={editing === 'new' ? 'new' : editing.id} box={box} plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function PlanCard({ plan, count, total, onEdit }: { plan: MembershipPlan; count: number; total: number; onEdit: () => void }) {
  return (
    <li className={cn('p-5 rounded-[20px] bg-p flex flex-col gap-3', !plan.is_active && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-xl font-bold tracking-tight truncate">{plan.name}</h3>
          <p className="text-sm text-mu">{plan.kind === 'classes' ? `${plan.classes_count} clases` : 'Clases ilimitadas'} · {durationLabel(plan.duration_days)}</p>
        </div>
        <button type="button" onClick={onEdit} aria-label={`Editar ${plan.name}`} className="size-10 -mr-2 -mt-1 rounded-full grid place-items-center text-mu hover:bg-p2 hover:text-t flex-shrink-0">
          <PencilSimple size={18} />
        </button>
      </div>
      <div className="font-display text-2xl font-bold tracking-tight tabular-nums">{money(plan.price, plan.currency)}</div>
      <div>
        <div className="flex justify-between text-xs text-mu mb-1.5"><span>Atletas en este plan</span><span className="font-semibold text-t tabular-nums">{count}</span></div>
        <div className="h-1.5 rounded-full bg-p3 overflow-hidden"><div className="h-full rounded-full bg-ac" style={{ width: `${total ? (count / total) * 100 : 0}%` }} /></div>
      </div>
    </li>
  )
}

function PlanSheet({ box, plan, onClose }: { box: Box; plan: MembershipPlan | null; onClose: () => void }) {
  const router = useRouter()
  const { fire } = useToast()
  const [name, setName] = useState(plan?.name ?? '')
  const [kind, setKind] = useState<MembershipKind>(plan?.kind ?? 'unlimited')
  const [classes, setClasses] = useState(String(plan?.classes_count ?? 12))
  const [duration, setDuration] = useState(plan?.duration_days ?? 30)
  const [price, setPrice] = useState(plan?.price != null ? String(plan.price) : '')
  const [currency, setCurrency] = useState(plan?.currency ?? 'CLP')
  const [active, setActive] = useState(plan?.is_active ?? true)
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const row = {
      box_id: box.id, name: name.trim(), kind, classes_count: kind === 'classes' ? Math.max(1, Number(classes) || 1) : null,
      duration_days: duration, price: price === '' ? null : Math.max(0, Number(price) || 0), currency, is_active: active,
    }
    const supabase = createClient()
    const { error } = plan ? await supabase.from('membership_plans').update(row).eq('id', plan.id) : await supabase.from('membership_plans').insert(row)
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire(plan ? 'Plan actualizado' : 'Plan creado', 'ok'); onClose(); router.refresh()
  }

  return (
    <Modal open onClose={onClose} title={plan ? 'Editar plan' : 'Nuevo plan'} subtitle={plan ? 'Los cambios valen para las próximas asignaciones. Los planes ya asignados no cambian.' : undefined}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Nombre" required maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="Mensual ilimitado" />
        <div>
          <span className={labelCls}>Tipo</span>
          <Segmented id="plan-kind" value={kind} onChange={setKind} options={[['unlimited', 'Ilimitado'], ['classes', 'Por clases']]} />
        </div>
        {kind === 'classes' && <Field label="Clases incluidas" type="number" inputMode="numeric" min={1} max={999} value={classes} onChange={e => setClasses(e.target.value)} />}
        <div>
          <label className={labelCls} htmlFor="duration">Duración</label>
          <select id="duration" className={selectCls} value={duration} onChange={e => setDuration(Number(e.target.value))}>
            {DURATIONS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
            {!DURATIONS.some(x => x[0] === duration) && <option value={duration}>{duration} días</option>}
          </select>
        </div>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Precio (opcional)" type="number" inputMode="decimal" min={0} value={price} onChange={e => setPrice(e.target.value)} placeholder="45000" />
          <div>
            <label className={labelCls} htmlFor="currency">Moneda</label>
            <select id="currency" className={selectCls} value={currency} onChange={e => setCurrency(e.target.value)}>
              {['CLP', 'MXN', 'ARS', 'COP', 'PEN', 'USD'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {plan && (
          <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-p2">
            <span className="text-sm"><span className="font-semibold block">Disponible para asignar</span><span className="text-mu text-xs">Apágalo para archivarlo sin perder el historial.</span></span>
            <Switch checked={active} onChange={setActive} label="Disponible para asignar" />
          </label>
        )}
        <ModalActions secondary="Cancelar" primary={plan ? 'Guardar' : 'Crear plan'} onSecondary={onClose} primaryType="submit" busy={busy} disabled={!name.trim()} />
      </form>
    </Modal>
  )
}
