'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Plus, Flame, Award, Medal, Trophy } from 'lucide-react'
import type { Profile, Benchmark } from '@/lib/types/database'

const BENCHMARK_LIST = [
  { name: 'Fran',   icon: '🔥', desc: '21-15-9 thrusters + pull-ups · 95 lbs', unit: 'time' as const },
  { name: 'Annie',  icon: '🤸', desc: '50-40-30-20-10 double unders + sit-ups', unit: 'time' as const },
  { name: 'Murph',  icon: '🏃', desc: '1mi run · 100 pull-ups · 200 push-ups · 300 squats · 1mi run', unit: 'time' as const },
  { name: 'Cindy',  icon: '⏱',  desc: '20 min AMRAP: 5 pull-ups, 10 push-ups, 15 squats', unit: 'rounds' as const },
  { name: 'Isabel', icon: '⚡', desc: '30 snatches for time · 135 lbs', unit: 'time' as const },
  { name: 'Karen',  icon: '🏐', desc: '150 wall balls for time · 20/14', unit: 'time' as const },
  { name: 'Helen',  icon: '🔔', desc: '3 rounds: 400m run, 21 KB swings, 12 pull-ups', unit: 'time' as const },
  { name: 'Grace',  icon: '🥇', desc: '30 clean & jerks for time · 135 lbs', unit: 'time' as const },
  { name: 'Diane',  icon: '💀', desc: '21-15-9 deadlifts + handstand push-ups · 225 lbs', unit: 'time' as const },
  { name: 'Elizabeth', icon: '🪜', desc: '21-15-9 cleans + ring dips · 135 lbs', unit: 'time' as const },
  { name: 'Nancy',  icon: '🏃‍♀️', desc: '5 rounds: 400m run + 15 OHS · 95 lbs', unit: 'time' as const },
  { name: 'Jackie', icon: '🚣', desc: '1000m row + 50 thrusters (45 lb) + 30 pull-ups', unit: 'time' as const },
]

type Level = { label: string; color: 'pop' | 'gr' | 'or' | 'bl' | 'mu'; icon: string }

function estimateLevel(name: string, result: string, unit: 'time' | 'rounds'): Level {
  if (unit === 'time') {
    const [m, s] = result.split(':').map(Number)
    const secs = (m || 0) * 60 + (s || 0)
    if (name === 'Fran') {
      if (secs > 0 && secs < 180) return { label: 'Elite',         color: 'or', icon: '🔥' }
      if (secs < 360)              return { label: 'Avanzado',      color: 'gr', icon: '🟢' }
      if (secs < 600)              return { label: 'Intermedio',    color: 'bl', icon: '🟡' }
    }
    if (name === 'Grace' || name === 'Isabel') {
      if (secs < 180) return { label: 'Elite',      color: 'or', icon: '🔥' }
      if (secs < 360) return { label: 'Avanzado',   color: 'gr', icon: '🟢' }
      return                { label: 'Intermedio', color: 'bl', icon: '🟡' }
    }
    if (name === 'Murph') {
      if (secs < 2400) return { label: 'Elite',      color: 'or', icon: '🔥' }
      if (secs < 3600) return { label: 'Avanzado',   color: 'gr', icon: '🟢' }
      return                 { label: 'Intermedio', color: 'bl', icon: '🟡' }
    }
  }
  return { label: 'Registrado', color: 'gr', icon: '✅' }
}

const LEVEL_CLS: Record<Level['color'], string> = {
  or:  'bg-or/10 text-or',
  gr:  'bg-gr/10 text-gr',
  bl:  'bg-bl/10 text-bl',
  pop: 'bg-ac/10 text-ac',
  mu:  'bg-mu/10 text-mu',
}

