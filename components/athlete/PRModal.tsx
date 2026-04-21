'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { parseWeightToLb } from '@/lib/utils/units'
import type { Profile, Movement, MovementCategory } from '@/lib/types/database'

interface Props {
  profile: Profile
  onClose: () => void
  onSaved: (isNewPr?: boolean, diffLb?: number) => void
  editingPr?: any
}

type MetricType = '1rm' | '2rm' | '3rm' | 'max_reps' | 'time' | 'calories'

function timeToSecs(mmss: string): number {
  const parts = mmss.split(':')
  return (parseInt(parts[0] || '0') * 60) + parseInt(parts[1] || '0')
}

/**
 * Auto-formats digits into mm:ss as the user types. Accepts raw digits or
 * already-formatted strings. "345" → "3:45", "1230" → "12:30".
 */
function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 5)
  if (digits.length === 0) return ''
  if (digits.length <= 2) return digits
  const ss = digits.slice(-2)
  const mm = digits.slice(0, -2)
  return `${mm}:${ss}`
}

// Re-label categories per user request: olympic merges into weightlifting,
// cardio renamed to "Monoestructural". DB values stay the same.
const CAT_LABELS: Record<MovementCategory, string> = {
  weightlifting: 'Levantamiento',
  olympic: 'Levantamiento',
  gymnastics: 'Gimnástico / Calistenia',
  benchmark: 'Benchmark WOD',
  cardio: 'Monoestructural',
}

