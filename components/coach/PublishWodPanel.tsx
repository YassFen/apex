'use client'
import { MorphIcon } from '@/components/ui/MorphIcon'
import { useState, useMemo, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { addDaysISO, formatDateOnly, relativeDayLabel } from '@/lib/utils/dates'
import { friendlyError, isMissingColumn } from '@/lib/utils/errors'
import { ActivePill } from '@/components/ui/motion'
import { cn } from '@/lib/utils/cn'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ChevronDown, ChevronUp, Plus, Trash2, Check, Send, Copy, FileText, Settings2, Dumbbell, Pencil, Eye, EyeOff, CalendarClock } from '@/components/ui/icons'
import type { Profile, Box, Movement, MovementCategory } from '@/lib/types/database'

type WodType = 'fortime' | 'amrap' | 'emom' | 'tabata' | 'strength'

interface WodMovement {
  name: string
  reps: string
  weight: string
  category: MovementCategory | ''
}

const EMPTY_MOV = (): WodMovement => ({
  name: '', reps: '', weight: '', category: '',
})

const WOD_TYPE_INFO: Record<WodType, { label: string; desc: string; cls: string }> = {
  fortime:  { label: 'For Time', desc: 'Completar lo antes posible',                      cls: 'border-or/30 bg-or/10 text-or' },
  amrap:    { label: 'AMRAP',    desc: 'Máximas rondas en el tiempo',                     cls: 'border-ac/30 bg-ac/10 text-ac' },
  emom:     { label: 'EMOM',     desc: 'Cada minuto en el minuto',                        cls: 'border-bl/30 bg-bl/10 text-bl' },
  tabata:   { label: 'Tabata',   desc: '20 segundos de trabajo por 10 de descanso',       cls: 'border-pu/30 bg-pu/10 text-pu' },
  strength: { label: 'Strength', desc: 'Fuerza pura, cargas máximas',                     cls: 'border-gr/30 bg-gr/10 text-gr' },
}

const WOD_TYPES: WodType[] = ['fortime', 'amrap', 'emom', 'tabata', 'strength']

// Benchmark removed — benchmarks are named WODs, not picked by movement.
const CAT_CHIPS: { label: string; cats: MovementCategory[]; icon: string }[] = [
  { label: 'Levantamiento',   cats: ['weightlifting', 'olympic'], icon: '🏋️' },
  { label: 'Gimnástico',      cats: ['gymnastics'],               icon: '🤸' },
  { label: 'Monoestructural', cats: ['cardio'],                   icon: '🚣' },
]

const CAT_TO_GROUP: Record<string, 'Levantamiento' | 'Gimnástico' | 'Monoestructural' | ''> = {
  weightlifting: 'Levantamiento',
  olympic: 'Levantamiento',
  gymnastics: 'Gimnástico',
  cardio: 'Monoestructural',
  benchmark: '',
}

function movCategory(name: string, movements: Movement[]): MovementCategory | '' {
  return movements.find(m => m.name === name)?.category ?? ''
}

// Only Levantamiento category shows load; everyone else just reps/distance
function shouldShowWeight(cat: MovementCategory | ''): boolean {
  return cat === 'weightlifting' || cat === 'olympic'
}

// Display: "10 Back Squat / @ 220 lb"  OR  "21 Pull-ups"  OR  "400m Run"
function formatMovDisplay(m: WodMovement): string {
  const parts: string[] = []
  if (m.reps) parts.push(m.reps)
  parts.push(m.name)
  let line = parts.join(' ')
  if (m.weight && shouldShowWeight(m.category)) line += ` / @ ${m.weight}`
  return line
}

// Export: "10 BACK SQUAT (220 LB)"
function formatMovExport(m: WodMovement): string {
  const parts: string[] = []
  if (m.reps) parts.push(m.reps)
  parts.push(m.name.toUpperCase())
  let line = parts.join(' ')
  if (m.weight && shouldShowWeight(m.category)) line += ` (${m.weight.toUpperCase()})`
  return line
}

