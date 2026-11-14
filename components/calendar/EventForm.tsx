'use client'
import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { Plus, Trash2, GripVertical, Save, X } from '@/components/ui/icons'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'
import { ActivePill, EASE_OUT, Segmented, SPRING } from '@/components/ui/motion'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/utils/errors'
import { WOD_TYPE_META } from '@/lib/utils/wod-types'
import { EVENT_KIND_LABEL, type EventKind, type EventWorkout } from '@/lib/utils/readiness'
import { cn } from '@/lib/utils/cn'
import type { Profile, Unit } from '@/lib/types/database'

export interface EventFormValues {
  id?: string
  boxId: string | null
  name: string
  kind: EventKind
  startsOn: string
  endsOn: string
  location: string
  url: string
  notes: string
  workouts: EventWorkout[]
}

interface MovRow { name: string; reps: string; m: string; f: string }
interface WorkoutDraft { key: string; title: string; type: EventWorkout['type']; cap: string; description: string; movs: MovRow[] }

const toUnitStr = (lb: number | null | undefined, unit: Unit) =>
  lb ? String(unit === 'kg' ? Math.round(lb * 0.453592 * 2) / 2 : Math.round(lb)) : ''
const toLb = (v: string, unit: Unit) => {
  const n = Number(v.replace(',', '.'))
  if (!n || n <= 0) return null
  return Math.round((unit === 'kg' ? n / 0.453592 : n) * 10) / 10
}
let seq = 0
const newKey = () => `w${Date.now()}${seq++}`
const emptyMov = (): MovRow => ({ name: '', reps: '', m: '', f: '' })
const emptyWorkout = (n: number): WorkoutDraft => ({ key: newKey(), title: `Workout ${n}`, type: 'fortime', cap: '', description: '', movs: [emptyMov()] })

const Label = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
  <label htmlFor={htmlFor} className="block text-xs text-mu font-semibold mb-1.5 px-1">{children}</label>
)
const inputCls = 'w-full h-12 px-4 rounded-2xl bg-p2 text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 placeholder:text-fa'

