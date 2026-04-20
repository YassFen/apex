'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import type { Profile, Benchmark } from '@/lib/types/database'

const BENCHMARK_LIST = [
  { name: 'Fran',   desc: '21-15-9: Thrusters (95/65) + Pull-ups', unit: 'time' },
  { name: 'Annie',  desc: '50-40-30-20-10: Double-unders + Sit-ups', unit: 'time' },
  { name: 'Murph',  desc: '1mi run, 100 pull-ups, 200 push-ups, 300 squats, 1mi run', unit: 'time' },
  { name: 'Cindy',  desc: '20 min AMRAP: 5 pull-ups, 10 push-ups, 15 squats', unit: 'rounds' },
  { name: 'Isabel', desc: '30 Snatches for time (135/95)', unit: 'time' },
  { name: 'Karen',  desc: '150 Wall Balls for time (20/14)', unit: 'time' },
  { name: 'Helen',  desc: '3 rounds: 400m run, 21 KB swings, 12 pull-ups', unit: 'time' },
  { name: 'Grace',  desc: '30 Clean & Jerks for time (135/95)', unit: 'time' },
]

function estimateLevel(name: string, result: string): { label: string; color: 'orange' | 'green' | 'blue' } {
  // Simple heuristic based on Fran time
  if (name === 'Fran') {
    const [m, s] = result.split(':').map(Number)
    const secs = m * 60 + (s || 0)
    if (secs < 180) return { label: 'Elite', color: 'orange' }
    if (secs < 360) return { label: 'Avanzado', color: 'green' }
    return { label: 'Intermedio', color: 'blue' }
  }
  return { label: 'Registrado', color: 'blue' }
}

export function BenchmarksView({ profile, benchmarks }: { profile: Profile; benchmarks: Benchmark[] }) {
  const [modalBm, setModalBm] = useState<typeof BENCHMARK_LIST[0] | null>(null)
  const [result, setResult]   = useState('')
  const [notes, setNotes]     = useState('')
  const [saving, setSaving]   = useState(false)

  async function saveBenchmark(e: React.FormEvent) {
    e.preventDefault()
    if (!modalBm || !result) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const level = estimateLevel(modalBm.name, result)
    await supabase.from('benchmarks').insert({
      user_id: user.id,
      name: modalBm.name,
      result,
      notes: notes || null,
      level: level.label,
      recorded_at: new Date().toISOString(),
    })
    setSaving(false)
    setModalBm(null)
    setResult('')
    setNotes('')
    window.location.reload()
  }

  const bmByName: Record<string, Benchmark[]> = {}
  benchmarks.forEach(b => { (bmByName[b.name] = bmByName[b.name] ?? []).push(b) })

  return (
    <>
      <Topbar title="Benchmarks" onMenuClick={() => {}} profile={profile} />

      <div className="p-4 lg:p-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {BENCHMARK_LIST.map(bm => {
          const records = bmByName[bm.name] ?? []
          const best    = records[0]
          const level   = best ? estimateLevel(bm.name, best.result) : null

          return (
            <Card key={bm.name} className="flex flex-col gap-3 hover:border-[rgba(255,255,255,.15)] transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-barlow text-xl font-black tracking-wide">{bm.name}</div>
                  <div className="text-mu text-[11px] mt-0.5">{bm.desc}</div>
                </div>
                {level && <Badge color={level.color}>{level.label}</Badge>}
              </div>

              {best ? (
                <div>
                  <div className="font-barlow text-[36px] font-black text-ac leading-none">{best.result}</div>
                  <div className="text-mu text-[11px] mt-1">
                    {new Date(best.recorded_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                </div>
              ) : (
                <div className="text-fa text-sm">Sin registro</div>
              )}

              <Button variant="secondary" size="sm" className="mt-auto" onClick={() => { setModalBm(bm); setResult(''); setNotes('') }}>
                + Registrar
              </Button>
            </Card>
          )
        })}
      </div>

      {modalBm && (
        <Modal open onClose={() => setModalBm(null)} title={`BENCHMARK: ${modalBm.name}`} subtitle={modalBm.desc}>
          <form onSubmit={saveBenchmark} className="flex flex-col gap-4">
            <div>
              <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
                Resultado ({modalBm.unit === 'time' ? 'mm:ss' : 'rondas'})
              </label>
              <input required value={result} onChange={e => setResult(e.target.value)}
                className="w-full px-3 py-3 rounded-xl bg-p3 border border-[var(--ln)] text-t outline-none focus:border-ac font-barlow text-3xl font-bold text-center"
                placeholder={modalBm.unit === 'time' ? '06:29' : '21+3'} />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Notas</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac resize-none"
                placeholder="Condiciones, cómo te sentiste…" />
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setModalBm(null)}>Cancelar</Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
