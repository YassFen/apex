'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, inputBase, labelCls } from '@/components/ui/Field'
import { Modal, ModalActions } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Switch } from '@/components/ui/Switch'
import { Segmented } from '@/components/ui/motion'
import { useToast } from '@/components/ui/Toast'
import { Empty, MigrationNotice, SectionTitle, selectCls } from '@/components/manage/ui'
import { Megaphone, Plus, ShareFat, Trash } from '@/components/ui/icons'
import { createClient } from '@/lib/supabase/client'
import { addDaysISO, formatDateOnly, toDateInput } from '@/lib/utils/dates'
import { AUDIENCE_LABEL, isLive, targetLabel } from '@/lib/utils/announcements'
import { WEEKDAYS, WEEK_ORDER, hhmm } from '@/lib/utils/schedule'
import { friendlyError } from '@/lib/utils/errors'
import { cn } from '@/lib/utils/cn'
import type { Profile, Announcement, ClassSlot } from '@/lib/types/database'

type BoxRole = { id: string; name: string; role: 'athlete' | 'coach' | 'admin' }
type Draft = { boxId: string; title: string; body: string; parentId: string | null; audience?: Announcement['audience'] }

export function AnnouncementsView({ profile, me, today, boxes, items, slots, reads, myReads, size, missing }: {
  profile: Profile; me: string; today: string; boxes: BoxRole[]; items: Announcement[]; slots: ClassSlot[]
  reads: Record<string, number>; myReads: string[]; size: Record<string, { coaches: number; all: number }>; missing: boolean
}) {
  const router = useRouter()
  const { fire } = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [removing, setRemoving] = useState<Announcement | null>(null)
  const [busy, setBusy] = useState(false)
  const staffBoxes = boxes.filter(b => b.role !== 'athlete')
  const roleIn = (boxId: string) => boxes.find(b => b.id === boxId)?.role ?? 'athlete'
  const live = items.filter(a => isLive(a, today))
  const upcoming = items.filter(a => a.starts_on > today)
  const past = items.filter(a => !!a.ends_on && a.ends_on < today)

  async function remove() {
    if (!removing) return
    setBusy(true)
    const { error } = await createClient().from('announcements').delete().eq('id', removing.id)
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire('Aviso eliminado', 'ok'); setRemoving(null); router.refresh()
  }

  const card = (a: Announcement) => {
    const role = roleIn(a.box_id)
    const mine = a.author_id === me
    const canDelete = mine || role === 'admin'
    // A coach passes an administration notice on to the athletes.
    const canRelay = role !== 'athlete' && a.audience === 'coaches' && isLive(a, today)
    const target = targetLabel(a, slots)
    const audienceSize = a.audience === 'coaches' ? size[a.box_id]?.coaches : size[a.box_id]?.all
    return (
      <li key={a.id} className={cn('p-4 rounded-[20px] bg-p flex flex-col gap-2.5', a.urgent && isLive(a, today) && 'ring-1 ring-inset ring-rd/50')}>
        <div className="flex items-center gap-2 flex-wrap">
          {a.urgent && <Badge color="red">Urgente</Badge>}
          <Badge color={a.audience === 'coaches' ? 'purple' : 'neutral'}>{AUDIENCE_LABEL[a.audience]}</Badge>
          {target && <Badge color="blue">{target}</Badge>}
          {!mine && !myReads.includes(a.id) && isLive(a, today) && <span className="size-2 rounded-full bg-ac" aria-label="Sin leer" />}
          <span className="ml-auto text-xs text-fa">{formatDateOnly(toDateInput(a.created_at), { day: 'numeric', month: 'short' })}</span>
        </div>
        <h3 className="font-display text-lg font-bold tracking-tight text-balance">{a.title}</h3>
        {a.body && <p className="text-sm text-mu whitespace-pre-line text-pretty">{a.body}</p>}
        <div className="text-xs text-fa">
          {boxes.length > 1 ? `${boxes.find(b => b.id === a.box_id)?.name} · ` : ''}
          {a.ends_on ? `Hasta el ${formatDateOnly(a.ends_on, { day: 'numeric', month: 'long' })}` : 'Sin fecha de término'}
          {(mine || role === 'admin') && audienceSize ? ` · Leído por ${reads[a.id] ?? 0} de ${Math.max(0, audienceSize - 1)}` : ''}
        </div>
        {(canRelay || canDelete) && (
          <div className="flex gap-2 flex-wrap">
            {canRelay && <Button size="sm" onClick={() => setDraft({ boxId: a.box_id, title: a.title, body: a.body ?? '', parentId: a.id, audience: 'athletes' })}><ShareFat size={15} /> Avisar a los atletas</Button>}
            {canDelete && <Button size="sm" variant="ghost" onClick={() => setRemoving(a)}><Trash size={15} /> Eliminar</Button>}
          </div>
        )}
      </li>
    )
  }

  return (
    <>
      <Topbar title="Comunicados" profile={profile} backHref={null} actions={staffBoxes.length > 0 ? (
        <button type="button" disabled={missing} onClick={() => setDraft({ boxId: staffBoxes[0].id, title: '', body: '', parentId: null })} aria-label="Nuevo aviso"
          className="inline-flex items-center gap-1.5 h-10 px-3 sm:px-4 rounded-full bg-ac text-onac text-sm font-bold disabled:opacity-40">
          <Plus size={16} weight="bold" aria-hidden /><span className="hidden sm:inline">Nuevo aviso</span>
        </button>
      ) : undefined} />
      <div className="p-4 lg:p-6 grid grid-cols-1 gap-4 max-w-2xl w-full">
        {missing && <MigrationNotice />}
        {items.length === 0 ? (
          <Empty icon={<Megaphone size={26} />} title="Sin avisos por ahora"
            body={staffBoxes.length ? 'Escribe a los coaches o a todo el box. Los urgentes quedan fijos arriba de la app hasta que terminan.' : 'Cuando tu box publique un aviso, lo verás aquí y te saltará al abrir la app.'} />
        ) : (
          <>
            {live.length > 0 && <ul className="flex flex-col gap-3 stagger">{live.map(card)}</ul>}
            {upcoming.length > 0 && <><SectionTitle>Programados</SectionTitle><ul className="flex flex-col gap-3">{upcoming.map(card)}</ul></>}
            {past.length > 0 && <><SectionTitle>Anteriores</SectionTitle><ul className="flex flex-col gap-3 opacity-70">{past.map(card)}</ul></>}
          </>
        )}
      </div>

      {draft && <Composer key={draft.parentId ?? 'new'} draft={draft} me={me} today={today} boxes={staffBoxes} slots={slots} onClose={() => setDraft(null)} />}
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} busy={busy} danger title="¿Eliminar este aviso?" body="Deja de verse para todos." confirmLabel="Eliminar" />
    </>
  )
}

