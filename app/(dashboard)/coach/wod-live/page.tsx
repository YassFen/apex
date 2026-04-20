'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useShell } from '@/lib/hooks/useShell'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

function fmtSecs(s: number): string {
  const m = Math.floor(Math.abs(s) / 60)
  const sec = Math.abs(s) % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function useElapsed(publishedAt: string | null): number {
  const [elapsed, setElapsed] = useState(() =>
    publishedAt ? Math.floor((Date.now() - new Date(publishedAt).getTime()) / 1000) : 0
  )
  useEffect(() => {
    if (!publishedAt) return
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(publishedAt).getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [publishedAt])
  return elapsed
}

export default function CoachWodLivePage() {
  const { profile } = useShell()
  const supabase = createClient()

  const [wod, setWod]         = useState<any>(null)
  const [results, setResults] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: box } = await supabase
        .from('boxes').select('id, name, invite_code').eq('owner_id', profile.id).single()
      if (!box) { setLoading(false); return }

      const today = new Date().toISOString().split('T')[0]
      const { data: todayWod } = await supabase
        .from('daily_wods').select('*')
        .eq('box_id', box.id).eq('scheduled_for', today).eq('is_live', true)
        .order('published_at', { ascending: false }).limit(1).single()

      if (todayWod) {
        setWod({ ...todayWod, box })
        const [{ data: res }, { data: mems }] = await Promise.all([
          supabase.from('wod_results')
            .select('*, profiles(full_name, email)')
            .eq('daily_wod_id', todayWod.id)
            .order('recorded_at', { ascending: true }),
          supabase.from('box_members')
            .select('*, profiles(id, full_name)')
            .eq('box_id', box.id).eq('is_active', true).eq('role', 'athlete'),
        ])
        setResults(res ?? [])
        setMembers(mems ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  // Realtime updates
  useEffect(() => {
    if (!wod?.id) return
    const channel = supabase.channel('coach-wod-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wod_results' }, async () => {
        const { data } = await supabase.from('wod_results')
          .select('*, profiles(full_name, email)')
          .eq('daily_wod_id', wod.id)
          .order('recorded_at', { ascending: true })
        setResults(data ?? [])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [wod?.id])

  const elapsed = useElapsed(wod?.published_at ?? null)
  const movements: any[] = wod?.movements ?? []
  const totalDurationSecs = wod?.duration_mins ? wod.duration_mins * 60 : null
  const remaining = totalDurationSecs ? totalDurationSecs - elapsed : null
  const isCountdown = wod && ['amrap', 'emom', 'tabata'].includes(wod.type)

  const athleteCount = members.filter(m => m.role === 'athlete').length
  const doneCount = results.length
  const pendingAthletes = members.filter(m =>
    m.profiles && !results.find((r: any) => r.user_id === m.profiles.id)
  )

  // Estimate current exercise for each athlete still going
  const totalEstSecs = movements.reduce((acc: number, m: any) => {
    const sets = m.sets ?? 1
    return acc + (m.est_mins ?? 2) * 60 * sets + (m.rest_secs ?? 60) * Math.max(0, sets - 1)
  }, 0)
  let estimatedExIdx = -1
  if (!isCountdown && movements.length > 0) {
    let cum = 0
    for (let i = 0; i < movements.length; i++) {
      const m = movements[i]
      const sets = m.sets ?? 1
      cum += (m.est_mins ?? 2) * 60 * sets + (m.rest_secs ?? 60) * Math.max(0, sets - 1)
      if (elapsed < cum) { estimatedExIdx = i; break }
    }
    if (estimatedExIdx === -1) estimatedExIdx = movements.length
  }

  if (loading) return (
    <>
      <Topbar title="Seguimiento WOD" profile={profile} />
      <div className="p-6 text-mu text-sm">Cargando…</div>
    </>
  )

  if (!wod) return (
    <>
      <Topbar title="Seguimiento WOD" profile={profile} />
      <div className="p-4 lg:p-6">
        <Card className="text-center py-14">
          <div className="text-[40px] mb-3">📋</div>
          <div className="font-barlaw text-xl font-black text-mu">SIN WOD ACTIVO</div>
          <div className="text-mu text-sm mt-2">Publica el WOD del día para ver el seguimiento en vivo.</div>
        </Card>
      </div>
    </>
  )

  return (
    <>
      <Topbar title="Seguimiento WOD" profile={profile} />
      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-2xl mx-auto w-full">

        {/* ── Live clock ── */}
        <Card className="border-rd/20">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-rd animate-pulse" />
            <span className="text-[10px] uppercase tracking-[1.8px] text-rd font-extrabold">En vivo</span>
            <span className="ml-auto font-barlaw text-3xl font-black">{fmtSecs(elapsed)}</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-3 bg-p3 rounded-xl">
              <div className="font-barlaw text-3xl font-black text-ac">{doneCount}</div>
              <div className="text-[10px] text-mu uppercase tracking-wide font-bold mt-1">Terminaron</div>
            </div>
            <div className="text-center p-3 bg-p3 rounded-xl">
              <div className="font-barlaw text-3xl font-black text-or">{athleteCount - doneCount}</div>
              <div className="text-[10px] text-mu uppercase tracking-wide font-bold mt-1">En curso</div>
            </div>
            <div className="text-center p-3 bg-p3 rounded-xl">
              <div className="font-barlaw text-3xl font-black">{athleteCount}</div>
              <div className="text-[10px] text-mu uppercase tracking-wide font-bold mt-1">Total atletas</div>
            </div>
          </div>

          {isCountdown && remaining !== null && (
            <div className={`text-center py-3 rounded-xl border ${remaining > 0 ? 'bg-rd/8 border-rd/20' : 'bg-gr/8 border-gr/20'}`}>
              <div className="text-[10px] text-fa uppercase tracking-wide font-bold mb-1">
                {remaining > 0 ? 'Tiempo restante' : '¡TIEMPO!'}
              </div>
              {remaining > 0 && (
                <div className={`font-barlaw text-4xl font-black ${remaining < 60 ? 'text-rd animate-pulse' : 'text-t'}`}>
                  {fmtSecs(remaining)}
                </div>
              )}
            </div>
          )}

          {!isCountdown && movements.length > 0 && (
            <div className="bg-p3 rounded-xl p-3 border border-[var(--ln)]">
              <div className="text-[10px] text-fa uppercase tracking-wide font-bold mb-1.5">
                ~ Ejercicio actual (estimado para atletas en curso)
              </div>
              {estimatedExIdx < movements.length ? (
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-rd/10 border border-rd/20 grid place-items-center text-rd font-barlaw font-black text-sm flex-shrink-0">
                    {estimatedExIdx + 1}
                  </div>
                  <div>
                    <div className="font-semibold">{movements[estimatedExIdx]?.name}</div>
                    <div className="text-mu text-[11px]">
                      {movements[estimatedExIdx]?.reps}
                      {movements[estimatedExIdx]?.weight ? ` · ${movements[estimatedExIdx].weight}` : ''}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-gr font-semibold text-sm">Mayoría deberían haber terminado</div>
              )}
            </div>
          )}
        </Card>

        {/* ── Ejercicios con tiempos ── */}
        {movements.length > 0 && (
          <Card padding={false}>
            <div className="px-4 py-3 border-b border-[var(--ln)] font-barlaw font-extrabold text-[13px] uppercase tracking-widest text-mu">
              EJERCICIOS DEL WOD
            </div>
            <div className="divide-y divide-[rgba(255,255,255,.04)]">
              {movements.map((m: any, idx: number) => {
                const done = !isCountdown && idx < estimatedExIdx
                const current = !isCountdown && idx === estimatedExIdx
                return (
                  <div key={idx} className={`flex items-center justify-between px-4 py-3 ${current ? 'bg-rd/5' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full border grid place-items-center text-xs font-black flex-shrink-0 ${
                        done ? 'border-gr/40 text-gr' : current ? 'border-rd/40 text-rd animate-pulse' : 'border-[var(--ln2)] text-fa'
                      }`}>
                        {done ? '✓' : idx + 1}
                      </div>
                      <div>
                        <div className={`font-semibold text-sm ${done ? 'text-fa line-through' : ''}`}>{m.name}</div>
                        {m.weight && <div className="text-[11px] text-fa">{m.weight}</div>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-barlaw text-lg font-bold">
                        {m.sets > 1 ? `${m.sets}×` : ''}{m.reps}
                      </div>
                      {m.est_mins && (
                        <div className="text-[10px] text-fa">~{m.est_mins}min · {m.rest_secs}s rest</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* ── Resultados ── */}
        {results.length > 0 && (
          <Card padding={false}>
            <div className="px-4 py-3 border-b border-[var(--ln)] font-barlaw font-extrabold text-[13px] uppercase tracking-widest text-mu">
              RESULTADOS ({results.length})
            </div>
            <div className="divide-y divide-[rgba(255,255,255,.04)]">
              {results.map((r: any, idx: number) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={`font-barlaw font-black text-lg w-6 text-center ${idx === 0 ? 'text-ac' : 'text-fa'}`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{r.profiles?.full_name ?? r.profiles?.email}</div>
                    <div className="text-[11px] text-mu">
                      {new Date(r.recorded_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <Badge color={r.rx_level === 'rx+' ? 'orange' : r.rx_level === 'scaled' ? 'blue' : 'lime'}>
                    {r.rx_level.toUpperCase()}
                  </Badge>
                  <div className="font-barlaw text-xl font-black">{r.result_value}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Atletas pendientes ── */}
        {pendingAthletes.length > 0 && (
          <Card>
            <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-3">
              Aún en curso ({pendingAthletes.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {pendingAthletes.map((m: any) => (
                <div key={m.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-p3 border border-[var(--ln)]">
                  <div className="w-2 h-2 rounded-full bg-or animate-pulse" />
                  <span className="text-xs font-medium">{m.profiles?.full_name}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
