'use client'
// App-wide challenges (014): the application administrator creates, edits and removes them.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { MigrationNotice, selectCls } from '@/components/manage/ui'
import { Plus, Target, Trash2, Pencil } from '@/components/ui/icons'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/utils/errors'
import { addDaysISO, formatDateOnly } from '@/lib/utils/dates'
import { METRIC_LABEL } from '@/lib/utils/progress'
import { cn } from '@/lib/utils/cn'

export interface AppChallenge { id: string; title: string; description: string | null; metric: string; target: number; xp_reward: number; starts_on: string; ends_on: string }

const METRICS: [string, string][] = [['days', 'Días entrenando'], ['wods', 'WODs registrados'], ['classes', 'Clases asistidas'], ['prs', 'Récords nuevos'], ['xp', 'Experiencia ganada']]
const inputCls = 'w-full h-12 px-4 rounded-xl bg-p2 text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60'
const labelCls = 'block text-[13px] text-mu font-medium mb-1.5 px-1'

export function AppChallengesManager({ challenges, today, missing }: { challenges: AppChallenge[]; today: string; missing: boolean }) {
  const router = useRouter()
  const { fire } = useToast()
  const [edit, setEdit] = useState<AppChallenge | 'new' | null>(null)
  const [del, setDel] = useState<AppChallenge | null>(null)
  const [busy, setBusy] = useState(false)

  async function remove() {
    if (!del) return
    setBusy(true)
    const { error } = await createClient().from('app_challenges').delete().eq('id', del.id)
    setBusy(false); setDel(null)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire('Reto eliminado.', 'ok'); router.refresh()
  }

  if (missing) return <MigrationNotice />
  const state = (c: AppChallenge) => (c.ends_on < today ? 'Terminado' : c.starts_on > today ? 'Programado' : 'Activo')

  return (
    <>
      <button type="button" onClick={() => setEdit('new')} className="h-12 rounded-full bg-ac text-onac font-bold flex items-center justify-center gap-2">
        <Plus size={18} weight="bold" aria-hidden /> Nuevo reto
      </button>
      {challenges.length === 0 && <Card className="text-sm text-mu">Todavía no hay retos. Crea uno semanal para mantener a todos entrenando.</Card>}
      <ul className="flex flex-col gap-2">
        {challenges.map(c => (
          <li key={c.id} className="rounded-2xl bg-p p-4 flex items-start gap-3">
            <span className="size-10 rounded-xl bg-pu/15 text-pu grid place-items-center flex-shrink-0"><Target size={20} weight="duotone" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="font-semibold truncate">{c.title}</span>
                <span className={cn('text-[11px] font-semibold', state(c) === 'Activo' ? 'text-gr' : 'text-fa')}>{state(c)}</span></div>
              <div className="text-xs text-mu mt-0.5">
                {(METRIC_LABEL[c.metric] ?? (n => String(n)))(c.target)} · +{c.xp_reward} XP · {formatDateOnly(c.starts_on, { day: 'numeric', month: 'short' })} al {formatDateOnly(c.ends_on, { day: 'numeric', month: 'short' })}
              </div>
            </div>
            <button type="button" onClick={() => setEdit(c)} aria-label={`Editar ${c.title}`} className="hit-44 size-9 rounded-full grid place-items-center text-mu hover:bg-p2"><Pencil size={16} /></button>
            <button type="button" onClick={() => setDel(c)} aria-label={`Eliminar ${c.title}`} className="hit-44 size-9 rounded-full grid place-items-center text-rd hover:bg-rd/10"><Trash2 size={16} /></button>
          </li>
        ))}
      </ul>
      <ChallengeSheet value={edit} today={today} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); router.refresh() }} />
      <ConfirmDialog open={!!del} danger busy={busy} title={`¿Eliminar "${del?.title ?? ''}"?`} body="Desaparece para todos. La experiencia que ya ganaron se mantiene."
        confirmLabel="Eliminar" onConfirm={remove} onClose={() => setDel(null)} />
    </>
  )
}

function ChallengeSheet({ value, today, onClose, onSaved }: { value: AppChallenge | 'new' | null; today: string; onClose: () => void; onSaved: () => void }) {
  const { fire } = useToast()
  const editing = value && value !== 'new' ? value : null
  const [form, setForm] = useState(() => init(editing, today))
  const [key, setKey] = useState<string | null>(null)
  const k = value === null ? null : editing?.id ?? 'new'
  if (k !== key) { setKey(k); setForm(init(editing, today)) }
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof form>) => setForm(f => ({ ...f, ...p }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (form.ends_on < form.starts_on) { fire('La fecha de término no puede ser antes del inicio.', 'error'); return }
    setBusy(true)
    const row = { title: form.title.trim(), description: form.description.trim() || null, metric: form.metric, target: Number(form.target), xp_reward: Number(form.xp_reward), starts_on: form.starts_on, ends_on: form.ends_on }
    const supabase = createClient()
    const { error } = editing ? await supabase.from('app_challenges').update(row).eq('id', editing.id) : await supabase.from('app_challenges').insert(row)
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire(editing ? 'Reto actualizado.' : 'Reto creado. Ya lo ven todos los atletas.', 'ok'); onSaved()
  }

  return (
    <Modal open={value !== null} onClose={onClose} title={editing ? 'Editar reto' : 'Nuevo reto'}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div><label htmlFor="ch-title" className={labelCls}>Nombre</label>
          <input id="ch-title" required maxLength={80} value={form.title} onChange={e => set({ title: e.target.value })} className={inputCls} placeholder="Semana constante" /></div>
        <div><label htmlFor="ch-desc" className={labelCls}>Descripción <span className="text-fa">(opcional)</span></label>
          <input id="ch-desc" maxLength={300} value={form.description} onChange={e => set({ description: e.target.value })} className={inputCls} placeholder="Entrena 4 días esta semana." /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="ch-metric" className={labelCls}>Qué se cuenta</label>
            <select id="ch-metric" value={form.metric} onChange={e => set({ metric: e.target.value })} className={selectCls}>
              {METRICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          <div><label htmlFor="ch-target" className={labelCls}>Meta</label>
            <input id="ch-target" type="number" inputMode="numeric" min={1} max={100000} required value={form.target} onChange={e => set({ target: e.target.value })} className={inputCls} /></div>
          <div><label htmlFor="ch-from" className={labelCls}>Desde</label>
            <input id="ch-from" type="date" required value={form.starts_on} onChange={e => set({ starts_on: e.target.value })} className={inputCls} /></div>
          <div><label htmlFor="ch-to" className={labelCls}>Hasta</label>
            <input id="ch-to" type="date" required value={form.ends_on} min={form.starts_on} onChange={e => set({ ends_on: e.target.value })} className={inputCls} /></div>
        </div>
        <div><label htmlFor="ch-xp" className={labelCls}>Premio (XP)</label>
          <input id="ch-xp" type="number" inputMode="numeric" min={0} max={2000} required value={form.xp_reward} onChange={e => set({ xp_reward: e.target.value })} className={inputCls} /></div>
        <button type="submit" disabled={busy} className="h-12 rounded-full bg-ac text-onac font-bold disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}

function init(c: AppChallenge | null, today: string) {
  return {
    title: c?.title ?? '', description: c?.description ?? '', metric: c?.metric ?? 'days',
    target: String(c?.target ?? 4), xp_reward: String(c?.xp_reward ?? 100),
    starts_on: c?.starts_on ?? today, ends_on: c?.ends_on ?? addDaysISO(today, 6),
  }
}
