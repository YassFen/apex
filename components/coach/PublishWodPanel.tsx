'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ChevronDown, ChevronUp, Plus, Trash2, Check, Send, Copy, FileText, Settings2, Dumbbell } from 'lucide-react'
import type { Profile, Box, Movement, MovementCategory } from '@/lib/types/database'

type WodType = 'fortime' | 'amrap' | 'emom' | 'tabata' | 'strength'

interface WodMovement {
  name: string
  reps: string
  weight: string
  sets: number
  est_mins: number
  rest_secs: number
  category: MovementCategory | ''
}

const EMPTY_MOV = (): WodMovement => ({
  name: '', reps: '', weight: '', sets: 1, est_mins: 2, rest_secs: 60, category: '',
})

const WOD_TYPE_INFO: Record<WodType, { label: string; desc: string; cls: string }> = {
  fortime:  { label: 'For Time', desc: 'Completar lo antes posible',     cls: 'border-or/30 bg-or/10 text-or' },
  amrap:    { label: 'AMRAP',    desc: 'Máximas rondas en el tiempo',    cls: 'border-ac/30 bg-ac/10 text-ac' },
  emom:     { label: 'EMOM',     desc: 'Cada minuto en el minuto',       cls: 'border-bl/30 bg-bl/10 text-bl' },
  tabata:   { label: 'Tabata',   desc: '20s trabajo / 10s descanso × 8', cls: 'border-pu/30 bg-pu/10 text-pu' },
  strength: { label: 'Strength', desc: 'Fuerza pura, cargas máximas',    cls: 'border-gr/30 bg-gr/10 text-gr' },
}

const WOD_TYPES: WodType[] = ['fortime', 'amrap', 'emom', 'tabata', 'strength']

const CAT_CHIPS: { label: string; cats: MovementCategory[]; icon: string }[] = [
  { label: 'Levantamiento',  cats: ['weightlifting', 'olympic'], icon: '🏋️' },
  { label: 'Gimnástico',     cats: ['gymnastics'],               icon: '🤸' },
  { label: 'Monoestructural', cats: ['cardio'],                   icon: '🚣' },
  { label: 'Benchmark',      cats: ['benchmark'],                icon: '🔥' },
]

function movCategory(name: string, movements: Movement[]): MovementCategory | '' {
  return movements.find(m => m.name === name)?.category ?? ''
}

function buildWodText(args: {
  title: string; type: WodType; duration: string; desc: string; movs: WodMovement[]; boxName: string
}): string {
  const { title, type, duration, desc, movs, boxName } = args
  const date = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  const header = `🔥 WOD · ${boxName.toUpperCase()} 🔥\n${date}\n────────────────`
  const typeLabel = WOD_TYPE_INFO[type].label
  const timeLine  = duration ? ` · ${duration} min` : ''
  const titleLine = title ? `\n📌 ${title.toUpperCase()}` : ''
  const typeLine  = `\n⚡ ${typeLabel}${timeLine}`
  const descLine  = desc ? `\n\n${desc}` : ''
  const movLines = movs.length
    ? '\n\n' + movs.map((m, i) => {
        const bits = []
        if (m.sets > 1) bits.push(`${m.sets}×`)
        if (m.reps) bits.push(m.reps)
        if (m.weight) bits.push(`@ ${m.weight}`)
        return `${i + 1}. ${m.name}${bits.length ? ' — ' + bits.join(' ') : ''}`
      }).join('\n')
    : ''
  const footer = `\n\n💪 ¡Dale con todo, APEX!`
  return `${header}${titleLine}${typeLine}${descLine}${movLines}${footer}`
}

type StepKey = 'format' | 'movs' | 'publish'

