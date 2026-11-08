'use client'
import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { friendlyError, isMissingColumn } from '@/lib/utils/errors'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert, inputBase, labelCls } from '@/components/ui/Field'
import { cn } from '@/lib/utils/cn'
import type { Profile } from '@/lib/types/database'

type ResultType = 'time' | 'rounds' | 'reps' | 'weight'

const TYPE_LABELS: Record<ResultType, string> = {
  time: 'Tiempo', rounds: 'Rondas', reps: 'Reps', weight: 'Peso',
}

const LEVELS = [
  { key: 'rx', label: 'Rx', sub: 'Como está escrito' },
  { key: 'rx+', label: 'Rx+', sub: 'Más pesado o difícil' },
  { key: 'scaled', label: 'Scaled', sub: 'Adaptado' },
] as const

function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { key: T; label: string; sub?: string }[]; label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 p-1 rounded-2xl bg-p2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(o => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)}
          className={cn('min-h-11 py-2 px-1 rounded-xl text-sm font-bold transition-colors', value === o.key ? 'bg-p3 text-t' : 'text-mu hover:text-t')}>
          {o.label}
          {o.sub && <span className="block text-[10px] font-normal text-mu leading-tight mt-0.5">{o.sub}</span>}
        </button>
      ))}
    </div>
  )
}

