'use client'
import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { friendlyError, isMissingColumn } from '@/lib/utils/errors'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert, inputBase, labelCls } from '@/components/ui/Field'
import { nativeResultType } from '@/lib/utils/wod-ranking'
import { cn } from '@/lib/utils/cn'
import type { Profile } from '@/lib/types/database'

type ResultType = 'time' | 'rounds' | 'reps' | 'weight'

const TYPE_LABELS: Record<ResultType, string> = {
  time: 'Terminé (tiempo)', rounds: 'Rondas + reps', reps: 'Reps', weight: 'Peso',
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

export function WodResultModal({ wod, profile, existingResult, prefill, onClose, onSaved }: {
  wod: any; profile: Profile; existingResult?: any
  /** From the timer: `?time=mm:ss` or `?rounds=N` in the /wod link. */
  prefill?: { time?: string | null; rounds?: string | null }
  onClose: () => void; onSaved: () => void
}) {
  const [supabase] = useState(() => createClient())
  const isEditing = !!existingResult

  const defaultType = nativeResultType(wod.type) as ResultType
  // The leaderboard ranks the WOD's own type first. The only alternative is a For Time
  // that hit the time cap: those athletes log the reps they got ("No terminé").
  const typeOptions: { key: ResultType; label: string }[] = [{ key: defaultType, label: TYPE_LABELS[defaultType] }]
  if (defaultType === 'time') typeOptions.push({ key: 'reps', label: 'No terminé (reps)' })
  const savedType = existingResult?.result_type as ResultType | undefined
  if (savedType && !typeOptions.some(o => o.key === savedType)) typeOptions.push({ key: savedType, label: TYPE_LABELS[savedType] })
  const [resultType, setResultType] = useState<ResultType>((existingResult?.result_type as ResultType) ?? (prefill?.rounds && defaultType === 'rounds' ? 'rounds' : defaultType))

  const [prevMm, prevSs] = existingResult?.result_type === 'time' ? String(existingResult.result_value).split(':')
    : !existingResult && prefill?.time && /^\d{1,3}:\d{2}$/.test(prefill.time) ? prefill.time.split(':') : ['', '']
  const [mm, setMm] = useState(prevMm ?? '')
  const ssRef = useRef<HTMLInputElement>(null)
  const [ss, setSs] = useState(prevSs ?? '')

  const [prevRounds, prevReps] = existingResult?.result_type === 'rounds' ? String(existingResult.result_value).split('+')
    : !existingResult && prefill?.rounds && /^\d{1,3}$/.test(prefill.rounds) ? [prefill.rounds, ''] : ['', '']
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

  // A saved weight keeps the unit it was recorded in ("100 kg"), so editing it never changes the value.
  const savedUnit = existingResult?.result_type === 'weight'
    ? (/kg/i.test(String(existingResult.result_value)) ? 'kg' : /lb/i.test(String(existingResult.result_value)) ? 'lb' : null)
    : null
  const unit = savedUnit ?? profile.preferred_unit ?? 'kg'

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
    }
    const editCount = (existingResult?.edit_count ?? 0) + (isEditing ? 1 : 0)

    // recorded_at is set only when the result is first created: editing must not move it
    // (it breaks ties on the leaderboard).
    const write = (row: Record<string, unknown>) => isEditing
      ? supabase.from('wod_results').update(row).eq('daily_wod_id', wod.id).eq('user_id', user.id)
      : supabase.from('wod_results').upsert({ ...row, recorded_at: new Date().toISOString() }, { onConflict: 'daily_wod_id,user_id' })

    let { error: dbErr } = await write({ ...base, edit_count: editCount })

    // Production DB without migration 004 has no edit_count column: save anyway.
    if (dbErr && isMissingColumn(dbErr)) {
      ({ error: dbErr } = await write(base))
    }

    setSaving(false)
    if (dbErr) { setError(friendlyError(dbErr.message)); return }
    onSaved()
  }

  const numCls = inputBase.replace('text-base sm:text-sm', '') + ' h-16 text-center font-display text-4xl font-bold tabular-nums tracking-tight'

  return (
    <Modal open onClose={onClose} title={isEditing ? 'Corregir resultado' : 'Registrar resultado'} subtitle={wod.title}>
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        {typeOptions.length > 1 && <div>
          <span className={labelCls}>Tipo de resultado</span>
          <Segmented label="Tipo de resultado" value={resultType} onChange={v => { setResultType(v); setError('') }}
            options={typeOptions} />
          {resultType === 'reps' && defaultType === 'time' && (
            <p className="mt-1.5 text-xs text-mu">Si no terminaste dentro del límite de tiempo, anota las repeticiones que hiciste. Quedas debajo de quienes terminaron.</p>
          )}
        </div>}

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
              <span className="font-display text-4xl font-bold text-mu tracking-tight" aria-hidden>:</span>
              <input ref={ssRef} aria-label="Segundos" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={ss} placeholder="00"
                onChange={e => setSs(e.target.value.replace(/\D/g, ''))} className={numCls} />
            </div>
            <p className="mt-1.5 text-xs text-mu">Minutos : segundos. Si no terminaste dentro del límite de tiempo, elige «No terminé» arriba.</p>
          </fieldset>
        )}

        {resultType === 'rounds' && (
          <fieldset>
            <legend className={labelCls}>Rondas + reps extra</legend>
            <div className="flex items-center gap-2">
              <input aria-label="Rondas completas" inputMode="numeric" pattern="[0-9]*" value={rounds} placeholder="0"
                onChange={e => setRounds(e.target.value.replace(/\D/g, ''))} className={numCls} autoFocus />
              <span className="font-display text-4xl font-bold text-mu tracking-tight" aria-hidden>+</span>
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