export function PublishWodPanel({
  profile, box, movements: allMovements, todayWod,
}: { profile: Profile; box: Box; movements: Movement[]; todayWod: any }) {
  const supabase = createClient()
  const router   = useRouter()
  const { fire, element: toastEl } = useToast()

  const [title, setTitle]       = useState(todayWod?.title ?? '')
  const [type, setType]         = useState<WodType>(todayWod?.type ?? 'fortime')
  const [desc, setDesc]         = useState(todayWod?.description ?? '')
  const [duration, setDuration] = useState(todayWod?.duration_mins?.toString() ?? '')
  const [publishing, setPublishing] = useState(false)

  const [wodMovs, setWodMovs] = useState<WodMovement[]>(
    (todayWod?.movements as any[] ?? []).map((m: any) => ({
      name: m.name ?? '', reps: m.reps ?? '', weight: m.weight ?? '',
      sets: m.sets ?? 1, est_mins: m.est_mins ?? 2, rest_secs: m.rest_secs ?? 60,
      category: movCategory(m.name ?? '', allMovements),
    }))
  )

  // Accordion state — open all initially, but auto-collapse step 1 if already filled
  const [openStep, setOpenStep] = useState<Record<StepKey, boolean>>({
    format: !title,
    movs: true,
    publish: true,
  })
  const toggle = (s: StepKey) => setOpenStep(o => ({ ...o, [s]: !o[s] }))

  // Add-movement form state (within step 2)
  const [addOpen, setAddOpen]       = useState(false)
  const [addCat, setAddCat]         = useState<string>('Levantamiento')
  const [addName, setAddName]       = useState('')
  const [addReps, setAddReps]       = useState('')
  const [addWeight, setAddWeight]   = useState('')

  const movsForCat = useMemo(() => {
    const group = CAT_CHIPS.find(c => c.label === addCat)
    if (!group) return []
    return allMovements.filter(m => group.cats.includes(m.category as MovementCategory))
  }, [addCat, allMovements])

  function addMovement() {
    if (!addName) return
    const cat = movCategory(addName, allMovements)
    setWodMovs(prev => [...prev, { ...EMPTY_MOV(), name: addName, reps: addReps, weight: addWeight, category: cat }])
    setAddName(''); setAddReps(''); setAddWeight(''); setAddOpen(false)
  }

  function removeMovement(i: number) { setWodMovs(prev => prev.filter((_, idx) => idx !== i)) }

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault()
    setPublishing(true)
    const today = new Date().toISOString().split('T')[0]
    const payload = {
      box_id: box.id, coach_id: profile.id, title, type,
      description: desc,
      duration_mins: duration ? Number(duration) : null,
      movements: wodMovs.filter(m => m.name),
      scheduled_for: today, is_live: true,
    }
    if (todayWod) {
      await supabase.from('daily_wods').update(payload).eq('id', todayWod.id)
    } else {
      await supabase.from('daily_wods').insert(payload)
    }
    setPublishing(false)
    fire('¡WOD publicado en vivo! 🔴', 'pr')
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  function handleClear() {
    if (!confirm('¿Limpiar todo el WOD?')) return
    setTitle(''); setDesc(''); setDuration(''); setWodMovs([])
    setOpenStep({ format: true, movs: true, publish: true })
  }

  function handleExportText() {
    const text = buildWodText({ title, type, duration, desc, movs: wodMovs.filter(m => m.name), boxName: box.name })
    navigator.clipboard.writeText(text)
      .then(() => fire('Texto del WOD copiado al portapapeles 📋', 'pr'))
      .catch(() => fire('No se pudo copiar — revisa la consola', 'error'))
  }

  // Step completion checks
  const step1Done = !!title
  const step2Done = wodMovs.filter(m => m.name).length > 0

  return (
    <>
      <Topbar title="WOD" profile={profile} />
      {toastEl}

      <div className="p-4 lg:p-6 max-w-3xl mx-auto flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="font-barlow text-xl font-black tracking-wide uppercase">WOD Builder</div>
            <div className="text-mu text-xs mt-0.5">Construye, exporta y publica el WOD del día</div>
          </div>
          <button onClick={handleClear}
                  className="px-3 py-1.5 rounded-lg bg-rd/10 border border-rd/18 text-rd text-xs font-bold hover:bg-rd/15 transition flex items-center gap-1.5">
            <Trash2 size={12} strokeWidth={2.5} />
            Limpiar
          </button>
        </div>

        {todayWod && (
          <div className="p-3 rounded-xl bg-or/10 border border-or/20 text-or text-sm font-semibold">
            Ya hay un WOD publicado hoy — guardar reemplazará el actual.
          </div>
        )}

        <form onSubmit={handlePublish} className="flex flex-col gap-3">

          {/* ── STEP 1: Formato del WOD ── */}
          <Step
            n={1}
            title="Formato del WOD"
            sub={step1Done ? `${WOD_TYPE_INFO[type].label}${duration ? ` · ${duration} min` : ''} — ${title}` : 'Tipo, duración y título'}
            icon={<Settings2 size={14} />}
            done={step1Done}
            open={openStep.format}
            onToggle={() => toggle('format')}
          >
            <div className="flex flex-col gap-4">
              {/* WOD type chips */}
              <div>
                <Label>Tipo de WOD</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {WOD_TYPES.map(t => {
                    const info = WOD_TYPE_INFO[t]
                    const active = type === t
                    return (
                      <button key={t} type="button" onClick={() => setType(t)}
                        className={`p-3 rounded-xl border text-left transition ${active ? info.cls : 'border-[var(--ln2)] text-mu hover:border-mu hover:text-t'}`}>
                        <div className="font-barlow font-extrabold text-[15px] tracking-wide">{info.label}</div>
                        <div className={`text-[10px] mt-0.5 ${active ? 'opacity-80' : 'text-fa'}`}>{info.desc}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Título *</Label>
                  <input required value={title} onChange={e => setTitle(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac"
                    placeholder="Ej: Fran, Thursday Chipper…" />
                </div>
                {(type === 'amrap' || type === 'emom' || type === 'tabata' || type === 'fortime') && (
                  <div>
                    <Label>{type === 'emom' ? 'Duración (min · 1 movimiento por minuto)' : 'Duración (min)'}</Label>
                    <input type="number" value={duration} onChange={e => setDuration(e.target.value)} min="1"
                      className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac"
                      placeholder="20" />
                  </div>
                )}
              </div>
              <div>
                <Label>Instrucciones / descripción</Label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac resize-none"
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
            n={2}
            title="Movimientos"
            sub={step2Done ? `${wodMovs.filter(m => m.name).length} movimiento(s)` : 'Arma la estructura de la rutina'}
            icon={<Dumbbell size={14} />}
            done={step2Done}
            open={openStep.movs}
            onToggle={() => toggle('movs')}
          >
            <div className="flex flex-col gap-2.5">
              {wodMovs.length === 0 && !addOpen && (
                <div className="text-center py-6 text-fa text-sm border border-dashed border-[var(--ln2)] rounded-xl">
                  Aún no hay movimientos
                </div>
              )}

              {wodMovs.map((m, i) => (
                <MovRow
                  key={i}
                  m={m}
                  i={i}
                  movOptions={allMovements}
                  updateMov={(idx, f, v) => setWodMovs(prev => prev.map((mov, k) => {
                    if (k !== idx) return mov
                    const upd = { ...mov, [f]: v }
                    if (f === 'name') upd.category = movCategory(v as string, allMovements)
                    return upd
                  }))}
                  removeMovement={removeMovement}
                />
              ))}

              {!addOpen ? (
                <button type="button" onClick={() => setAddOpen(true)}
                  className="w-full py-3 rounded-xl border border-dashed border-[var(--ln2)] text-mu text-sm font-semibold hover:text-ac hover:border-ac/30 transition flex items-center justify-center gap-2">
                  <Plus size={14} strokeWidth={2.5} /> Agregar movimiento
                </button>
              ) : (
                <div className="p-4 bg-p3 rounded-xl border border-ac/15">
                  <div className="text-[10px] uppercase tracking-[1.4px] text-ac font-bold mb-2.5">Agregar movimiento</div>

                  <div className="flex gap-1.5 flex-wrap mb-2.5">
                    {CAT_CHIPS.map(c => (
                      <button key={c.label} type="button" onClick={() => setAddCat(c.label)}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                                addCat === c.label ? 'bg-ac/10 text-ac border-ac/22' : 'border-[var(--ln2)] text-mu hover:text-t'
                              }`}>
                        <span className="mr-1">{c.icon}</span>{c.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-1.5 flex-wrap mb-3 max-h-28 overflow-y-auto p-1">
                    {movsForCat.map(mov => (
                      <button key={mov.id} type="button" onClick={() => setAddName(mov.name)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                                addName === mov.name ? 'bg-ac text-bg border-ac' : 'bg-p2 border-[var(--ln)] text-mu hover:text-t'
                              }`}>
                        {mov.name}
                      </button>
                    ))}
                    {movsForCat.length === 0 && <div className="text-fa text-xs">Sin movimientos en esta categoría</div>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <Label small>Movimiento (o custom)</Label>
                      <input value={addName} onChange={e => setAddName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-p2 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac"
                        placeholder="Ej: Burpee" />
                    </div>
                    <div>
                      <Label small>Reps / Distancia</Label>
                      <input value={addReps} onChange={e => setAddReps(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-p2 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac"
                        placeholder="21, 5×3, 400m" />
                    </div>
                    <div>
                      <Label small>Carga / Nivel</Label>
                      <input value={addWeight} onChange={e => setAddWeight(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-p2 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac"
                        placeholder="155 lb, 75% RM, BW" />
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => { setAddOpen(false); setAddName(''); setAddReps(''); setAddWeight('') }}
                            className="flex-1 py-2 rounded-lg border border-[var(--ln2)] text-mu text-sm font-bold hover:text-t">
                      Cancelar
                    </button>
                    <button type="button" onClick={addMovement} disabled={!addName}
                            className="flex-1 py-2 rounded-lg bg-ac text-bg text-sm font-bold disabled:opacity-50">
                      Agregar
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

          {/* ── STEP 3: Guardar / Publicar ── */}
          <Step
            n={3}
            title="Publicar"
            sub="Comparte el WOD con tu box"
            icon={<FileText size={14} />}
            done={false}
            open={openStep.publish}
            onToggle={() => toggle('publish')}
          >
            <div className="flex flex-col sm:flex-row gap-2.5">
              <Button type="submit" size="lg" className="flex-1" disabled={publishing}>
                <Send size={16} strokeWidth={2.2} />
                {publishing ? 'Publicando…' : todayWod ? 'Actualizar WOD en vivo' : 'Publicar WOD en vivo 🔴'}
              </Button>
              <Button type="button" variant="secondary" size="lg" className="sm:w-auto" onClick={handleExportText}>
                <Copy size={14} strokeWidth={2.2} />
                Exportar texto
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
    <div className={`rounded-2xl border transition ${
      done ? 'border-ac/22 bg-ac/5' : 'border-[var(--ln)] bg-p'
    }`}>
      <button type="button" onClick={onToggle}
              className="w-full flex items-center gap-3 p-4 text-left">
        <div className={`w-8 h-8 rounded-full grid place-items-center font-barlow font-black text-sm flex-shrink-0 ${
          done ? 'bg-ac text-bg' : 'bg-p3 text-mu border border-[var(--ln2)]'
        }`}>
          {done ? <Check size={14} strokeWidth={3} /> : n}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-mu">{icon}</span>
            <div className="font-barlow font-extrabold text-base tracking-wide uppercase truncate">{title}</div>
          </div>
          <div className="text-mu text-[12px] mt-0.5 truncate">{sub}</div>
        </div>
        {open ? <ChevronUp size={18} className="text-mu flex-shrink-0" /> : <ChevronDown size={18} className="text-mu flex-shrink-0" />}
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
    <div className={`uppercase tracking-[1.6px] text-mu font-bold mb-1.5 ${small ? 'text-[9px]' : 'text-[10px]'}`}>
      {children}
    </div>
  )
}

function MovRow({ m, i, movOptions, updateMov, removeMovement }: {
  m: WodMovement; i: number
  movOptions: Movement[]
  updateMov: <K extends keyof WodMovement>(i: number, f: K, v: WodMovement[K]) => void
  removeMovement: (i: number) => void
}) {
  return (
    <div className="rounded-xl border border-[var(--ln)] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-p3">
        <div className="w-6 h-6 rounded-full bg-ac text-bg grid place-items-center font-barlow font-black text-xs flex-shrink-0">
          {i + 1}
        </div>
        <select value={m.name} onChange={e => updateMov(i, 'name', e.target.value)}
          className="flex-1 bg-transparent border-0 text-t text-sm outline-none min-w-0">
          <option value="">Seleccionar movimiento…</option>
          {movOptions.map(mov => <option key={mov.id} value={mov.name}>{mov.name}</option>)}
        </select>
        <button type="button" onClick={() => removeMovement(i)}
          className="w-6 h-6 rounded-full bg-rd/10 border border-rd/20 text-rd text-sm grid place-items-center hover:bg-rd/20 transition flex-shrink-0">
          ×
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--ln)] border-t border-[var(--ln)]">
        <FieldCell label="Series">
          <input type="number" min="1" max="20" value={m.sets}
            onChange={e => updateMov(i, 'sets', Number(e.target.value))}
            className="w-full bg-transparent text-t text-sm outline-none font-barlow font-bold text-center" />
        </FieldCell>
        <FieldCell label="Reps / Dist.">
          <input value={m.reps} onChange={e => updateMov(i, 'reps', e.target.value)}
            className="w-full bg-transparent text-t text-sm outline-none font-barlow font-bold"
            placeholder="21 reps" />
        </FieldCell>
        <FieldCell label="Peso / Carga">
          <input value={m.weight} onChange={e => updateMov(i, 'weight', e.target.value)}
            className="w-full bg-transparent text-t text-sm outline-none"
            placeholder="95/65 lb" />
        </FieldCell>
        <FieldCell label="Min/serie">
          <input type="number" min="0.5" step="0.5" value={m.est_mins}
            onChange={e => updateMov(i, 'est_mins', Number(e.target.value))}
            className="w-full bg-transparent text-t text-sm outline-none font-barlow font-bold text-center" />
        </FieldCell>
      </div>
    </div>
  )
}

function FieldCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-p3 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[1.4px] text-fa font-bold mb-1">{label}</div>
      {children}
    </div>
  )
}
