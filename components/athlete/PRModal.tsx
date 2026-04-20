'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { parseWeightToLb } from '@/lib/utils/units'
import type { Profile, Movement } from '@/lib/types/database'

interface Props {
  profile: Profile
  onClose: () => void
  onSaved: () => void
}

export function PRModal({ profile, onClose, onSaved }: Props) {
  const supabase = createClient()
  const [movements, setMovements] = useState<Movement[]>([])
  const [movId, setMovId]         = useState('')
  const [value, setValue]         = useState('')
  const [unit, setUnit]           = useState<'lb' | 'kg'>(profile.preferred_unit)
  const [metric, setMetric]       = useState<'1rm' | '3rm'>('1rm')
  const [date, setDate]           = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [isPR, setIsPR]           = useState(false)

  useEffect(() => {
    supabase.from('movements').select('*').order('category').order('name').then(({ data }) => {
      setMovements(data ?? [])
      if (data?.length) setMovId(data[0].id)
    })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!movId || !value) return
    setSaving(true)

    const valueLb = parseWeightToLb(Number(value), unit)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('pr_records').insert({
      user_id: user.id,
      movement_id: movId,
      value_lb: valueLb,
      metric,
      recorded_at: new Date(date).toISOString(),
      notes: notes || null,
      is_pr: false,
    })

    setSaving(false)
    if (!error) {
      setIsPR(true)
      setTimeout(onSaved, 1200)
    }
  }

  const byCategory = movements.reduce<Record<string, Movement[]>>((acc, m) => {
    ;(acc[m.category] = acc[m.category] || []).push(m)
    return acc
  }, {})

  return (
    <Modal open onClose={onClose} title="REGISTRAR PR" subtitle="Agrega un nuevo personal record">
      {isPR && (
        <div className="mb-4 p-3 rounded-xl bg-ac/10 border border-ac/20 text-ac font-bold text-sm animate-fade-up">
          🏆 ¡PR registrado exitosamente!
        </div>
      )}
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div>
          <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Movimiento</label>
          <select value={movId} onChange={e => setMovId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac">
            {Object.entries(byCategory).map(([cat, movs]) => (
              <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                {movs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Tipo</label>
            <select value={metric} onChange={e => setMetric(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac">
              <option value="1rm">1RM</option>
              <option value="3rm">3RM</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Unidad</label>
            <div className="flex rounded-xl border border-[var(--ln)] overflow-hidden">
              {(['lb', 'kg'] as const).map(u => (
                <button key={u} type="button" onClick={() => setUnit(u)}
                  className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
                    unit === u ? 'bg-ac text-bg' : 'bg-p3 text-mu hover:text-t'
                  }`}>{u}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
              Peso ({unit})
            </label>
            <input type="number" required step="any" min="0" value={value} onChange={e => setValue(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac font-barlow text-2xl font-bold"
              placeholder="0" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Fecha</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac" />
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Notas <span className="text-fa normal-case">(opcional)</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac resize-none"
            placeholder="Condiciones, sensaciones…" />
        </div>

        <div className="flex gap-3 mt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar PR'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