export function BenchmarksView({ profile, benchmarks }: { profile: Profile; benchmarks: Benchmark[] }) {
  const [modalBm, setModalBm] = useState<typeof BENCHMARK_LIST[0] | null>(null)
  const [result, setResult]   = useState('')
  const [notes, setNotes]     = useState('')
  const [saving, setSaving]   = useState(false)

  function fmtTimeInput(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 5)
    if (digits.length === 0) return ''
    if (digits.length <= 2) return digits
    return `${digits.slice(0, -2)}:${digits.slice(-2)}`
  }

  async function saveBenchmark(e: React.FormEvent) {
    e.preventDefault()
    if (!modalBm || !result) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const level = estimateLevel(modalBm.name, result, modalBm.unit)
    await supabase.from('benchmarks').insert({
      user_id: user.id,
      name: modalBm.name,
      result,
      notes: notes || null,
      level: level.label,
      recorded_at: new Date().toISOString(),
    })
    setSaving(false)
    setModalBm(null); setResult(''); setNotes('')
    window.location.reload()
  }

  const bmByName: Record<string, Benchmark[]> = {}
  benchmarks.forEach(b => { (bmByName[b.name] = bmByName[b.name] ?? []).push(b) })

  const filledCount = BENCHMARK_LIST.filter(b => bmByName[b.name]?.length).length

  return (
    <>
      <Topbar title="Benchmarks" profile={profile} />

      <div className="p-4 lg:p-6">
        {/* Header stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-2xl bg-p border border-[var(--ln)] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ac/10 grid place-items-center text-ac"><Trophy size={18} strokeWidth={2.2} /></div>
            <div>
              <div className="font-barlow text-2xl font-black text-ac leading-none">{filledCount}</div>
              <div className="text-[10px] uppercase tracking-[1.4px] text-fa font-bold mt-1">Logrados</div>
            </div>
          </div>
          <div className="rounded-2xl bg-p border border-[var(--ln)] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-bl/10 grid place-items-center text-bl"><Award size={18} strokeWidth={2.2} /></div>
            <div>
              <div className="font-barlow text-2xl font-black leading-none">{BENCHMARK_LIST.length - filledCount}</div>
              <div className="text-[10px] uppercase tracking-[1.4px] text-fa font-bold mt-1">Pendientes</div>
            </div>
          </div>
          <div className="rounded-2xl bg-p border border-[var(--ln)] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-or/10 grid place-items-center text-or"><Medal size={18} strokeWidth={2.2} /></div>
            <div>
              <div className="font-barlow text-2xl font-black text-or leading-none">{BENCHMARK_LIST.length}</div>
              <div className="text-[10px] uppercase tracking-[1.4px] text-fa font-bold mt-1">Total</div>
            </div>
          </div>
        </div>

        {/* Benchmark cards V3 */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {BENCHMARK_LIST.map(bm => {
            const records = bmByName[bm.name] ?? []
            const best    = records[0]
            const level   = best ? estimateLevel(bm.name, best.result, bm.unit) : null

            if (!best) {
              // EMPTY STATE
              return (
                <button
                  key={bm.name}
                  onClick={() => { setModalBm(bm); setResult(''); setNotes('') }}
                  className="relative overflow-hidden text-left p-5 rounded-2xl border border-dashed border-[var(--ln2)] bg-transparent hover:bg-ac/5 hover:border-ac/30 transition group"
                >
                  <div className="text-3xl mb-2 opacity-60">{bm.icon}</div>
                  <div className="font-barlow text-lg font-black tracking-wide uppercase">{bm.name}</div>
                  <div className="text-mu text-[11px] mt-1 leading-snug">{bm.desc}</div>
                  <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ac/10 text-ac text-[11px] font-bold border border-ac/20 group-hover:bg-ac group-hover:text-bg transition">
                    <Plus size={12} strokeWidth={2.5} />
                    Registrar tiempo
                  </div>
                </button>
              )
            }

            return (
              <div key={bm.name}
                   className="relative overflow-hidden p-5 rounded-2xl bg-p border border-[var(--ln)] hover:border-[rgba(255,255,255,.13)] transition">
                {/* Glow corner */}
                <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
                     style={{ background: 'radial-gradient(circle, rgba(200,245,62,.06) 0%, transparent 70%)' }} />
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-barlow text-lg font-black tracking-wide uppercase">{bm.name}</div>
                  </div>
                  <div className="text-2xl opacity-70">{bm.icon}</div>
                </div>

                {/* Big result */}
                <div className="font-barlow font-black leading-none text-ac my-2"
                     style={{ fontSize: 'clamp(48px, 9vw, 64px)' }}>
                  {best.result}
                </div>
                <div className="text-mu text-[12px] leading-snug">{bm.desc}</div>

                <div className="mt-3 pt-3 border-t border-[var(--ln)] flex items-center justify-between">
                  {level && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold ${LEVEL_CLS[level.color]}`}>
                      <span>{level.icon}</span>
                      {level.label}
                    </span>
                  )}
                  <span className="text-[11px] text-fa">
                    {new Date(best.recorded_at).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })}
                  </span>
                </div>

                <button onClick={() => { setModalBm(bm); setResult(''); setNotes('') }}
                        className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2 rounded-xl bg-p3 border border-[var(--ln)] text-mu text-[12px] font-bold hover:text-ac hover:border-ac/25 transition">
                  <Plus size={12} strokeWidth={2.5} />
                  Mejorar registro
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {modalBm && (
        <Modal open onClose={() => setModalBm(null)} title={`BENCHMARK: ${modalBm.name}`} subtitle={modalBm.desc}>
          <form onSubmit={saveBenchmark} className="flex flex-col gap-4">
            <div>
              <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
                Resultado ({modalBm.unit === 'time' ? 'mm:ss · escribe solo dígitos' : 'rondas'})
              </label>
              <input required value={result}
                onChange={e => setResult(modalBm.unit === 'time' ? fmtTimeInput(e.target.value) : e.target.value)}
                className="w-full px-3 py-3 rounded-xl bg-p3 border border-[var(--ln)] text-t outline-none focus:border-ac font-barlow text-3xl font-bold text-center"
                placeholder={modalBm.unit === 'time' ? '06:29' : '21+3'} inputMode={modalBm.unit === 'time' ? 'numeric' : 'text'} />
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
