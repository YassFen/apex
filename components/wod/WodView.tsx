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
  fortime: 'text-or bg-or/10 border-or/20',
  amrap:   'text-ac bg-ac/10 border-ac/20',
  emom:    'text-bl bg-bl/10 border-bl/20',
  tabata:  'text-pu bg-pu/10 border-pu/20',
  strength:'text-gr bg-gr/10 border-gr/20',
}

export function WodView({ profile, wod: initialWod, results: initialResults, myResult: initialMyResult, memberships }: Props) {
  const supabase = createClient()
  const [wod, setWod]           = useState(initialWod)
  const [results, setResults]   = useState(initialResults)
  const [myResult, setMyResult] = useState(initialMyResult)
  const [resultModalOpen, setResultModalOpen] = useState(false)
  const [liveIndicator, setLiveIndicator]     = useState(false)

  // Supabase Realtime — listen for new/updated WODs and results
  useEffect(() => {
    const boxIds = memberships.map(m => m.box_id)
    if (boxIds.length === 0) return

    const channel = supabase.channel('wod-realtime')

    // Listen for new daily_wods published
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'daily_wods',
      filter: `box_id=in.(${boxIds.join(',')})`,
    }, async payload => {
      setLiveIndicator(true)
      setTimeout(() => setLiveIndicator(false), 3000)
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const newWod = payload.new as DailyWod
        if (newWod.is_live) {
          setWod(newWod)
          // Fetch results for new WOD
          const { data } = await supabase
            .from('wod_results')
            .select('*, profiles(full_name, avatar_url)')
            .eq('daily_wod_id', newWod.id)
          setResults(data ?? [])
          setMyResult(null)
        }
      }
    })

    // Listen for new results (leaderboard updates)
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'wod_results',
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
      <Topbar title="WOD del Día" onMenuClick={() => {}} profile={profile} />

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
            <div className="font-barlow text-2xl font-black text-mu">SIN WOD HOY</div>
            <div className="text-mu text-sm">
              {memberships.length === 0
                ? 'Únete a un box con un código de invitación para ver los WODs.'
                : 'Tu coach aún no ha publicado el WOD de hoy. Revisa más tarde.'}
            </div>
          </Card>
        ) : (
          <>
            {/* WOD Card */}
            <Card padding={false}>
              {/* Header */}
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
                    <h2 className="font-barlow text-[28px] font-black tracking-wide">{wod.title}</h2>
                    {wod.boxes?.name && (
                      <div className="text-mu text-xs mt-0.5">{wod.boxes.name}</div>
                    )}
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
                        <div className="w-6 h-6 rounded-full bg-ac/10 border border-ac/20 grid place-items-center text-ac font-barlow font-black text-sm">
                          {i + 1}
                        </div>
                        <span className="font-semibold text-sm">{m.name}</span>
                      </div>
                      <span className="font-barlow text-xl font-bold text-ac">{m.reps}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Result action */}
              <div className="p-5">
                {myResult ? (
                  <div className="flex items-center justify-between p-3 bg-ac/8 border border-ac/20 rounded-xl">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-ac font-bold">Tu resultado</div>
                      <div className="font-barlow text-2xl font-black">{myResult.result_value}</div>
                    </div>
                    <Badge color={myResult.rx_level === 'rx+' ? 'orange' : myResult.rx_level === 'scaled' ? 'blue' : 'lime'}>
                      {myResult.rx_level.toUpperCase()}
                    </Badge>
                  </div>
                ) : (
                  <Button className="w-full" size="lg" onClick={() => setResultModalOpen(true)}>
                    Registrar resultado
                  </Button>
                )}
              </div>
            </Card>

            {/* Leaderboard */}
            <WodLeaderboard results={results} wod={wod} currentUserId={profile.id} />
          </>
        )}
      </div>

      {resultModalOpen && wod && (
        <WodResultModal
          wod={wod}
          profile={profile}
          onClose={() => setResultModalOpen(false)}
          onSaved={() => {
            setResultModalOpen(false)
            window.location.reload()
          }}
        />
      )}
    </>
  )
}