export function EventForm({ profile, initial, coachBoxes, movementNames }: {
  profile: Profile
  initial: EventFormValues
  coachBoxes: { id: string; name: string }[]
  movementNames: string[]
}) {
  const router = useRouter()
  const { fire } = useToast()
  const supabase = createClient()
  const unit: Unit = profile.preferred_unit ?? 'kg'
  const listId = useId()
  const editing = !!initial.id

  const [scope, setScope] = useState<string>(initial.boxId ?? 'personal')
  const [name, setName] = useState(initial.name)
  const [kind, setKind] = useState<EventKind>(initial.kind)
  const [startsOn, setStartsOn] = useState(initial.startsOn)
  const [endsOn, setEndsOn] = useState(initial.endsOn === initial.startsOn ? '' : initial.endsOn)
  const [location, setLocation] = useState(initial.location)
  const [url, setUrl] = useState(initial.url)
  const [notes, setNotes] = useState(initial.notes)
  const [workouts, setWorkouts] = useState<WorkoutDraft[]>(() => initial.workouts.map(w => ({
    key: newKey(), title: w.title, type: w.type, cap: w.time_cap_mins ? String(w.time_cap_mins) : '', description: w.description,
    movs: w.movements.length ? w.movements.map(m => ({ name: m.name, reps: m.reps, m: toUnitStr(m.load_lb, unit), f: toUnitStr(m.load_lb_f, unit) })) : [emptyMov()],
  })))
  const [saving, setSaving] = useState(false)

  const patchW = (key: string, patch: Partial<WorkoutDraft>) => setWorkouts(ws => ws.map(w => w.key === key ? { ...w, ...patch } : w))
  const patchMov = (key: string, i: number, patch: Partial<MovRow>) =>
    setWorkouts(ws => ws.map(w => w.key === key ? { ...w, movs: w.movs.map((m, j) => j === i ? { ...m, ...patch } : m) } : w))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { fire('Ponle nombre al evento', 'error'); return }
    if (!startsOn) { fire('Elige la fecha del evento', 'error'); return }
    if (endsOn && endsOn < startsOn) { fire('La fecha de término es anterior al inicio', 'error'); return }
    setSaving(true)

    const row = {
      box_id: scope === 'personal' ? null : scope,
      name: name.trim(), kind, starts_on: startsOn, ends_on: endsOn || null,
      location: location.trim() || null, url: url.trim() || null, notes: notes.trim() || null,
    }
    const res = editing
      ? await supabase.from('events').update(row).eq('id', initial.id as string).select('id').single()
      : await supabase.from('events').insert({ ...row, created_by: profile.id }).select('id').single()
    if (res.error || !res.data) { setSaving(false); fire(friendlyError(res.error?.message ?? 'No se pudo guardar'), 'error'); return }
    const eventId = (res.data as any).id as string

    const rows = workouts
      .filter(w => w.title.trim() || w.movs.some(m => m.name.trim()))
      .map((w, i) => ({
        event_id: eventId, position: i, title: w.title.trim() || `Workout ${i + 1}`, type: w.type,
        time_cap_mins: w.cap ? Number(w.cap) : null, description: w.description.trim(),
        movements: w.movs.filter(m => m.name.trim()).map(m => ({ name: m.name.trim(), reps: m.reps.trim(), load_lb: toLb(m.m, unit), load_lb_f: toLb(m.f, unit) })),
      }))
    if (editing) await supabase.from('event_workouts').delete().eq('event_id', eventId)
    if (rows.length) {
      const { error } = await supabase.from('event_workouts').insert(rows)
      if (error) { setSaving(false); fire(friendlyError(error.message), 'error'); return }
    }
    // Creating your own competition means you're going.
    if (!editing && scope === 'personal') {
      let category: string = profile.sex ?? 'm'
      if (!profile.sex) try { category = localStorage.getItem('apex.eventCategory') === 'f' ? 'f' : 'm' } catch {}
      await supabase.from('event_participants').insert({ event_id: eventId, user_id: profile.id, category })
    }
    setSaving(false)
    fire(editing ? 'Evento actualizado' : 'Evento creado. ¡A prepararse!', 'pr')
    router.push(`/calendar/event/${eventId}`)
    router.refresh()
  }

  return (
    <>
      <Topbar title={editing ? 'Editar evento' : 'Nuevo evento'} profile={profile} actions={
        <button type="button" onClick={() => router.back()} aria-label="Cancelar" className="size-10 rounded-xl grid place-items-center text-mu hover:text-t hover:bg-p2"><X size={20} aria-hidden /></button>
      } />

      <form onSubmit={save} className="p-4 lg:p-6 flex flex-col gap-4 max-w-2xl w-full mx-auto pb-28">
        <datalist id={listId}>{movementNames.map(n => <option key={n} value={n} />)}</datalist>

        <Card className="flex flex-col gap-4">
          {coachBoxes.length > 0 && (
            <div>
              <Label>¿Para quién?</Label>
              <Segmented id="ev-scope" value={scope} onChange={setScope}
                options={[['personal', 'Solo yo'], ...coachBoxes.map(b => [b.id, `Todo ${b.name}`] as const)] as readonly (readonly [string, string])[]} />
              <p className="text-mu text-xs mt-1.5 px-1">{scope === 'personal' ? 'Solo tú lo ves en tu calendario.' : 'Aparece en el calendario de todos tus atletas, que pueden inscribirse.'}</p>
            </div>
          )}

          <div>
            <Label htmlFor="ev-name">Nombre</Label>
            <input id="ev-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Santiago Throwdown 2026" maxLength={120} className={inputCls} autoFocus={!editing} />
          </div>

          <div>
            <Label>Tipo</Label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(EVENT_KIND_LABEL) as EventKind[]).map(k => (
                <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                  className={cn('relative isolate h-9 px-3.5 rounded-full text-xs font-bold transition-colors', kind === k ? 'text-onac' : 'bg-p2 text-mu hover:text-t')}>
                  {kind === k && <ActivePill layoutId="ev-kind" className="rounded-full bg-ac" />}
                  {EVENT_KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ev-start">Empieza</Label>
              <input id="ev-start" type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} className={inputCls} />
            </div>
            <div>
              <Label htmlFor="ev-end">Termina (opcional)</Label>
              <input id="ev-end" type="date" value={endsOn} min={startsOn} onChange={e => setEndsOn(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ev-loc">Lugar</Label>
              <input id="ev-loc" value={location} onChange={e => setLocation(e.target.value)} placeholder="Ej: Movistar Arena" className={inputCls} />
            </div>
            <div>
              <Label htmlFor="ev-url">Link (opcional)</Label>
              <input id="ev-url" type="url" inputMode="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" className={inputCls} />
            </div>
          </div>

          <div>
            <Label htmlFor="ev-notes">Notas</Label>
            <textarea id="ev-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Horarios, categoría, equipo, lo que tengas que recordar…"
              className="w-full px-4 py-3 rounded-2xl bg-p2 text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 placeholder:text-fa resize-y" />
          </div>
        </Card>

        <div className="flex items-end justify-between px-1">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight">Workouts</h2>
            <p className="text-mu text-xs">Con las cargas te decimos qué tan preparado vas. Pesos en {unit}.</p>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {workouts.map((w, wi) => (
            <motion.div key={w.key} layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
              transition={{ duration: 0.35, ease: EASE_OUT }}>
              <Card className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <GripVertical size={16} className="text-fa" aria-hidden />
                  <span className="text-xs text-mu font-semibold">Workout {wi + 1}</span>
                  <button type="button" onClick={() => setWorkouts(ws => ws.filter(x => x.key !== w.key))} aria-label={`Quitar workout ${wi + 1}`}
                    className="ml-auto size-9 rounded-full grid place-items-center text-mu hover:text-rd hover:bg-rd/10"><Trash2 size={16} aria-hidden /></button>
                </div>
                <input value={w.title} onChange={e => patchW(w.key, { title: e.target.value })} placeholder="Nombre (ej: 26.1 o Fran)"
                  aria-label="Nombre del workout" className={cn(inputCls, 'font-display text-xl sm:text-xl font-bold tracking-tight')} />
                <div className="grid grid-cols-[1fr_96px] gap-2">
                  <div className="flex gap-1 overflow-x-auto scrollbar-none">
                    {(Object.keys(WOD_TYPE_META) as EventWorkout['type'][]).map(t => (
                      <button key={t} type="button" onClick={() => patchW(w.key, { type: t })} aria-pressed={w.type === t}
                        className={cn('flex-shrink-0 h-10 px-3 rounded-xl text-xs font-bold transition-colors', w.type === t ? WOD_TYPE_META[t].cls : 'bg-p2 text-mu')}>
                        {WOD_TYPE_META[t].label}
                      </button>
                    ))}
                  </div>
                  <input value={w.cap} onChange={e => patchW(w.key, { cap: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="Min"
                    aria-label="Minutos (time cap o duración)" className={cn(inputCls, 'h-10 text-center')} />
                </div>

                <div className="flex flex-col gap-2">
                  <AnimatePresence initial={false}>
                    {w.movs.map((m, i) => (
                      <motion.div key={i} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={SPRING}
                        className="grid grid-cols-[56px_1fr_32px] gap-1.5 items-center p-1.5 rounded-2xl bg-p2/60">
                        <input value={m.reps} onChange={e => patchMov(w.key, i, { reps: e.target.value })} placeholder="21" aria-label="Reps"
                          className="h-11 px-2 rounded-xl bg-p text-center text-base sm:text-sm font-bold outline-none focus:ring-2 focus:ring-ac/50 placeholder:text-fa" />
                        <input value={m.name} list={listId} onChange={e => patchMov(w.key, i, { name: e.target.value })} placeholder="Movimiento (ej: Thruster)" aria-label="Movimiento"
                          className="h-11 px-3 rounded-xl bg-p text-base sm:text-sm outline-none focus:ring-2 focus:ring-ac/50 placeholder:text-fa min-w-0" />
                        <button type="button" onClick={() => patchW(w.key, { movs: w.movs.filter((_, j) => j !== i) })} aria-label="Quitar movimiento"
                          className="size-8 rounded-full grid place-items-center text-fa hover:text-rd"><X size={15} aria-hidden /></button>
                        <div className="col-start-2 grid grid-cols-2 gap-1.5">
                          <LoadInput sign="♂" unit={unit} value={m.m} onChange={v => patchMov(w.key, i, { m: v })} label={`Carga masculina en ${unit}`} />
                          <LoadInput sign="♀" unit={unit} value={m.f} onChange={v => patchMov(w.key, i, { f: v })} label={`Carga femenina en ${unit}`} />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <button type="button" onClick={() => patchW(w.key, { movs: [...w.movs, emptyMov()] })}
                    className="self-start inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-ac text-xs font-bold hover:bg-ac/10">
                    <Plus size={14} aria-hidden /> Movimiento
                  </button>
                </div>

                <textarea value={w.description} onChange={e => patchW(w.key, { description: e.target.value })} rows={2} placeholder="Detalles: estándares, rondas, buy-in… (opcional)"
                  aria-label="Descripción del workout"
                  className="w-full px-4 py-3 rounded-2xl bg-p2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-ac/50 placeholder:text-fa resize-y" />
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>

        <motion.button type="button" layout whileTap={{ scale: 0.97 }} onClick={() => setWorkouts(ws => [...ws, emptyWorkout(ws.length + 1)])}
          className="h-14 rounded-2xl border-2 border-dashed border-[var(--ln2)] text-mu font-bold flex items-center justify-center gap-2 hover:text-t hover:border-ac/50 transition-colors">
          <Plus size={18} aria-hidden /> Agregar workout
        </motion.button>

        <div className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] lg:bottom-6 inset-x-0 lg:left-[240px] px-4 z-30 pointer-events-none">
          <motion.button type="submit" disabled={saving} whileTap={{ scale: 0.97 }}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...SPRING, delay: 0.2 }}
            className="pointer-events-auto mx-auto w-full max-w-2xl h-14 rounded-full bg-ac text-onac font-bold text-base flex items-center justify-center gap-2 shadow-[0_12px_32px_-8px_rgb(var(--c-ac)/0.6)] disabled:opacity-60">
            <Save size={18} aria-hidden /> {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear evento'}
          </motion.button>
        </div>
      </form>
    </>
  )
}

function LoadInput({ sign, unit, value, onChange, label }: { sign: string; unit: Unit; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex items-center h-10 rounded-xl bg-p px-3 gap-1.5 focus-within:ring-2 focus-within:ring-ac/50">
      <span className="text-mu text-sm" aria-hidden>{sign}</span>
      <input value={value} onChange={e => onChange(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="Sin carga" aria-label={label}
        className="w-full min-w-0 bg-transparent text-base sm:text-sm font-bold outline-none placeholder:text-fa placeholder:font-normal" />
      <span className="text-fa text-xs">{unit}</span>
    </label>
  )
}