function Composer({ draft, me, today, boxes, slots, onClose }: { draft: Draft; me: string; today: string; boxes: BoxRole[]; slots: ClassSlot[]; onClose: () => void }) {
  const router = useRouter()
  const { fire } = useToast()
  const [boxId, setBoxId] = useState(draft.boxId)
  const admin = boxes.find(b => b.id === boxId)?.role === 'admin'
  const [audience, setAudience] = useState<Announcement['audience']>(draft.audience ?? (admin ? 'coaches' : 'athletes'))
  const [title, setTitle] = useState(draft.title)
  const [body, setBody] = useState(draft.body)
  const [urgent, setUrgent] = useState(false)
  const [startsOn, setStartsOn] = useState(today)
  const [endsOn, setEndsOn] = useState('')
  const [scope, setScope] = useState<'all' | 'weekday' | 'slot'>('all')
  const [weekday, setWeekday] = useState(1)
  const [slotId, setSlotId] = useState('')
  const [busy, setBusy] = useState(false)
  const boxSlots = slots.filter(s => s.box_id === boxId)
  // A coach can only write to athletes; the administrator picks the audience.
  const realAudience = admin ? audience : 'athletes'
  const targeted = realAudience !== 'coaches'

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await createClient().from('announcements').insert({
      box_id: boxId, author_id: me, audience: realAudience, title: title.trim(), body: body.trim() || null, urgent, starts_on: startsOn, ends_on: endsOn || null,
      weekday: targeted && scope === 'weekday' ? weekday : null, slot_id: targeted && scope === 'slot' && slotId ? slotId : null, parent_id: draft.parentId,
    })
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire('Aviso publicado', 'ok'); onClose(); router.refresh()
  }

  return (
    <Modal open onClose={onClose} title={draft.parentId ? 'Avisar a los atletas' : 'Nuevo aviso'}
      subtitle={draft.parentId ? 'Ajusta el texto y elige a quiénes les llega.' : admin ? 'A los coaches les salta al abrir la app; ellos deciden cómo pasarlo a sus atletas.' : 'Les salta a los atletas al abrir la app.'}>
      <form onSubmit={save} className="flex flex-col gap-4">
        {boxes.length > 1 && !draft.parentId && (
          <div>
            <label className={labelCls} htmlFor="a-box">Box</label>
            <select id="a-box" className={selectCls} value={boxId} onChange={e => setBoxId(e.target.value)}>{boxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </div>
        )}
        {admin && !draft.parentId && (
          <div>
            <span className={labelCls}>Para quién</span>
            <Segmented id="a-aud" value={audience} onChange={setAudience} options={[['coaches', 'Coaches'], ['all', 'Todo el box'], ['athletes', 'Atletas']]} />
          </div>
        )}
        <Field label="Título" required maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="El sábado no hay clases" />
        <div>
          <label className={labelCls} htmlFor="a-body">Mensaje</label>
          <textarea id="a-body" rows={4} maxLength={1500} value={body} onChange={e => setBody(e.target.value)} placeholder="Qué pasa, cuándo y qué tienen que hacer." className={cn(inputBase, 'py-3 resize-none')} />
        </div>
        {targeted && (
          <div className="flex flex-col gap-3">
            <div>
              <span className={labelCls}>A quiénes les salta</span>
              <Segmented id="a-scope" value={scope} onChange={setScope} options={[['all', 'Todos'], ['weekday', 'Un día'], ['slot', 'Una clase']]} />
            </div>
            {scope === 'weekday' && (
              <select aria-label="Día de la semana" className={selectCls} value={weekday} onChange={e => setWeekday(Number(e.target.value))}>
                {WEEK_ORDER.map(d => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
              </select>
            )}
            {scope === 'slot' && (
              <select aria-label="Clase" className={selectCls} value={slotId} onChange={e => setSlotId(e.target.value)} required>
                <option value="">Elegir clase</option>
                {boxSlots.map(s => <option key={s.id} value={s.id}>{WEEKDAYS[s.weekday]} {hhmm(s.start_time)} · {s.name}</option>)}
              </select>
            )}
            {scope !== 'all' && <p className="text-xs text-mu -mt-1">Les salta solo a quienes tienen reserva ese día o esa clase. Los demás lo ven en Avisos.</p>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde" type="date" required value={startsOn} onChange={e => setStartsOn(e.target.value)} />
          <Field label={urgent ? 'Hasta' : 'Hasta (opcional)'} type="date" min={startsOn} required={urgent} value={endsOn} onChange={e => setEndsOn(e.target.value)} />
        </div>
        <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-p2">
          <span className="text-sm"><span className="font-semibold block">Urgente</span><span className="text-mu text-xs">Queda fijo en rojo arriba de la app hasta la fecha de término.</span></span>
          <Switch checked={urgent} onChange={v => { setUrgent(v); if (v && !endsOn) setEndsOn(addDaysISO(startsOn, 7)) }} label="Urgente" />
        </label>
        <ModalActions secondary="Cancelar" primary="Publicar" onSecondary={onClose} primaryType="submit" busy={busy} disabled={!title.trim()} />
      </form>
    </Modal>
  )
}
