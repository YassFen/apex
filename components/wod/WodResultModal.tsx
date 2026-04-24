'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { Profile } from '@/lib/types/database'

export function WodResultModal({ wod, profile, existingResult, onClose, onSaved }: {
  wod: any; profile: Profile; existingResult?: any; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const isEditing = !!existingResult

  // Pre-fill from existing result when editing
  const defaultType = wod.type === 'fortime' ? 'time' : wod.type === 'amrap' ? 'rounds' : 'weight'
  const [resultType, setResultType] = useState<'time' | 'rounds' | 'weight' | 'reps'>(
    (existingResult?.result_type as any) ?? defaultType
  )
  const [mm, setMm]           = useState(() => existingResult?.result_value?.split(':')[0] ?? '00')
  const [ss, setSs]           = useState(() => existingResult?.result_value?.split(':')[1] ?? '00')
  const [value, setValue]     = useState(() =>
    existingResult && existingResult.result_type !== 'time' ? existingResult.result_value ?? '' : ''
  )
  const [rxLevel, setRxLevel] = useState<'rx' | 'scaled' | 'rx+'>((existingResult?.rx_level as any) ?? 'rx')
  const [notes, setNotes]     = useState(existingResult?.notes ?? '')
  const [saving, setSaving]   = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const resultValue = resultType === 'time'
      ? `${mm.padStart(2,'0')}:${ss.padStart(2,'0')}`
      : value

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const editCount = (existingResult?.edit_count ?? 0) + (isEditing ? 1 : 0)

    await supabase.from('wod_results').upsert({
      daily_wod_id: wod.id,
      user_id: user.id,
      result_type: resultType,
      result_value: resultValue,
      rx_level: rxLevel,
      notes: notes || null,
      edit_count: editCount,
    }, { onConflict: 'daily_wod_id,user_id' })

    setSaving(false)
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={isEditing ? 'MODIFICAR RESULTADO' : 'REGISTRAR RESULTADO'} subtitle={wod.title}>
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        {/* Result type */}
        <div className="flex gap-2">
          {(['time', 'rounds', 'reps', 'weight'] as const).map(t => (
            <button key={t} type="button" onClick={() => setResultType(t)}
              className={`flex-1 py-2 rounded-xl border text-xs font-bold uppercase transition-all ${
                resultType === t
                  ? 'bg-ac/10 text-ac border-ac/30'
                  : 'border-[var(--ln2)] text-mu hover:text-t'
              }`}>{t}</button>
          ))}
        </div>

        {/* Value input */}
        {resultType === 'time' ? (
          <div>
            <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Tiempo (mm:ss)</label>
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="99" value={mm} onChange={e => setMm(e.target.value)}
                className="flex-1 text-center px-3 py-3 rounded-xl bg-p3 border border-[var(--ln)] text-t outline-none focus:border-ac font-barlow text-4xl font-black"
                placeholder="00" />
              <span className="font-barlow text-4xl font-black text-mu">:</span>
              <input type="number" min="0" max="59" value={ss} onChange={e => setSs(e.target.value)}
                className="flex-1 text-center px-3 py-3 rounded-xl bg-p3 border border-[var(--ln)] text-t outline-none focus:border-ac font-barlow text-4xl font-black"
                placeholder="00" />
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
              {resultType === 'rounds' ? 'Rondas + reps' : resultType === 'reps' ? 'Reps totales' : 'Peso (lbs)'}
            </label>
            <input required value={value} onChange={e => setValue(e.target.value)}
              className="w-full px-3 py-3 rounded-xl bg-p3 border border-[var(--ln)] text-t outline-none focus:border-ac font-barlow text-3xl font-bold text-center"
              placeholder={resultType === 'rounds' ? '5+12' : '0'} />
          </div>
        )}

        {/* RX Level */}
        <div>
          <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Nivel</label>
          <div className="flex gap-2">
            {(['rx', 'rx+', 'scaled'] as const).map(l => (
              <button key={l} type="button" onClick={() => setRxLevel(l)}
                className={`flex-1 py-2.5 rounded-xl border font-bold text-sm uppercase transition-all ${
                  rxLevel === l ? 'bg-ac/10 text-ac border-ac/30' : 'border-[var(--ln2)] text-mu hover:text-t'
                }`}>{l}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac resize-none"
            placeholder="Cómo te sentiste, modificaciones…" />
        </div>

        <div className="flex gap-3 mt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? 'Guardando…' : isEditing ? 'Actualizar resultado' : 'Guardar resultado'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
