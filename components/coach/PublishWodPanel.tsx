'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { Profile, Box, Movement } from '@/lib/types/database'

type WodType = 'fortime' | 'amrap' | 'emom' | 'tabata' | 'strength'

interface WodMovement { name: string; reps: string }

export function PublishWodPanel({
  profile, box, movements, todayWod,
}: { profile: Profile; box: Box; movements: Movement[]; todayWod: any }) {
  const supabase = createClient()
  const router   = useRouter()
  const { fire, element: toastEl } = useToast()

  const [title, setTitle]         = useState(todayWod?.title ?? '')
  const [type, setType]           = useState<WodType>(todayWod?.type ?? 'fortime')
  const [desc, setDesc]           = useState(todayWod?.description ?? '')
  const [duration, setDuration]   = useState(todayWod?.duration_mins?.toString() ?? '')
  const [wodMovs, setWodMovs]     = useState<WodMovement[]>(
    (todayWod?.movements as any[] ?? []).map((m: any) => ({ name: m.name, reps: m.reps }))
  )
  const [publishing, setPublishing] = useState(false)

  function addMovement() { setWodMovs(prev => [...prev, { name: '', reps: '' }]) }
  function removeMovement(i: number) { setWodMovs(prev => prev.filter((_, idx) => idx !== i)) }
  function updateMov(i: number, field: 'name' | 'reps', val: string) {
    setWodMovs(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m))
  }

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault()
    setPublishing(true)
    const today = new Date().toISOString().split('T')[0]

    const payload = {
      box_id: box.id,
      coach_id: profile.id,
      title,
      type,
      description: desc,
      duration_mins: duration ? Number(duration) : null,
      movements: wodMovs.filter(m => m.name),
      scheduled_for: today,
      is_live: true,
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

  const WOD_TYPES: WodType[] = ['fortime', 'amrap', 'emom', 'tabata', 'strength']

  return (
    <>
      <Topbar title="Publicar WOD" onMenuClick={() => {}} profile={profile} />
      {toastEl}

      <div className="p-4 lg:p-6 max-w-2xl mx-auto">
        {todayWod && (
          <div className="mb-4 p-3 rounded-xl bg-or/10 border border-or/20 text-or text-sm font-semibold">
            Ya hay un WOD publicado hoy. Guardando reemplazará el actual.
          </div>
        )}

        <form onSubmit={handlePublish} className="flex flex-col gap-4">
          <Card>
            <div className="font-barlow text-[15px] font-extrabold tracking-wide uppercase mb-4">Configuración</div>

            <div className="mb-4">
              <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Título del WOD</label>
              <input required value={title} onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac"
                placeholder="Ej: Fran, Thursday Chipper, Week 3 Day 2…" />
            </div>

            <div className="mb-4">
              <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2">Tipo de WOD</label>
              <div className="flex gap-2 flex-wrap">
                {WOD_TYPES.map(t => (
                  <button key={t} type="button" onClick={() => setType(t)}
                    className={`px-3.5 py-2 rounded-xl border font-barlow font-extrabold text-sm uppercase tracking-wide transition-all ${
                      type === t ? 'bg-ac text-bg border-ac' : 'border-[var(--ln2)] text-mu hover:text-t'
                    }`}>{t}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Duración (min)</label>
                <input type="number" value={duration} onChange={e => setDuration(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac"
                  placeholder="ej. 20" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Descripción / instrucciones</label>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4}
                className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac resize-none"
                placeholder="3 rounds for time:&#10;21 Thrusters (95/65)&#10;21 Pull-ups" />
            </div>
          </Card>

          {/* Movements */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="font-barlow text-[15px] font-extrabold tracking-wide uppercase">Movimientos</div>
              <button type="button" onClick={addMovement}
                className="flex items-center gap-1.5 text-ac text-xs font-bold hover:underline">
                + Agregar
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              {wodMovs.map((m, i) => (
                <div key={i} className="flex items-center gap-2 p-3 bg-p3 rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-ac/10 border border-ac/20 grid place-items-center text-ac font-barlow font-black text-sm flex-shrink-0">
                    {i + 1}
                  </div>
                  <select value={m.name} onChange={e => updateMov(i, 'name', e.target.value)}
                    className="flex-1 bg-transparent border-0 text-t text-sm outline-none">
                    <option value="">Seleccionar movimiento…</option>
                    {movements.map(mov => <option key={mov.id} value={mov.name}>{mov.name}</option>)}
                  </select>
                  <input value={m.reps} onChange={e => updateMov(i, 'reps', e.target.value)}
                    className="w-20 text-center bg-p2 border border-[var(--ln)] rounded-lg px-2 py-1.5 text-t text-sm outline-none focus:border-ac font-barlow font-bold"
                    placeholder="21 reps" />
                  <button type="button" onClick={() => removeMovement(i)}
                    className="w-6 h-6 rounded-full bg-rd/10 border border-rd/20 text-rd text-sm grid place-items-center hover:bg-rd/20 transition-colors">×</button>
                </div>
              ))}
              {wodMovs.length === 0 && (
                <div className="text-center py-4 text-mu text-sm border border-dashed border-[var(--ln2)] rounded-xl">
                  Agrega los movimientos del WOD
                </div>
              )}
            </div>
          </Card>

          <Button type="submit" size="lg" className="w-full" disabled={publishing}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            {publishing ? 'Publicando…' : todayWod ? 'Actualizar WOD en vivo' : 'Publicar WOD en vivo 🔴'}
          </Button>
        </form>
      </div>
    </>
  )
}
