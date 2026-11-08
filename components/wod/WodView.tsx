'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, Users, Timer, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { rankResults } from '@/lib/utils/wod-ranking'
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

export const WOD_TYPE_META: Record<string, { label: string; cls: string }> = {
  fortime:  { label: 'For Time', cls: 'text-or bg-or/15' },
  amrap:    { label: 'AMRAP',    cls: 'text-ac bg-ac/15' },
  emom:     { label: 'EMOM',     cls: 'text-bl bg-bl/15' },
  tabata:   { label: 'Tabata',   cls: 'text-pu bg-pu/15' },
  strength: { label: 'Fuerza',   cls: 'text-gr bg-gr/15' },
}

const MAX_EDITS = 2

export function WodView({ profile, wod: initialWod, results: initialResults, memberships }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [wod, setWod]           = useState(initialWod)
  const [results, setResults]   = useState<any[]>(initialResults)
  const [resultModalOpen, setResultModalOpen] = useState(false)
  const [justPublished, setJustPublished]     = useState(false)

  const ranked = useMemo(() => rankResults(results), [results])
  const myResult = results.find(r => r.user_id === profile.id) ?? null

  async function reloadResults(wodId: string) {
    const { data } = await supabase
      .from('wod_results')
      .select('*, profiles(full_name, avatar_url)')
      .eq('daily_wod_id', wodId)
    setResults(data ?? [])
  }

  useEffect(() => {
    const boxIds = memberships.map(m => m.box_id)
    if (boxIds.length === 0) return

    const channel = supabase.channel(`wod-realtime-${profile.id}`)

    channel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'daily_wods',
      filter: `box_id=in.(${boxIds.join(',')})`,
    }, payload => {
      if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return
      const next = payload.new as DailyWod
      if (!next.is_live) return
      setWod((prev: any) => ({ ...prev, ...next }))
      setJustPublished(true)
      setTimeout(() => setJustPublished(false), 4000)
      reloadResults(next.id)
    })

    if (wod?.id) {
      channel.on('postgres_changes', {
        event: '*', schema: 'public', table: 'wod_results',
        filter: `daily_wod_id=eq.${wod.id}`,
      }, () => reloadResults(wod.id))
    }

    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberships, wod?.id])

  const movements: any[] = wod?.movements ?? []
  const meta = wod ? WOD_TYPE_META[wod.type] : null
  const editsLeft = MAX_EDITS - (myResult?.edit_count ?? 0)
  const timerHref = wod && wod.type !== 'strength'
    ? `/timer?mode=${wod.type}${wod.duration_mins ? `&mins=${wod.duration_mins}` : ''}&wod=${encodeURIComponent(wod.title)}`
    : null

  return (
    <>
      <Topbar title="WOD del Día" profile={profile} />

      {justPublished && (
        <div className="fixed top-[70px] inset-x-0 flex justify-center z-50 px-4 animate-fade-up pointer-events-none" role="status">
          <div className="bg-ac text-bg font-bold text-sm px-4 py-2 rounded-full">
            Tu coach actualizó el WOD
          </div>
        </div>
      )}

      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-2xl mx-auto w-full">
        {!wod ? (
          <Card className="text-center py-14 flex flex-col items-center gap-3">
            <div className="size-14 rounded-2xl bg-p2 grid place-items-center text-mu">
              {memberships.length === 0 ? <Users size={26} aria-hidden /> : <CalendarClock size={26} aria-hidden />}
            </div>
            <h2 className="font-barlow text-2xl font-black text-t">
              {memberships.length === 0 ? 'Aún no estás en un box' : 'Sin WOD por ahora'}
            </h2>
            <p className="text-mu text-sm max-w-xs text-pretty">
              {memberships.length === 0
                ? 'Pídele el código de invitación a tu coach para ver el WOD y competir en el leaderboard.'
                : 'Tu coach aún no publica el WOD de hoy. Aparecerá aquí apenas lo haga, sin recargar.'}
            </p>
            {memberships.length === 0 ? (
              <Link href="/settings" className="mt-2 h-11 px-5 rounded-full bg-ac text-bg font-bold text-sm grid place-items-center active:scale-[0.96] transition-transform">
                Ingresar código de box
              </Link>
            ) : (
              <Link href="/timer" className="mt-2 h-11 px-5 rounded-full bg-p2 text-t font-bold text-sm grid place-items-center active:scale-[0.96] transition-transform">
                Abrir timer libre
              </Link>
            )}
          </Card>
        ) : (
          <>
            <Card padding={false}>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {meta && (
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${meta.cls}`}>
                      {meta.label}
                    </span>
                  )}
                  {wod.duration_mins && <span className="text-mu text-xs tabular-nums">{wod.duration_mins} min</span>}
                  {wod.boxes?.name && <span className="text-mu text-xs truncate">· {wod.boxes.name}</span>}
                </div>
                <h2 className="font-barlow text-[32px] leading-tight font-black tracking-wide text-balance">{wod.title}</h2>
                {wod.description && (
                  <p className="text-mu text-sm leading-relaxed whitespace-pre-line mt-2 text-pretty">{wod.description}</p>
                )}
              </div>

              {movements.length > 0 && (
                <ol className="px-5 pb-5 flex flex-col gap-2" aria-label="Movimientos">
                  {movements.map((m: any, i: number) => (
                    <li key={i} className="flex items-center gap-3 py-3 px-3.5 bg-p2 rounded-xl">
                      <span className="size-7 rounded-full bg-p3 grid place-items-center text-mu font-barlow font-black text-sm tabular-nums flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">{m.name}</div>
                        {m.weight && <div className="text-mu text-xs">{m.weight}</div>}
                      </div>
                      <div className="font-barlow text-xl font-bold text-t tabular-nums whitespace-nowrap">
                        {m.sets > 1 ? `${m.sets}×` : ''}{m.reps}
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              <div className="p-5 pt-0 flex flex-col gap-2.5">
                {myResult ? (
                  <>
                    <div className="flex items-center justify-between p-4 bg-ac/10 rounded-xl">
                      <div>
                        <div className="text-[11px] uppercase tracking-[1.4px] text-ac font-bold">Tu resultado</div>
                        <div className="font-barlow text-3xl font-black tabular-nums">{myResult.result_value}</div>
                      </div>
                      <Badge color={myResult.rx_level === 'rx+' ? 'orange' : myResult.rx_level === 'scaled' ? 'blue' : 'lime'}>
                        {myResult.rx_level.toUpperCase()}
                      </Badge>
                    </div>
                    {editsLeft > 0 && (
                      <Button variant="secondary" className="w-full" onClick={() => setResultModalOpen(true)}>
                        <Pencil size={14} aria-hidden />
                        Corregir resultado · {editsLeft} {editsLeft === 1 ? 'cambio' : 'cambios'} disponible{editsLeft === 1 ? '' : 's'}
                      </Button>
                    )}
                  </>
                ) : (
                  <div className={timerHref ? 'grid grid-cols-[auto_1fr] gap-2.5' : ''}>
                    {timerHref && (
                      <Link href={timerHref} aria-label="Empezar con timer"
                        className="h-14 px-5 rounded-full bg-p2 text-t font-bold grid grid-flow-col place-items-center gap-2 active:scale-[0.96] transition-transform">
                        <Timer size={18} aria-hidden /> Timer
                      </Link>
                    )}
                    <button type="button" onClick={() => setResultModalOpen(true)} className="w-full h-14 rounded-full bg-ac text-bg font-bold text-base hover:bg-ac/90 active:scale-[0.96] transition-[transform,background-color]">
                      Registrar resultado
                    </button>
                  </div>
                )}
              </div>
            </Card>

            <WodLeaderboard results={ranked} currentUserId={profile.id} />
          </>
        )}
      </div>

      {resultModalOpen && wod && (
        <WodResultModal
          wod={wod}
          profile={profile}
          existingResult={myResult ?? undefined}
          onClose={() => setResultModalOpen(false)}
          onSaved={() => { setResultModalOpen(false); reloadResults(wod.id); router.refresh() }}
        />
      )}
    </>
  )
}