export function WodResultModal({ wod, profile, existingResult, onClose, onSaved }: {
  wod: any; profile: Profile; existingResult?: any; onClose: () => void; onSaved: () => void
}) {
  const [supabase] = useState(() => createClient())
  const isEditing = !!existingResult

  const defaultType: ResultType =
    wod.type === 'fortime' ? 'time' : wod.type === 'amrap' ? 'rounds' : wod.type === 'strength' ? 'weight' : 'reps'
  const [resultType, setResultType] = useState<ResultType>((existingResult?.result_type as ResultType) ?? defaultType)

  const [prevMm, prevSs] = existingResult?.result_type === 'time' ? String(existingResult.result_value).split(':') : ['', '']
  const [mm, setMm] = useState(prevMm ?? '')
  const ssRef = useRef<HTMLInputElement>(null)
  const [ss, setSs] = useState(prevSs ?? '')

  const [prevRounds, prevReps] = existingResult?.result_type === 'rounds' ? String(existingResult.result_value).split('+') : ['', '']
  const [rounds, setRounds] = useState(prevRounds ?? '')
  const [extraReps, setExtraReps] = useState(prevReps ?? '')

  const [value, setValue] = useState(
    existingResult && (existingResult.result_type === 'reps' || existingResult.result_type === 'weight')
      ? String(existingResult.result_value).replace(/[^\d.,]/g, '') : '',
  )
  const [rxLevel, setRxLevel] = useState<'rx' | 'scaled' | 'rx+'>((existingResult?.rx_level as any) ?? 'rx')
  const [notes, setNotes]     = useState(existingResult?.notes ?? '')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const unit = profile.preferred_unit ?? 'kg'

  function buildValue(): string | null {
    if (resultType === 'time') {
      const m = parseInt(mm || '0', 10), s = parseInt(ss || '0', 10)
      if (s > 59) { setError('Los segundos van de 0 a 59.'); return null }
      if (m * 60 + s <= 0) { setError('Ingresa tu tiempo.'); return null }
      return `${m}:${String(s).padStart(2, '0')}`
    }
    if (resultType === 'rounds') {
      const r = parseInt(rounds || '0', 10), x = parseInt(extraReps || '0', 10)
      if (r <= 0 && x <= 0) { setError('Ingresa las rondas completas.'); return null }
      return `${r}+${x}`
    }
    const n = parseFloat(value.replace(',', '.'))
    if (!n || n <= 0) { setError(resultType === 'weight' ? 'Ingresa el peso.' : 'Ingresa las repeticiones.'); return null }
    return resultType === 'weight' ? `${n} ${unit}` : String(Math.round(n))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const resultValue = buildValue()
    if (!resultValue) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); setError('Tu sesión expiró. Vuelve a iniciar sesión.'); return }

    const base = {
      daily_wod_id: wod.id,
      user_id: user.id,
      result_type: resultType,
      result_value: resultValue,
      rx_level: rxLevel,
      notes: notes.trim() || null,
      recorded_at: new Date().toISOString(),
    }
    const editCount = (existingResult?.edit_count ?? 0) + (isEditing ? 1 : 0)

    let { error: dbErr } = await supabase.from('wod_results')
      .upsert({ ...base, edit_count: editCount }, { onConflict: 'daily_wod_id,user_id' })

    // Production DB without migration 004 has no edit_count column: save anyway.
    if (dbErr && isMissingColumn(dbErr)) {
      ({ error: dbErr } = await supabase.from('wod_results').upsert(base, { onConflict: 'daily_wod_id,user_id' }))
    }

    setSaving(false)
    if (dbErr) { setError(friendlyError(dbErr.message)); return }
    onSaved()
  }

  const numCls = inputBase.replace('text-base sm:text-sm', '') + ' h-16 text-center font-display text-4xl font-extrabold tabular-nums tracking-tight'

  return (
    <Modal open onClose={onClose} title={isEditing ? 'Corregir resultado' : 'Registrar resultado'} subtitle={wod.title}>
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <div>
          <span className={labelCls}>Tipo de resultado</span>
          <Segmented label="Tipo de resultado" value={resultType} onChange={v => { setResultType(v); setError('') }}
            options={(Object.keys(TYPE_LABELS) as ResultType[]).map(k => ({ key: k, label: TYPE_LABELS[k] }))} />
        </div>

        {resultType === 'time' && (
          <fieldset>
            <legend className={labelCls}>Tu tiempo</legend>
            <div className="flex items-center gap-2">
              <input aria-label="Minutos" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={mm} placeholder="0"
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '')
                  setMm(v)
                  if (v.length === 2) ssRef.current?.focus() // jump to seconds like a time picker
                }} className={numCls} autoFocus />
              <span className="font-display text-4xl font-extrabold text-mu tracking-tight" aria-hidden>:</span>
              <input ref={ssRef} aria-label="Segundos" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={ss} placeholder="00"
                onChange={e => setSs(e.target.value.replace(/\D/g, ''))} className={numCls} />
            </div>
            <p className="mt-1.5 text-xs text-mu">Minutos : segundos. Si llegaste al time cap, anota el cap y explícalo en notas.</p>
          </fieldset>
        )}

        {resultType === 'rounds' && (
          <fieldset>
            <legend className={labelCls}>Rondas + reps extra</legend>
            <div className="flex items-center gap-2">
              <input aria-label="Rondas completas" inputMode="numeric" pattern="[0-9]*" value={rounds} placeholder="0"
                onChange={e => setRounds(e.target.value.replace(/\D/g, ''))} className={numCls} autoFocus />
              <span className="font-display text-4xl font-extrabold text-mu tracking-tight" aria-hidden>+</span>
              <input aria-label="Repeticiones extra" inputMode="numeric" pattern="[0-9]*" value={extraReps} placeholder="0"
                onChange={e => setExtraReps(e.target.value.replace(/\D/g, ''))} className={numCls} />
            </div>
          </fieldset>
        )}

        {(resultType === 'reps' || resultType === 'weight') && (
          <div>
            <label htmlFor="wod-value" className={labelCls}>
              {resultType === 'reps' ? 'Repeticiones totales' : `Peso (${unit})`}
            </label>
            <input id="wod-value" inputMode="decimal" value={value} placeholder="0"
              onChange={e => setValue(e.target.value.replace(/[^\d.,]/g, ''))} className={numCls} autoFocus />
          </div>
        )}

        <div>
          <span className={labelCls}>Nivel</span>
          <Segmented label="Nivel" value={rxLevel} onChange={setRxLevel} options={LEVELS.map(l => ({ ...l }))} />
        </div>

        <div>
          <label htmlFor="wod-notes" className={labelCls}>Notas <span className="text-fa normal-case tracking-normal font-normal">(opcional)</span></label>
          <textarea id="wod-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className={inputBase + ' py-3 resize-none'} placeholder="Ej. pull-ups con banda, 35 kg en vez de 43…" />
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" size="lg" onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="flex-1" size="lg" disabled={saving}>
            {saving ? 'Guardando…' : isEditing ? 'Guardar cambio' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