function buildWodText(args: {
  title: string; type: WodType; duration: string; desc: string; movs: WodMovement[]; boxName: string; day: string
}): string {
  const { title, type, duration, desc, movs, boxName } = args
  const date = formatDateOnly(args.day, { weekday: 'long', day: 'numeric', month: 'long' })
  const header = `🔥 WOD · ${boxName.toUpperCase()} 🔥\n${date}\n────────────────`
  const typeLabel = WOD_TYPE_INFO[type].label
  const timeLine  = duration ? ` · ${duration} min` : ''
  const titleLine = title ? `\n📌 ${title.toUpperCase()}` : ''
  const typeLine  = `\n⚡ ${typeLabel.toUpperCase()}${timeLine}`
  const descLine  = desc ? `\n\n${desc}` : ''
  const movLines = movs.length
    ? '\n\n' + movs.map((m, i) => `${i + 1}. ${formatMovExport(m)}`).join('\n')
    : ''
  const footer = `\n\n💪 ¡Dale con todo, APEX!`
  return `${header}${titleLine}${typeLine}${descLine}${movLines}${footer}`
}

type StepKey = 'format' | 'movs' | 'publish'

export interface ScheduledDay { date: string; title: string; isLive: boolean }

export function PublishWodPanel({
  profile, box, movements: allMovements, todayWod, date, today, scheduled, aheadDays, source = null,
}: {
  profile: Profile; box: Box; movements: Movement[]; todayWod: any
  date: string; today: string; scheduled: ScheduledDay[]; aheadDays: number
  /** An older WOD from the library, used to prefill a new day (?from=). */
  source?: any
}) {
  const supabase = createClient()
  const router   = useRouter()
  const { fire } = useToast()

  // The WOD of that day, or (new day) the older one picked from the library.
  const base = todayWod ?? source
  const [title, setTitle]       = useState(base?.title ?? '')
  const [type, setType]         = useState<WodType>(base?.type ?? 'fortime')
  const [desc, setDesc]         = useState(base?.description ?? '')
  const [duration, setDuration] = useState(base?.duration_mins?.toString() ?? '')
  const [publishing, setPublishing] = useState(false)
  // Stay disabled until the screen finished moving to the saved WOD (a double tap used to publish twice).
  const [navigating, startNav] = useTransition()
  const busy = publishing || navigating
  const isToday = date === today
  const isPast = date < today
  const dayLabel = isToday ? 'hoy' : isPast ? 'ayer' : `el ${formatDateOnly(date, { weekday: 'long', day: 'numeric', month: 'long' })}`
  // Future WODs: the coach decides if athletes see them before the day.
  const [showEarly, setShowEarly] = useState<boolean>(todayWod?.show_early ?? false)

  const [wodMovs, setWodMovs] = useState<WodMovement[]>(
    (base?.movements as any[] ?? []).map((m: any) => ({
      name: m.name ?? '', reps: m.reps ?? '', weight: m.weight ?? '',
      category: movCategory(m.name ?? '', allMovements),
    }))
  )

  // Draft autosave (new WODs only): a reload or a closed tab doesn't lose the work.
  const draftKey = `apex.wodDraft.${box.id}.${date}.${todayWod?.id ?? (source ? `from-${source.id}` : 'new')}`
  const draftLoaded = useRef(false)
  useEffect(() => {
    if (todayWod || source) { draftLoaded.current = true; return }
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) ?? 'null')
      if (d && d.date === date && (d.title || d.movs?.length)) {
        setTitle(d.title ?? ''); setType(d.type ?? 'fortime'); setDesc(d.desc ?? '')
        setDuration(d.duration ?? ''); setWodMovs(d.movs ?? [])
        fire('Recuperamos tu borrador', 'info')
      }
    } catch {}
    draftLoaded.current = true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (todayWod || !draftLoaded.current) return
    try {
      localStorage.setItem(draftKey, JSON.stringify({ date, title, type, desc, duration, movs: wodMovs }))
    } catch {}
  }, [todayWod, draftKey, date, title, type, desc, duration, wodMovs])

  const [openStep, setOpenStep] = useState<Record<StepKey, boolean>>({
    format: !title, movs: true, publish: true,
  })
  const toggle = (s: StepKey) => setOpenStep(o => ({ ...o, [s]: !o[s] }))

  // Add/Edit movement form state
  const [movEditorOpen, setMovEditorOpen]   = useState(false)
  const [editingIdx, setEditingIdx]         = useState<number | null>(null) // null = adding
  const [mCat, setMCat]     = useState<string>('Levantamiento')
  const [mName, setMName]   = useState('')
  const [mReps, setMReps]   = useState('')
  const [mWeight, setMWeight] = useState('')
  const [mError, setMError] = useState<string | null>(null)

  function openAddMov() {
    setEditingIdx(null)
    setMCat('Levantamiento'); setMName(''); setMReps(''); setMWeight('')
    setMError(null)
    setMovEditorOpen(true)
  }

  function openEditMov(idx: number) {
    const m = wodMovs[idx]
    if (!m) return
    setEditingIdx(idx)
    setMCat(CAT_TO_GROUP[m.category as string] || 'Levantamiento')
    setMName(m.name)
    setMReps(m.reps)
    setMWeight(m.weight)
    setMError(null)
    setMovEditorOpen(true)
  }

  function cancelMovEditor() {
    setMovEditorOpen(false); setEditingIdx(null)
    setMName(''); setMReps(''); setMWeight(''); setMError(null)
  }

  const movsForCat = useMemo(() => {
    const group = CAT_CHIPS.find(c => c.label === mCat)
    if (!group) return []
    return allMovements.filter(m => group.cats.includes(m.category as MovementCategory))
  }, [mCat, allMovements])

  // Resolve category: if the name matches a known movement, use its DB category;
  // otherwise infer from the selected chip group (custom movement support).
  function resolveCategory(name: string, fallbackGroup: string): MovementCategory | '' {
    const known = movCategory(name, allMovements)
    if (known) return known
    switch (fallbackGroup) {
      case 'Levantamiento':   return 'weightlifting'
      case 'Gimnástico':      return 'gymnastics'
      case 'Monoestructural': return 'cardio'
      default: return ''
    }
  }

  function saveMovement() {
    const name = mName.trim()
    if (!name) { setMError('Indica el nombre del movimiento'); return }

    const cat = resolveCategory(name, mCat)
    const needsWeight = shouldShowWeight(cat)

    // Validation: reps OR weight must be present.
    // For Levantamiento, both reps and weight are required.
    if (needsWeight) {
      if (!mReps.trim()) { setMError('Las reps son obligatorias'); return }
      if (!mWeight.trim()) { setMError('Indica la carga (peso o %)'); return }
    } else {
      if (!mReps.trim()) { setMError('Indica reps o distancia'); return }
    }

    const nextMov: WodMovement = {
      name,
      reps: mReps.trim(),
      weight: needsWeight ? mWeight.trim() : '',
      category: cat,
    }

    if (editingIdx !== null) {
      setWodMovs(prev => prev.map((mov, i) => i === editingIdx ? nextMov : mov))
    } else {
      setWodMovs(prev => [...prev, nextMov])
    }
    cancelMovEditor()
  }

  // Enter inside the movement editor adds the movement instead of submitting
  // (publishing) the whole WOD form.
  function addOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    saveMovement()
  }

  function removeMovement(i: number) {
    setWodMovs(prev => prev.filter((_, idx) => idx !== i))
  }

  async function saveDay(body: Record<string, unknown>): Promise<{ error: any; data?: any }> {
    // One WOD per box and day: upsert on (box_id, scheduled_for).
    const up = await supabase.from('daily_wods').upsert(body, { onConflict: 'box_id,scheduled_for' }).select('id').single()
    if (up.error?.code !== '42P10') return up as { error: any; data?: any }
    // No unique index yet: look for that day's WOD by hand.
    const { data: ex } = await supabase.from('daily_wods').select('id').eq('box_id', box.id).eq('scheduled_for', date).limit(1).maybeSingle()
    const id = (ex as any)?.id ?? todayWod?.id
    return (id
      ? supabase.from('daily_wods').update(body).eq('id', id).select('id').single()
      : supabase.from('daily_wods').insert(body).select('id').single()) as unknown as { error: any; data?: any }
  }

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!title.trim()) { fire('Ponle un nombre al WOD antes de publicar', 'error'); return }
    setPublishing(true)
    const payload: Record<string, unknown> = {
      box_id: box.id, coach_id: profile.id, title, type,
      description: desc,
      duration_mins: duration ? Number(duration) : null,
      movements: wodMovs.filter(m => m.name),
      scheduled_for: date, is_live: true, class_time: null,
      ...(date > today ? { show_early: showEarly } : {}),
    }
    let { error } = await saveDay(payload)
    // Without the early-view column or the old class_time one, save without them.
    if (error && isMissingColumn(error)) {
      const { show_early: _a, class_time: _b, ...rest } = payload
      ;({ error } = await saveDay(rest))
    }
    if (error) { setPublishing(false); fire(friendlyError(error.message), 'error'); return }
    try { localStorage.removeItem(draftKey) } catch {}
    if (date <= today) fire(isToday ? 'WOD publicado. Tus atletas ya lo ven.' : 'WOD de ayer actualizado.', 'pr')
    else fire(`WOD programado para ${dayLabel}${showEarly ? '. Tus atletas ya lo pueden ver.' : '. Se revela ese día.'}`, 'pr')
    // The page reloads with the saved WOD; the button stays off until it does.
    startNav(() => { router.refresh() })
    setPublishing(false)
  }

  const [confirm, setConfirm] = useState<null | 'clear' | 'remove'>(null)
  const [removing, setRemoving] = useState(false)

  function handleClear() {
    setTitle(''); setDesc(''); setDuration(''); setWodMovs([])
    setOpenStep({ format: true, movs: true, publish: true })
    setConfirm(null)
  }

  // Delete this day's WOD. Without the delete policy from migration 005 RLS
  // silently deletes nothing, so fall back to hiding it (is_live = false).
  async function handleRemove() {
    if (!todayWod) return
    setRemoving(true)
    const { data, error } = await supabase.from('daily_wods').delete().eq('id', todayWod.id).select('id')
    let failed = !!error
    if (!error && (data ?? []).length === 0) {
      const { error: hideErr } = await supabase.from('daily_wods').update({ is_live: false }).eq('id', todayWod.id)
      failed = !!hideErr
    }
    setRemoving(false)
    setConfirm(null)
    if (failed) { fire('No se pudo quitar el WOD. Inténtalo de nuevo.', 'error'); return }
    fire('WOD quitado. Tus atletas ya no lo ven.', 'ok')
    router.push('/dashboard')
    router.refresh()
  }

  function handleExportText() {
    const text = buildWodText({ title, type, duration, desc, movs: wodMovs.filter(m => m.name), boxName: box.name, day: date })
    navigator.clipboard.writeText(text)
      .then(() => fire('Texto del WOD copiado. Pégalo en WhatsApp.', 'pr'))
      .catch(() => fire('No se pudo copiar. Selecciona el texto y cópialo a mano.', 'error'))
  }

  const step1Done = !!title
  const step2Done = wodMovs.filter(m => m.name).length > 0
  const weightRequired = shouldShowWeight(resolveCategory(mName.trim(), mCat))

  return (
    <>
      <Topbar title="WOD" profile={profile} />

      <div className="p-4 lg:p-6 max-w-3xl mx-auto flex flex-col gap-4 w-full">
        <DayStrip date={date} today={today} scheduled={scheduled} aheadDays={aheadDays} boxId={box.id} />

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="font-display text-xl font-bold tracking-tight">
              {isToday ? 'WOD de hoy' : `WOD · ${relativeDayLabel(date, today)}`}
            </div>
            <div className="text-mu text-xs mt-0.5 first-letter:uppercase">
              {isToday ? 'Construye, exporta y publica el WOD del día' : isPast ? 'Corrige el WOD de ayer' : `Programa el WOD para ${dayLabel}`}
            </div>
          </div>
          <button type="button" onClick={() => setConfirm('clear')}
                  className="px-3 py-1.5 rounded-lg bg-rd/10 border border-rd/18 text-rd text-xs font-bold hover:bg-rd/15 transition flex items-center gap-1.5">
            <Trash2 size={12} strokeWidth={2.5} />
            Limpiar
          </button>
        </div>

        {!todayWod && source && (
          <div className="p-3 pl-4 rounded-xl bg-ac/10 text-ac text-sm font-semibold">
            Copiamos «{source.title}». Cámbialo si quieres y publícalo.
          </div>
        )}
        {todayWod && !todayWod.is_live && (
          <div className="p-3 pl-4 rounded-xl bg-p2 text-mu text-sm font-semibold">
            Quitaste el WOD de {dayLabel}. Si lo guardas, se vuelve a publicar.
          </div>
        )}
        {todayWod?.is_live && (
          <div className="p-3 pl-4 rounded-xl bg-or/10 text-or text-sm font-semibold flex items-center gap-3">
            <span className="flex-1">{isToday ? 'Ya hay un WOD publicado hoy. Guardar lo actualiza en vivo.' : isPast ? 'Guardar actualiza el WOD de ayer.' : `Ya programaste un WOD para ${dayLabel}. Guardar lo actualiza.`}</span>
            <button type="button" onClick={() => setConfirm('remove')}
              className="flex-shrink-0 h-9 px-3 rounded-full bg-rd/15 text-rd text-xs font-bold hover:bg-rd/25 transition">
              Quitar WOD
            </button>
          </div>
        )}

        <ConfirmDialog
          open={confirm === 'clear'}
          title="¿Limpiar el formulario?"
          body="Se borran el título, la descripción y los movimientos que estás editando. El WOD publicado no cambia hasta que guardes."
          confirmLabel="Limpiar"
          danger
          onConfirm={handleClear}
          onClose={() => setConfirm(null)}
        />
        <ConfirmDialog
          open={confirm === 'remove'}
          title={`¿Quitar el WOD de ${dayLabel}?`}
          body="Tus atletas dejarán de verlo, junto con los resultados registrados en él."
          confirmLabel="Quitar"
          danger
          busy={removing}
          onConfirm={handleRemove}
          onClose={() => setConfirm(null)}
        />

        <form onSubmit={handlePublish} className="flex flex-col gap-3">

          {/* ── STEP 1: Formato ── */}
          <Step
            n={1} title="Formato del WOD"
            sub={step1Done ? `${WOD_TYPE_INFO[type].label}${duration ? ` · ${duration} min` : ''} — ${title}` : 'Tipo, duración y título'}
            icon={<Settings2 size={14} />}
            done={step1Done} open={openStep.format} onToggle={() => toggle('format')}
          >
            <div className="flex flex-col gap-4">
              <div>
                <Label>Tipo de WOD</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {WOD_TYPES.map(t => {
                    const info = WOD_TYPE_INFO[t]
                    const active = type === t
                    return (
                      <button key={t} type="button" onClick={() => setType(t)}
                        className={`p-3 rounded-xl border text-left transition ${active ? info.cls : 'border-[var(--ln2)] text-mu hover:border-mu hover:text-t'}`}>
                        <div className="font-display font-bold text-[15px] tracking-tight">{info.label}</div>
                        <div className={`text-[10px] mt-0.5 leading-snug ${active ? 'opacity-80' : 'text-fa'}`}>{info.desc}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Título *</Label>
                  <input required value={title} onChange={e => setTitle(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-p2 text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60"
                    placeholder="Ej: Fran, Thursday Chipper…" />
                </div>
                {(type === 'amrap' || type === 'emom' || type === 'tabata' || type === 'fortime') && (
                  <div>
                    <Label>{type === 'emom' ? 'Duración (min · 1 movimiento por minuto)' : 'Duración (min)'}</Label>
                    <input type="number" value={duration} onChange={e => setDuration(e.target.value)} min="1"
                      className="w-full px-3 py-2.5 rounded-xl bg-p2 text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60"
                      placeholder="20" />
                  </div>
                )}
              </div>
              <div>
                <Label>Instrucciones / descripción</Label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-p2 text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 resize-none"
                  placeholder={`Ej: 3 rounds for time\n21 Thrusters (95/65 lb)\n21 Pull-ups`} />
              </div>

              {step1Done && (
                <button type="button" onClick={() => { setOpenStep(o => ({ ...o, format: false, movs: true })) }}
                        className="self-end inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ac/10 border border-ac/22 text-ac text-xs font-bold hover:bg-ac/15">
                  <Check size={12} strokeWidth={2.5} /> Continuar
                </button>
              )}
            </div>
          </Step>

          {/* ── STEP 2: Movimientos ── */}
          <Step
            n={2} title="Movimientos"
            sub={step2Done ? `${wodMovs.filter(m => m.name).length} movimiento(s)` : 'Arma la estructura de la rutina'}
            icon={<Dumbbell size={14} />}
            done={step2Done} open={openStep.movs} onToggle={() => toggle('movs')}
          >
            <div className="flex flex-col gap-2.5">
              {wodMovs.length === 0 && !movEditorOpen && (
                <div className="text-center py-6 text-fa text-sm border border-dashed border-[var(--ln2)] rounded-xl">
                  Aún no hay movimientos
                </div>
              )}

              {wodMovs.map((m, i) => (
                <MovDisplayRow
                  key={i}
                  index={i}
                  mov={m}
                  onEdit={() => openEditMov(i)}
                  onDelete={() => removeMovement(i)}
                />
              ))}

              {!movEditorOpen ? (
                <button type="button" onClick={openAddMov}
                  className="w-full py-3 rounded-xl border border-dashed border-[var(--ln2)] text-mu text-sm font-semibold hover:text-ac hover:border-ac/30 transition flex items-center justify-center gap-2">
                  <Plus size={14} strokeWidth={2.5} /> Agregar movimiento
                </button>
              ) : (
                <div className="p-4 bg-p3 rounded-xl border border-ac/15">
                  <div className="text-xs text-ac font-semibold mb-2.5">
                    {editingIdx !== null ? 'Editar movimiento' : 'Agregar movimiento'}
                  </div>

                  <div className="flex gap-1.5 flex-wrap mb-2.5">
                    {CAT_CHIPS.map(c => (
                      <button key={c.label} type="button" onClick={() => { setMCat(c.label); setMName(''); setMError(null) }}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                                mCat === c.label ? 'bg-ac/10 text-ac border-ac/22' : 'border-[var(--ln2)] text-mu hover:text-t'
                              }`}>
                        {c.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-1.5 flex-wrap mb-3 max-h-28 overflow-y-auto p-1">
                    {movsForCat.map(mov => (
                      <button key={mov.id} type="button" onClick={() => { setMName(mov.name); setMError(null) }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                                mName === mov.name ? 'bg-ac text-onac border-ac' : 'bg-p2 border-[var(--ln)] text-mu hover:text-t'
                              }`}>
                        {mov.name}
                      </button>
                    ))}
                    {movsForCat.length === 0 && <div className="text-fa text-xs">Sin movimientos en esta categoría</div>}
                  </div>

                  <div className={`grid grid-cols-1 ${weightRequired ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-2.5`}>
                    <div>
                      <Label small>Movimiento (o custom)</Label>
                      <input value={mName} onChange={e => { setMName(e.target.value); setMError(null) }} onKeyDown={addOnEnter}
                        className="w-full px-3 py-2 rounded-lg bg-p2 border border-[var(--ln)] text-t text-base sm:text-sm outline-none focus:border-ac"
                        placeholder="Ej: Burpee, Custom mov…" />
                    </div>
                    <div>
                      <Label small>Reps / Distancia *</Label>
                      <input value={mReps} onChange={e => { setMReps(e.target.value); setMError(null) }} onKeyDown={addOnEnter}
                        className="w-full px-3 py-2 rounded-lg bg-p2 border border-[var(--ln)] text-t text-base sm:text-sm outline-none focus:border-ac"
                        placeholder="10, 21, 400m" />
                    </div>
                    {weightRequired && (
                      <div>
                        <Label small>Carga *</Label>
                        <input value={mWeight} onChange={e => { setMWeight(e.target.value); setMError(null) }} onKeyDown={addOnEnter}
                          className="w-full px-3 py-2 rounded-lg bg-p2 border border-[var(--ln)] text-t text-base sm:text-sm outline-none focus:border-ac"
                          placeholder="220 lb, 75% RM" />
                      </div>
                    )}
                  </div>

                  {mError && (
                    <div className="mt-2.5 text-xs text-rd font-semibold">{mError}</div>
                  )}

                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={cancelMovEditor}
                            className="flex-1 py-2 rounded-lg border border-[var(--ln2)] text-mu text-sm font-bold hover:text-t">
                      Cancelar
                    </button>
                    <button type="button" onClick={saveMovement}
                            className="flex-1 py-2 rounded-lg bg-ac text-onac text-sm font-bold">
                      {editingIdx !== null ? 'Guardar cambios' : 'Agregar'}
                    </button>
                  </div>
                </div>
              )}

              {step2Done && (
                <button type="button" onClick={() => setOpenStep(o => ({ ...o, movs: false, publish: true }))}
                        className="self-end inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ac/10 border border-ac/22 text-ac text-xs font-bold hover:bg-ac/15">
                  <Check size={12} strokeWidth={2.5} /> Continuar
                </button>
              )}
            </div>
          </Step>

          {/* ── STEP 3: Publicar ── */}
          <Step
            n={3} title="Publicar" sub="Comparte el WOD con tu box"
            icon={<FileText size={14} />}
            done={false} open={openStep.publish} onToggle={() => toggle('publish')}
          >
            {date > today && (
              <div className="grid grid-cols-2 gap-2 mb-3" role="radiogroup" aria-label="Cuándo lo ven los atletas">
                {([
                  [false, EyeOff, 'Revelar ese día', 'Los atletas ven que hay WOD, pero no cuál'],
                  [true,  Eye,    'Mostrar desde ya', 'Aparece en su calendario ahora'],
                ] as const).map(([v, Icon, label, sub]) => (
                  <button key={label} type="button" role="radio" aria-checked={showEarly === v} onClick={() => setShowEarly(v)}
                    className={cn('relative isolate text-left p-3 rounded-xl transition-colors', showEarly === v ? 'text-t' : 'text-mu bg-p2 hover:text-t')}>
                    {showEarly === v && <ActivePill layoutId="wod-visibility" className="rounded-xl bg-ac/15 ring-1 ring-ac/40" />}
                    <Icon size={16} className={showEarly === v ? 'text-ac' : ''} aria-hidden />
                    <div className="text-sm font-bold mt-1.5">{label}</div>
                    <div className="text-[11px] text-mu leading-snug mt-0.5">{sub}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <Button type="submit" size="lg" className="sm:flex-1 h-14 text-base" disabled={busy}>
                {date <= today ? <Send size={16} strokeWidth={2.2} /> : <CalendarClock size={16} strokeWidth={2.2} />}
                {busy ? 'Guardando…'
                  : isToday ? (todayWod ? 'Actualizar WOD en vivo' : 'Publicar WOD en vivo')
                  : isPast ? 'Guardar WOD de ayer'
                  : (todayWod ? 'Actualizar WOD programado' : 'Programar WOD')}
              </Button>
              <Button type="button" variant="secondary" size="lg" className="sm:w-auto" onClick={handleExportText}>
                <Copy size={14} strokeWidth={2.2} />
                Copiar para WhatsApp
              </Button>
            </div>
          </Step>
        </form>
      </div>
    </>
  )
}

// ── Step accordion ──────────────────────────────────────────────────────────────
function Step({ n, title, sub, icon, done, open, onToggle, children }: {
  n: number; title: string; sub: string; icon: React.ReactNode
  done: boolean; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className={`rounded-[24px] transition-colors ${done ? 'bg-p ring-1 ring-inset ring-ac/30' : 'bg-p'}`}>
      <button type="button" onClick={onToggle}
              className="w-full flex items-center gap-3 p-4 text-left">
        <div className={`w-8 h-8 rounded-full grid place-items-center font-display font-bold text-sm flex-shrink-0 ${
          done ? 'bg-ac text-onac' : 'bg-p3 text-mu border border-[var(--ln2)]'
        }`}>
          {done ? <Check size={14} strokeWidth={3} /> : n}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-mu">{icon}</span>
            <div className="font-display font-bold text-base truncate tracking-tight">{title}</div>
          </div>
          <div className="text-mu text-[12px] mt-0.5 truncate">{sub}</div>
        </div>
        <MorphIcon icon={open ? 'chevron-up' : 'chevron-down'} size={18} strokeWidth={1.8} className="text-mu flex-shrink-0" />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t border-[var(--ln)]">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  )
}

function Label({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <div className={` text-mu font-semibold mb-1.5 ${small ? 'text-xs' : 'text-xs'}`}>
      {children}
    </div>
  )
}

// ── Display row (read-only; click to edit) ─────────────────────────────────────
function MovDisplayRow({ index, mov, onEdit, onDelete }: {
  index: number; mov: WodMovement; onEdit: () => void; onDelete: () => void
}) {
  const showWeight = shouldShowWeight(mov.category)
  return (
    <div className="rounded-xl border border-[var(--ln)] bg-p3 flex items-center gap-3 px-3 py-3">
      <div className="w-7 h-7 rounded-full bg-ac text-onac grid place-items-center font-display font-bold text-xs flex-shrink-0 tracking-tight">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          {mov.reps && (
            <span className="font-display font-bold text-[17px] text-t leading-none tracking-tight">{mov.reps}</span>
          )}
          <span className="font-semibold text-sm text-t leading-tight">{mov.name}</span>
          {showWeight && mov.weight && (
            <span className="text-mu text-[12px]">
              / <span className="text-ac font-bold">@ {mov.weight}</span>
            </span>
          )}
        </div>
      </div>
      <button type="button" onClick={onEdit} aria-label="Editar"
              className="w-8 h-8 rounded-full bg-p2 border border-[var(--ln2)] text-fa grid place-items-center hover:text-ac hover:border-ac/30 transition flex-shrink-0">
        <Pencil size={13} strokeWidth={2} />
      </button>
      <button type="button" onClick={onDelete} aria-label="Eliminar"
              className="w-8 h-8 rounded-full bg-rd/10 border border-rd/20 text-rd grid place-items-center hover:bg-rd/20 transition flex-shrink-0">
        <Trash2 size={13} strokeWidth={2} />
      </button>
    </div>
  )
}

// ── Day strip: today + the next two weeks, with a dot on programmed days ───────
function DayStrip({ date, today, scheduled, aheadDays, boxId }: { date: string; today: string; scheduled: ScheduledDay[]; aheadDays: number; boxId: string }) {
  // Yesterday (to fix it), today and the next two weeks.
  const days = Array.from({ length: aheadDays + 2 }, (_, i) => addDaysISO(today, i - 1))
  const byDate = new Map(scheduled.map(s => [s.date, s]))
  return (
    <nav aria-label="Elegir día" className="-mx-4 lg:mx-0 px-4 lg:px-0 flex gap-1.5 overflow-x-auto scrollbar-none snap-x">
      {days.map(d => {
        const active = d === date
        const wod = byDate.get(d)
        return (
          <Link key={d} href={d === today ? `/coach/publish-wod?box=${boxId}` : `/coach/publish-wod?box=${boxId}&date=${d}`} scroll={false}
            aria-current={active ? 'date' : undefined}
            aria-label={`${formatDateOnly(d, { weekday: 'long', day: 'numeric', month: 'long' })}${wod ? ', con WOD' : ''}`}
            className={cn('relative isolate snap-start flex-shrink-0 w-[52px] h-[68px] rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors',
              active ? 'text-onac' : 'bg-p text-mu hover:text-t')}>
            {active && <ActivePill layoutId="publish-day" className="rounded-2xl bg-ac" />}
            <span className="text-[10px] font-bold uppercase">{d === today ? 'Hoy' : d < today ? 'Ayer' : formatDateOnly(d, { weekday: 'short' }).replace('.', '')}</span>
            <span className="font-display text-2xl font-bold leading-none tracking-tight">{Number(d.slice(8, 10))}</span>
            <span className={cn('size-1.5 rounded-full', wod ? (active ? 'bg-onac' : wod.isLive ? 'bg-ac' : 'bg-fa') : 'bg-transparent')} aria-hidden />
          </Link>
        )
      })}
    </nav>
  )
}
