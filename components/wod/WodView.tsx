'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { WodResultModal } from './WodResultModal'
import { WodLeaderboard } from './WodLeaderboard'
import type { Profile, DailyWod } from '@/lib/types/database'

interface Props {
  profile: Profile
  wod: any | null
  results: any[]
  myResult: any | null
  memberships: any[]
}

const WOD_TYPE_COLORS: Record<string, string> = {
  fortime:  'text-or bg-or/10 border-or/20',
  amrap:    'text-ac bg-ac/10 border-ac/20',
  emom:     'text-bl bg-bl/10 border-bl/20',
  tabata:   'text-pu bg-pu/10 border-pu/20',
  strength: 'text-gr bg-gr/10 border-gr/20',
}

// ── WOD Progress tracker ────────────────────────────────────────────────────────
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

function fmtSecs(s: number): string {
  const m = Math.floor(Math.abs(s) / 60)
  const sec = Math.abs(s) % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function WodProgressCard({ wod }: { wod: any }) {
  const elapsed = useElapsed(wod.published_at)
  const movements: any[] = wod.movements ?? []
  const totalDurationSecs = wod.duration_mins ? wod.duration_mins * 60 : null

  // For AMRAP/EMOM/Tabata: show countdown
  const isCountdown = ['amrap', 'emom', 'tabata'].includes(wod.type)
  const remaining = totalDurationSecs ? totalDurationSecs - elapsed : null

  // Estimate current exercise for fortime/strength
  let estimatedExerciseIdx = -1
  let cumulative = 0
  if (!isCountdown && movements.length > 0) {
    for (let i = 0; i < movements.length; i++) {
      const m = movements[i]
      const sets = m.sets ?? 1
      const estSecs = (m.est_mins ?? 2) * 60 * sets + (m.rest_secs ?? 60) * Math.max(0, sets - 1)
      cumulative += estSecs
      if (elapsed < cumulative) {
        estimatedExerciseIdx = i
        break
      }
    }
    if (estimatedExerciseIdx === -1) estimatedExerciseIdx = movements.length // WOD complete estimate
  }

  // Calculate total estimated WOD time
  const totalEstSecs = movements.reduce((acc: number, m: any) => {
    const sets = m.sets ?? 1
    return acc + (m.est_mins ?? 2) * 60 * sets + (m.rest_secs ?? 60) * Math.max(0, sets - 1)
  }, 0)

  const progressPct = totalEstSecs > 0
    ? Math.min(100, Math.round((elapsed / totalEstSecs) * 100))
    : totalDurationSecs
    ? Math.min(100, Math.round((elapsed / totalDurationSecs) * 100))
    : null

  const isOver = (remaining !== null && remaining <= 0) || (estimatedExerciseIdx >= movements.length && movements.length > 0)

  return (
    <Card className="border-rd/20">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 rounded-full bg-rd animate-pulse inline-block" />
        <span className="text-[10px] uppercase tracking-[1.8px] text-rd font-extrabold">WOD en curso</span>
        <span className="ml-auto font-barlaw text-2xl font-black text-t">{fmtSecs(elapsed)}</span>
      </div>

      {/* Progress bar */}
      {progressPct !== null && (
        <div className="mb-3">
          <div className="h-2 bg-[rgba(255,255,255,.07)] rounded-full overflow-hidden">
            <div className="h-full bg-rd rounded-full transition-all duration-1000"
              style={{ width: `${progressPct}%` }} />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-fa">
            <span>Inicio</span>
            <span>{progressPct}%</span>
            <span>{isCountdown ? `${fmtSecs(totalDurationSecs!)} total` : `~${fmtSecs(totalEstSecs)} estimado`}</span>
          </div>
        </div>
      )}

      {/* AMRAP/EMOM countdown */}
      {isCountdown && remaining !== null && (
        <div className={`text-center py-2 rounded-xl ${remaining > 0 ? 'bg-rd/8 border border-rd/20' : 'bg-gr/8 border border-gr/20'}`}>
          {remaining > 0 ? (
            <>
              <div className="text-[10px] text-fa uppercase tracking-wide font-bold mb-0.5">Tiempo restante</div>
              <div className={`font-barlaw text-4xl font-black ${remaining < 60 ? 'text-rd animate-pulse' : 'text-t'}`}>
                {fmtSecs(remaining)}
              </div>
              {wod.type === 'emom' && (
                <div className="text-[11px] text-mu mt-1">
                  Minuto {Math.floor(elapsed / 60) + 1} de {wod.duration_mins}
                </div>
              )}
            </>
          ) : (
            <div className="font-barlaw text-xl font-black text-gr">¡TIEMPO!</div>
          )}
        </div>
      )}

      {/* ForTime / Strength: estimated exercise */}
      {!isCountdown && movements.length > 0 && (
        <div className="bg-p3 rounded-xl p-3 border border-[var(--ln)]">
          {isOver ? (
            <div className="text-center font-barlaw text-lg font-black text-gr">
              ¡Aprox. completado! 🎉
            </div>
          ) : estimatedExerciseIdx >= 0 ? (
            <>
              <div className="text-[10px] text-fa uppercase tracking-wide font-bold mb-1.5">
                ~ Ejercicio actual (estimado)
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-ac/10 border border-ac/20 grid place-items-center text-ac font-barlaw font-black text-sm flex-shrink-0">
                  {estimatedExerciseIdx + 1}
                </div>
                <div>
                  <div className="font-semibold text-sm">{movements[estimatedExerciseIdx]?.name}</div>
                  <div className="text-mu text-[11px]">
                    {movements[estimatedExerciseIdx]?.reps}
                    {movements[estimatedExerciseIdx]?.weight ? ` · ${movements[estimatedExerciseIdx].weight}` : ''}
                  </div>
                </div>
              </div>
              {estimatedExerciseIdx < movements.length - 1 && (
                <div className="mt-2 text-[10px] text-fa">
                  Siguiente: {movements[estimatedExerciseIdx + 1]?.name} — {movements[estimatedExerciseIdx + 1]?.reps}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Exercise list with progress dots */}
      {movements.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {movements.map((m: any, idx: number) => {
            const done = !isCountdown && idx < estimatedExerciseIdx
            const current = !isCountdown && idx === estimatedExerciseIdx
            return (
              <div key={idx} className={`flex items-center gap-2 text-sm transition-colors ${
                done ? 'opacity-40 line-through text-fa' : current ? 'text-t' : 'text-mu'
              }`}>
                <div className={`w-4 h-4 rounded-full border flex-shrink-0 grid place-items-center ${
                  done ? 'bg-gr/20 border-gr/40' : current ? 'bg-ac/20 border-ac/40 animate-pulse' : 'border-[var(--ln2)]'
                }`}>
                  {done && <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="2 6 5 9 10 3"/></svg>}
                </div>
                <span className="font-semibold">{m.name}</span>
                <span className="text-[11px] text-fa ml-auto">
                  {m.sets > 1 ? `${m.sets}×` : ''}{m.reps}
                  {m.weight ? ` · ${m.weight}` : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export function WodView({ profile, wod: initialWod, results: initialResults, myResult: initialMyResult, memberships }: Props) {
  const supabase = createClient()
  const [wod, setWod]           = useState(initialWod)
  const [results, setResults]   = useState(initialResults)
  const [myResult, setMyResult] = useState(initialMyResult)
  const [resultModalOpen, setResultModalOpen] = useState(false)
  const [liveIndicator, setLiveIndicator]     = useState(false)

  useEffect(() => {
    const boxIds = memberships.map(m => m.box_id)
    if (boxIds.length === 0) return

    const channel = supabase.channel('wod-realtime')

    channel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'daily_wods',
      filter: `box_id=in.(${boxIds.join(',')})`,
    }, async payload => {
      setLiveIndicator(true)
      setTimeout(() => setLiveIndicator(false), 3000)
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const newWod = payload.new as DailyWod
        if (newWod.is_live) {
          setWod(newWod)
          const { data } = await supabase
            .from('wod_results')
            .select('*, profiles(full_name, avatar_url)')
            .eq('daily_wod_id', newWod.id)
          setResults(data ?? [])
          setMyResult(null)
        }
      }
    })

    channel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'wod_results',
    }, async () => {
      if (!wod) return
      const { data } = await supabase
        .from('wod_results')
        .select('*, profiles(full_name, avatar_url)')
        .eq('daily_wod_id', wod.id)
        .order('result_value', { ascending: true })
      setResults(data ?? [])
      const me = data?.find(r => r.user_id === profile.id) ?? null
      setMyResult(me)
    })

    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [memberships, wod?.id])

  const movements: any[] = wod?.movements ?? []

  return (
    <>
      <Topbar title="WOD del Día" profile={profile} />

      {liveIndicator && (
        <div className="fixed top-[70px] inset-x-0 flex justify-center z-50 px-4 animate-fade-up pointer-events-none">
          <div className="bg-ac text-bg font-bold text-sm px-4 py-2 rounded-full shadow-lg">
            🔴 Nuevo WOD publicado en vivo
          </div>
        </div>
      )}

      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-2xl mx-auto w-full">
        {!wod ? (
          <Card className="text-center py-16 flex flex-col items-center gap-3">
            <div className="text-[48px]">😴</div>
            <div className="font-barlaw text-2xl font-black text-mu">SIN WOD HOY</div>
            <div className="text-mu text-sm">
              {memberships.length === 0
                ? 'Únete a un box en Perfil → Mi Box para ver los WODs.'
                : 'Tu coach aún no ha publicado el WOD de hoy. Revisa más tarde.'}
            </div>
          </Card>
        ) : (
          <>
            {/* Progress tracker (only if WOD has movements with estimates or duration) */}
            {(movements.length > 0 || wod.duration_mins) && !myResult && (
              <WodProgressCard wod={wod} />
            )}

            {/* WOD Card */}
            <Card padding={false}>
              <div className="p-5 border-b border-[var(--ln)]">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${WOD_TYPE_COLORS[wod.type] ?? 'text-mu border-[var(--ln)]'}`}>
                        {wod.type.toUpperCase()}
                      </span>
                      {wod.duration_mins && (
                        <span className="text-mu text-[11px]">{wod.duration_mins} min</span>
                      )}
                      <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-rd animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-rd inline-block" />
                        LIVE
                      </span>
                    </div>
                    <h2 className="font-barlaw text-[28px] font-black tracking-wide">{wod.title}</h2>
                    {wod.boxes?.name && <div className="text-mu text-xs mt-0.5">{wod.boxes.name}</div>}
                  </div>
                </div>
                {wod.description && (
                  <p className="text-mu text-sm leading-relaxed whitespace-pre-line">{wod.description}</p>
                )}
              </div>

              {/* Movements */}
              {movements.length > 0 && (
                <div className="p-5 border-b border-[var(--ln)] flex flex-col gap-2.5">
                  <div className="text-[10px] uppercase tracking-[1.6px] text-fa font-bold mb-1">Movimientos</div>
                  {movements.map((m: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2.5 px-3 bg-p3 rounded-xl">
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-ac/10 border border-ac/20 grid place-items-center text-ac font-barlaw font-black text-sm">
                          {i + 1}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{m.name}</div>
                          {m.weight && <div className="text-fa text-[11px]">{m.weight}</div>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-barlaw text-xl font-bold text-ac">
                          {m.sets > 1 ? `${m.sets}×` : ''}{m.reps}
                        </div>
                        {(m.est_mins || m.rest_secs) && (
                          <div className="text-[10px] text-fa">
                            ~{m.est_mins}min{m.rest_secs ? ` · ${m.rest_secs}s rest` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Result action */}
              <div className="p-5">
                {myResult ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between p-3 bg-ac/8 border border-ac/20 rounded-xl">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-ac font-bold">Tu resultado</div>
                        <div className="font-barlaw text-2xl font-black">{myResult.result_value}</div>
                      </div>
                      <Badge color={myResult.rx_level === 'rx+' ? 'orange' : myResult.rx_level === 'scaled' ? 'blue' : 'lime'}>
                        {myResult.rx_level.toUpperCase()}
                      </Badge>
                    </div>
                    {/* Allow editing up to 2 times — tracked in the result row */}
                    {(myResult.edit_count ?? 0) < 2 && (
                      <button onClick={() => setResultModalOpen(true)}
                        className="w-full py-2 rounded-xl border border-[var(--ln2)] text-mu text-sm font-bold hover:text-ac hover:border-ac/30 transition-colors">
                        Modificar resultado ({2 - (myResult.edit_count ?? 0)} {2 - (myResult.edit_count ?? 0) === 1 ? 'vez' : 'veces'} restante{2 - (myResult.edit_count ?? 0) !== 1 ? 's' : ''})
                      </button>
                    )}
                  </div>
                ) : (
                  <Button className="w-full" size="lg" onClick={() => setResultModalOpen(true)}>
                    Registrar resultado
                  </Button>
                )}
              </div>
            </Card>

            <WodLeaderboard results={results} wod={wod} currentUserId={profile.id} />
          </>
        )}
      </div>

      {resultModalOpen && wod && (
        <WodResultModal
          wod={wod}
          profile={profile}
          existingResult={myResult ?? undefined}
          onClose={() => setResultModalOpen(false)}
          onSaved={() => { setResultModalOpen(false); window.location.reload() }}
        />
      )}
    </>
  )
}
