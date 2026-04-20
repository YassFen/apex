'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { Profile, Box, Movement, MovementCategory } from '@/lib/types/database'

type WodType = 'fortime' | 'amrap' | 'emom' | 'tabata' | 'strength'

interface WodMovement {
  name: string
  reps: string      // "21 reps" | "400m" | "Max reps" | "5 reps"
  weight: string    // "95/65 lb" | "60 kg" | ""
  sets: number      // number of sets (1–10)
  est_mins: number  // estimated minutes per set
  rest_secs: number // rest between sets (seconds)
  category: MovementCategory | ''
}

const EMPTY_MOV = (): WodMovement => ({
  name: '', reps: '', weight: '', sets: 1, est_mins: 2, rest_secs: 60, category: '',
})

const CAT_GROUPS: { label: string; cats: MovementCategory[]; color: string; icon: string }[] = [
  { label: 'Fuerza / Olímpico', cats: ['weightlifting', 'olympic'], color: 'text-gr border-gr/25 bg-gr/5', icon: '🏋️' },
  { label: 'Gymnastics / Calistenia', cats: ['gymnastics'],         color: 'text-pu border-pu/25 bg-pu/5', icon: '🤸' },
  { label: 'Cardio / Monostructural', cats: ['cardio', 'benchmark'],color: 'text-or border-or/25 bg-or/5', icon: '🏃' },
]

const WOD_TYPE_INFO: Record<WodType, { label: string; desc: string; color: string }> = {
  fortime:  { label: 'For Time',  desc: 'Completar lo antes posible',        color: 'bg-or text-bg border-or' },
  amrap:    { label: 'AMRAP',     desc: 'Máximas rondas en el tiempo',        color: 'bg-ac text-bg border-ac' },
  emom:     { label: 'EMOM',      desc: 'Cada minuto en el minuto',           color: 'bg-bl text-bg border-bl' },
  tabata:   { label: 'Tabata',    desc: '20s trabajo / 10s descanso × 8',    color: 'bg-pu text-bg border-pu' },
  strength: { label: 'Strength',  desc: 'Fuerza pura, cargas máximas',        color: 'bg-gr text-bg border-gr' },
}

const WOD_TYPES: WodType[] = ['fortime', 'amrap', 'emom', 'tabata', 'strength']