export function PRModal({ profile, onClose, onSaved, editingPr }: Props) {
  const supabase = createClient()
  const isEditing = !!editingPr
  const [movements, setMovements] = useState<Movement[]>([])
  const [movId, setMovId]         = useState(editingPr?.movement_id ?? '')
  const [metric, setMetric]       = useState<MetricType>((editingPr?.metric as MetricType) ?? '1rm')

  const initialWeight = (() => {
    if (!editingPr || !['1rm', '2rm', '3rm'].includes(editingPr.metric)) return ''
    const raw = editingPr.value_lb ?? 0
    return profile.preferred_unit === 'kg' ? String(Math.round(raw * 0.453592 * 10) / 10) : String(raw)
  })()
  const initialReps = editingPr?.metric === 'max_reps' ? String(Math.round(editingPr.value_lb ?? 0)) : ''
  const initialCals = editingPr?.metric === 'calories' ? String(Math.round(editingPr.value_lb ?? 0)) : ''
  const initialTime = (() => {
    if (editingPr?.metric !== 'time') return ''
    const total = Math.round(editingPr.value_lb ?? 0)
    const mm = Math.floor(total / 60)
    const ss = total % 60
    return `${mm}:${String(ss).padStart(2, '0')}`
  })()

  const [weight, setWeight]       = useState(initialWeight)
  const [unit, setUnit]           = useState<'kg' | 'lb'>(profile.preferred_unit)
  const [reps, setReps]           = useState(initialReps)
  const [calories, setCalories]   = useState(initialCals)
  const [time, setTime]           = useState(initialTime)
  const [date, setDate]           = useState(
    editingPr?.recorded_at
      ? new Date(editingPr.recorded_at).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  )
  const [notes, setNotes]         = useState(editingPr?.notes ?? '')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    supabase.from('movements').select('*').order('category').order('name').then(({ data }) => {
      setMovements(data ?? [])
      if (data?.length && !movId) {
        setMovId(data[0].id)
        applyDefaultMetric(data[0].category as MovementCategory)
      }
    })
  }, [])

  function applyDefaultMetric(cat: MovementCategory) {
    if (cat === 'cardio' || cat === 'benchmark') setMetric('time')
    else if (cat === 'gymnastics') setMetric('max_reps')
    else setMetric('1rm')
  }

  function handleMovChange(id: string) {
    setMovId(id)
    const mov = movements.find(m => m.id === id)
    if (mov) {
      applyDefaultMetric(mov.category as MovementCategory)
      setWeight(''); setReps(''); setTime(''); setCalories(''); setError('')
    }
  }

  const selectedMov = useMemo(() => movements.find(m => m.id === movId), [movements, movId])
  const category    = selectedMov?.category as MovementCategory | undefined

  const isWeight = metric === '1rm' || metric === '2rm' || metric === '3rm'
  const isReps   = metric === 'max_reps'
  const isTime   = metric === 'time'
  const isCals   = metric === 'calories'

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!movId) return
    setError('')
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    let valueLb = 0
    if (isWeight) {
      const num = Number(weight)
      if (!num || num <= 0) { setError('Ingresa un peso válido'); setSaving(false); return }
      valueLb = parseWeightToLb(num, unit)
    } else if (isReps) {
      const num = parseInt(reps)
      if (!num || num <= 0) { setError('Ingresa las repeticiones'); setSaving(false); return }
      valueLb = num
    } else if (isCals) {
      const num = parseInt(calories)
      if (!num || num <= 0) { setError('Ingresa las calorías'); setSaving(false); return }
      valueLb = num
    } else if (isTime) {
      if (!time.includes(':')) { setError('Formato: mm:ss — ejemplo 3:45'); setSaving(false); return }
      valueLb = timeToSecs(time)
      if (valueLb <= 0) { setError('Tiempo inválido'); setSaving(false); return }
    }

    // Calories stored under metric='time' semantically isn't right; we store
    // with a separate metric. But the DB only supports 1rm/2rm/3rm/max_reps/time.
    // For calories we fold them into 'max_reps' (unitless count). PRsView reads
    // the movement category to pick the label.
    const storedMetric: 'time' | 'max_reps' | '1rm' | '2rm' | '3rm' =
      isCals ? 'max_reps' : (metric as any)

    const payload = {
      user_id:     user.id,
      movement_id: movId,
      value_lb:    valueLb,
      metric:      storedMetric,
      recorded_at: new Date(date).toISOString(),
      notes:       notes || null,
    }

    // Fetch previous best to decide celebration
    const { data: prevBest } = await supabase
      .from('pr_records')
      .select('value_lb')
      .eq('user_id', user.id)
      .eq('movement_id', movId)
      .eq('metric', storedMetric)
      .eq('is_pr', true)
      .maybeSingle()

    const { error: dbErr } = isEditing
      ? await supabase.from('pr_records').update(payload).eq('id', editingPr.id).eq('user_id', user.id)
      : await supabase.from('pr_records').insert({ ...payload, is_pr: false })

    setSaving(false)
    if (dbErr) { setError(dbErr.message); return }

    // Did we beat it?
    const prev = (prevBest as any)?.value_lb ?? null
    let newPr = false
    let diff = 0
    if (prev !== null) {
      if (isTime) {
        // Lower time = better
        newPr = valueLb > 0 && valueLb < prev
        diff = prev - valueLb
      } else {
        newPr = valueLb > prev
        diff = valueLb - prev
      }
    } else {
      newPr = true
    }

    setSaved(true)
    setTimeout(() => onSaved(newPr, diff), 900)
  }

  // Group movements with custom merged labels
  const byCategory = useMemo(() => {
    const groups: Record<string, Movement[]> = {}
    movements.forEach(m => {
      const label = CAT_LABELS[m.category as MovementCategory] ?? m.category
      ;(groups[label] = groups[label] ?? []).push(m)
    })
    return groups
  }, [movements])

  return (
    <Modal open onClose={onClose} title={isEditing ? 'EDITAR REGISTRO' : 'NUEVO REGISTRO'} subtitle={isEditing ? 'Corrige tu registro' : 'Tu nuevo máximo personal'}>
      {saved && (
        <div className="mb-4 p-3 rounded-xl bg-ac/10 border border-ac/20 text-ac font-bold text-sm">
          ✅ ¡Registro guardado exitosamente!
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rd/10 border border-rd/20 text-rd text-sm font-semibold">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-4">

        {/* ── Movement selector ── */}
        <div>
          <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Movimiento</label>
          <select value={movId} onChange={e => handleMovChange(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac">
            {Object.entries(byCategory).map(([label, movs]) => (
              <optgroup key={label} label={label}>
                {movs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            ))}
          </select>
          {selectedMov?.description && (
            <p className="mt-1.5 text-[11px] text-fa leading-relaxed">{selectedMov.description}</p>
          )}
        </div>

        {/* ── Weightlifting / Olympic: 1RM / 2RM / 3RM ── */}
        {(category === 'weightlifting' || category === 'olympic') && (
          <div>
            <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Tipo de récord</label>
            <div className="flex rounded-xl border border-[var(--ln)] overflow-hidden">
              {(['1rm', '2rm', '3rm'] as const).map(m => (
                <button key={m} type="button" onClick={() => setMetric(m)}
                  className={`flex-1 py-2.5 text-sm font-bold tracking-wider transition-colors ${
                    metric === m ? 'bg-ac text-bg' : 'bg-p3 text-mu hover:text-t'
                  }`}>
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-fa">
              {metric === '1rm' && 'Peso máximo en 1 repetición'}
              {metric === '2rm' && 'Peso máximo en 2 repeticiones consecutivas'}
              {metric === '3rm' && 'Peso máximo en 3 repeticiones consecutivas'}
            </p>
          </div>
        )}

        {/* ── Gymnastics: reps vs weighted ── */}
        {category === 'gymnastics' && (
          <div>
            <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Tipo de récord</label>
            <div className="flex rounded-xl border border-[var(--ln)] overflow-hidden">
              <button type="button" onClick={() => { setMetric('max_reps'); setWeight('') }}
                className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
                  metric === 'max_reps' ? 'bg-ac text-bg' : 'bg-p3 text-mu hover:text-t'
                }`}>
                Máx. Repeticiones
              </button>
              <button type="button" onClick={() => { setMetric('1rm'); setReps('') }}
                className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
                  metric === '1rm' ? 'bg-ac text-bg' : 'bg-p3 text-mu hover:text-t'
                }`}>
                Con Peso Añadido
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-fa">
              {metric === 'max_reps'
                ? 'Máximo de reps sin peso externo'
                : 'Peso extra en cinturón/chaleco para 1 repetición máxima'}
            </p>
          </div>
        )}

        {/* ── Monoestructural: tiempo vs calorías ── */}
        {category === 'cardio' && (
          <div>
            <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Tipo de récord</label>
            <div className="flex rounded-xl border border-[var(--ln)] overflow-hidden">
              <button type="button" onClick={() => { setMetric('time'); setCalories('') }}
                className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
                  metric === 'time' ? 'bg-ac text-bg' : 'bg-p3 text-mu hover:text-t'
                }`}>
                Tiempo
              </button>
              <button type="button" onClick={() => { setMetric('calories'); setTime('') }}
                className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
                  metric === 'calories' ? 'bg-ac text-bg' : 'bg-p3 text-mu hover:text-t'
                }`}>
                Calorías
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-fa">
              {metric === 'time'
                ? 'Tiempo en completar una distancia (ej. 2000m row)'
                : 'Máximas calorías logradas en una ventana de tiempo, o tiempo hasta X cal'}
            </p>
          </div>
        )}

        {/* ── Weight input ── */}
        {isWeight && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
                {category === 'gymnastics' ? 'Peso añadido' : 'Carga'} ({unit})
              </label>
              <input type="number" required step="any" min="0.5" value={weight}
                onChange={e => setWeight(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t outline-none focus:border-ac font-barlow text-3xl font-bold"
                placeholder="0" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Unidad</label>
              <div className="flex rounded-xl border border-[var(--ln)] overflow-hidden" style={{ height: '44px' }}>
                {(['kg', 'lb'] as const).map(u => (
                  <button key={u} type="button" onClick={() => setUnit(u)}
                    className={`flex-1 text-sm font-bold transition-colors ${
                      unit === u ? 'bg-ac text-bg' : 'bg-p3 text-mu hover:text-t'
                    }`}>{u}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Reps input ── */}
        {isReps && (
          <div>
            <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
              Repeticiones máximas consecutivas <span className="text-fa normal-case">(reps)</span>
            </label>
            <input type="number" required step="1" min="1" value={reps}
              onChange={e => setReps(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t outline-none focus:border-ac font-barlow text-5xl font-bold text-center"
              placeholder="0" />
          </div>
        )}

        {/* ── Calorías input ── */}
        {isCals && (
          <div>
            <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
              Calorías máximas <span className="text-fa normal-case">(cal)</span>
            </label>
            <input type="number" required step="1" min="1" value={calories}
              onChange={e => setCalories(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t outline-none focus:border-ac font-barlow text-5xl font-bold text-center"
              placeholder="0" />
          </div>
        )}

        {/* ── Time input with auto-colon ── */}
        {isTime && (
          <div>
            <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
              Tiempo <span className="text-fa normal-case">(min : seg)</span>
            </label>
            <input
              type="text" required inputMode="numeric" value={time}
              onChange={e => setTime(formatTimeInput(e.target.value))}
              className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t outline-none focus:border-ac font-barlow text-5xl font-bold text-center tracking-widest"
              placeholder="0:00" />
            <p className="mt-1.5 text-[11px] text-fa">Sólo escribe los dígitos: por ejemplo <span className="text-t">345</span> → 3:45</p>
          </div>
        )}

        {/* ── Date (native picker opens on click anywhere in the input) ── */}
        <div>
          <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Fecha</label>
          <input
            type="date" value={date}
            onChange={e => setDate(e.target.value)}
            onClick={(e) => { try { (e.currentTarget as any).showPicker?.() } catch {} }}
            className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac cursor-pointer [color-scheme:dark]"
          />
        </div>

        {/* ── Notes ── */}
        <div>
          <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
            Notas <span className="text-fa normal-case">(opcional)</span>
          </label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac resize-none"
            placeholder="Sensaciones, condiciones, equipamiento…" />
        </div>

        <div className="flex gap-3 mt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="flex-1" disabled={saving || saved}>
            {saving ? 'Guardando…' : isEditing ? 'Actualizar' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