function movCategory(name: string, movements: Movement[]): MovementCategory | '' {
  return movements.find(m => m.name === name)?.category ?? ''
}

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
      name: m.name ?? '',
      reps: m.reps ?? '',
      weight: m.weight ?? '',
      sets: m.sets ?? 1,
      est_mins: m.est_mins ?? 2,
      rest_secs: m.rest_secs ?? 60,
      category: movCategory(m.name ?? '', allMovements),
    }))
  )

  function addMovement(cat: MovementCategory | '' = '') {
    setWodMovs(prev => [...prev, { ...EMPTY_MOV(), category: cat }])
  }

  function removeMovement(i: number) { setWodMovs(prev => prev.filter((_, idx) => idx !== i)) }

  function updateMov<K extends keyof WodMovement>(i: number, field: K, val: WodMovement[K]) {
    setWodMovs(prev => prev.map((m, idx) => {
      if (idx !== i) return m
      const updated = { ...m, [field]: val }
      if (field === 'name') updated.category = movCategory(val as string, allMovements)
      return updated
    }))
  }

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

  // Group movements by category for display
  const movsByGroup = CAT_GROUPS.map(g => ({
    ...g,
    items: wodMovs
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => g.cats.includes(m.category as MovementCategory)),
  }))
  const ungrouped = wodMovs
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => !m.category || !CAT_GROUPS.some(g => g.cats.includes(m.category as MovementCategory)))

  return (
    <>
      <Topbar title="Publicar WOD" profile={profile} />
      {toastEl}

      <div className="p-4 lg:p-6 max-w-2xl mx-auto flex flex-col gap-4">
        {todayWod && (
          <div className="p-3 rounded-xl bg-or/10 border border-or/20 text-or text-sm font-semibold">
            Ya hay un WOD publicado hoy — guardar reemplazará el actual.
          </div>
        )}

        <form onSubmit={handlePublish} className="flex flex-col gap-4">

          {/* ── Tipo de WOD ── */}
          <Card>
            <div className="font-barlow text-[14px] font-extrabold tracking-widest uppercase text-mu mb-3">TIPO DE WOD</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {WOD_TYPES.map(t => {
                const info = WOD_TYPE_INFO[t]
                const active = type === t
                return (
                  <button key={t} type="button" onClick={() => setType(t)}
                    className={`p-3 rounded-xl border text-left transition-all ${active ? info.color : 'border-[var(--ln2)] text-mu hover:border-mu hover:text-t'}`}>
                    <div className="font-barlow font-extrabold text-[15px] tracking-wide">{info.label}</div>
                    <div className={`text-[10px] mt-0.5 ${active ? 'opacity-80' : 'text-fa'}`}>{info.desc}</div>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* ── Info básica ── */}
          <Card>
            <div className="font-barlow text-[14px] font-extrabold tracking-widest uppercase text-mu mb-3">INFO</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Título del WOD *</label>
                <input required value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac"
                  placeholder="Ej: Fran, Thursday Chipper, Semana 3 Día 2…" />
              </div>
              {(type === 'amrap' || type === 'emom' || type === 'tabata') && (
                <div>
                  <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
                    Duración {type === 'emom' ? '(minutos — cada minuto = 1 ejercicio)' : '(minutos)'}
                  </label>
                  <input type="number" value={duration} onChange={e => setDuration(e.target.value)} min="1"
                    className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac"
                    placeholder="20" />
                </div>
              )}
              <div>
                <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
                  Instrucciones / descripción
                </label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac resize-none"
                  placeholder={`Ej: 3 rounds for time\n21 Thrusters (95/65 lb)\n21 Pull-ups`} />
              </div>
            </div>
          </Card>

          {/* ── Movimientos agrupados por categoría ── */}
          {CAT_GROUPS.map(group => {
            const groupItems = movsByGroup.find(g => g.label === group.label)?.items ?? []
            const movOptions = allMovements.filter(m => group.cats.includes(m.category as MovementCategory))
            return (
              <Card key={group.label} padding={false}>
                {/* Group header */}
                <div className={`flex items-center justify-between px-4 py-3 border-b border-[var(--ln)] rounded-t-2xl ${group.color.split(' ').filter(c => c.startsWith('bg-')).join(' ')}`}>
                  <div className={`flex items-center gap-2 font-barlow font-extrabold text-[13px] uppercase tracking-widest ${group.color.split(' ').filter(c => c.startsWith('text-')).join(' ')}`}>
                    <span>{group.icon}</span>
                    {group.label}
                  </div>
                  <button type="button"
                    onClick={() => addMovement(group.cats[0])}
                    className={`text-xs font-bold hover:underline ${group.color.split(' ').filter(c => c.startsWith('text-')).join(' ')}`}>
                    + Agregar
                  </button>
                </div>

                <div className="p-3 flex flex-col gap-2.5">
                  {groupItems.length === 0 && (
                    <div className="text-center py-4 text-fa text-sm border border-dashed border-[var(--ln2)] rounded-xl">
                      Sin movimientos en este grupo
                    </div>
                  )}
                  {groupItems.map(({ m, i }) => (
                    <MovRow key={i} m={m} i={i} movOptions={movOptions} updateMov={updateMov} removeMovement={removeMovement} />
                  ))}
                </div>
              </Card>
            )
          })}

          {/* Ungrouped (movement not yet selected) */}
          {ungrouped.length > 0 && (
            <Card>
              <div className="font-barlaw text-[14px] font-extrabold tracking-widest uppercase text-mu mb-3">SIN ASIGNAR</div>
              <div className="flex flex-col gap-2.5">
                {ungrouped.map(({ m, i }) => (
                  <MovRow key={i} m={m} i={i} movOptions={allMovements} updateMov={updateMov} removeMovement={removeMovement} />
                ))}
              </div>
            </Card>
          )}

          {/* Add unassigned */}
          <button type="button" onClick={() => addMovement()}
            className="w-full py-3 rounded-xl border border-dashed border-[var(--ln2)] text-mu text-sm font-semibold hover:text-t hover:border-mu transition-colors">
            + Agregar movimiento
          </button>

          <Button type="submit" size="lg" className="w-full" disabled={publishing}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
            {publishing ? 'Publicando…' : todayWod ? 'Actualizar WOD en vivo' : 'Publicar WOD en vivo 🔴'}
          </Button>
        </form>
      </div>
    </>
  )
}

// ── Movement row component ──────────────────────────────────────────────────────
function MovRow({ m, i, movOptions, updateMov, removeMovement }: {
  m: WodMovement; i: number
  movOptions: Movement[]
  updateMov: <K extends keyof WodMovement>(i: number, f: K, v: WodMovement[K]) => void
  removeMovement: (i: number) => void
}) {
  return (
    <div className="rounded-xl border border-[var(--ln)] overflow-hidden">
      {/* Top row: number + movement + delete */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-p3">
        <div className="w-6 h-6 rounded-full bg-p2 border border-[var(--ln2)] grid place-items-center text-mu font-barlaw font-black text-xs flex-shrink-0">
          {i + 1}
        </div>
        <select value={m.name} onChange={e => updateMov(i, 'name', e.target.value)}
          className="flex-1 bg-transparent border-0 text-t text-sm outline-none min-w-0">
          <option value="">Seleccionar movimiento…</option>
          {movOptions.map(mov => <option key={mov.id} value={mov.name}>{mov.name}</option>)}
        </select>
        <button type="button" onClick={() => removeMovement(i)}
          className="w-6 h-6 rounded-full bg-rd/10 border border-rd/20 text-rd text-sm grid place-items-center hover:bg-rd/20 transition-colors flex-shrink-0">
          ×
        </button>
      </div>

      {/* Detail row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--ln)] border-t border-[var(--ln)]">
        <FieldCell label="Series">
          <input type="number" min="1" max="20" value={m.sets}
            onChange={e => updateMov(i, 'sets', Number(e.target.value))}
            className="w-full bg-transparent text-t text-sm outline-none font-barlaw font-bold text-center" />
        </FieldCell>
        <FieldCell label="Reps / Distancia">
          <input value={m.reps} onChange={e => updateMov(i, 'reps', e.target.value)}
            className="w-full bg-transparent text-t text-sm outline-none font-barlaw font-bold"
            placeholder="21 reps" />
        </FieldCell>
        <FieldCell label="Peso / Carga">
          <input value={m.weight} onChange={e => updateMov(i, 'weight', e.target.value)}
            className="w-full bg-transparent text-t text-sm outline-none"
            placeholder="95/65 lb" />
        </FieldCell>
        <FieldCell label="Tiempo est. (min/serie)">
          <input type="number" min="0.5" step="0.5" value={m.est_mins}
            onChange={e => updateMov(i, 'est_mins', Number(e.target.value))}
            className="w-full bg-transparent text-t text-sm outline-none font-barlaw font-bold text-center" />
        </FieldCell>
        <FieldCell label="Descanso entre series (seg)">
          <input type="number" min="0" step="15" value={m.rest_secs}
            onChange={e => updateMov(i, 'rest_secs', Number(e.target.value))}
            className="w-full bg-transparent text-t text-sm outline-none font-barlaw font-bold text-center" />
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
