'use client'
import { useState, useEffect } from 'react'
import { todayISO } from '@/lib/utils/dates'
import { createClient } from '@/lib/supabase/client'
import { useShell } from '@/lib/hooks/useShell'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import Link from 'next/link'
import { ClipboardList } from '@/components/ui/icons'
import { rankResults } from '@/lib/utils/wod-ranking'
import { WOD_TYPE_META } from '@/lib/utils/wod-types'

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

      const today = todayISO()
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wod_results', filter: `daily_wod_id=eq.${wod.id}` }, async () => {
        const { data } = await supabase.from('wod_results')
          .select('*, profiles(full_name, email)')
          .eq('daily_wod_id', wod.id)
          .order('recorded_at', { ascending: true })
        setResults(data ?? [])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [wod?.id])

  const movements: any[] = wod?.movements ?? []

  // Only count results from active athlete members (avoids coach results or stale members)
  const memberIds = new Set(members.map((m: any) => m.profiles?.id).filter(Boolean))
  const athleteCount = memberIds.size
  const doneCount    = results.filter((r: any) => memberIds.has(r.user_id)).length
  const pendingAthletes = members.filter((m: any) =>
    m.profiles && !results.find((r: any) => r.user_id === m.profiles.id)
  )
  const ranked = rankResults(results)
  const meta = wod ? WOD_TYPE_META[wod.type] : null
  const pct = athleteCount > 0 ? Math.round((doneCount / athleteCount) * 100) : 0

  if (loading) return (
    <>
      <Topbar title="En vivo" profile={profile} />
      <div className="p-4 lg:p-6 max-w-2xl mx-auto w-full flex flex-col gap-4" aria-busy="true">
        <div className="h-36 rounded-[20px] bg-p animate-pulse" />
        <div className="h-64 rounded-[20px] bg-p animate-pulse" />
      </div>
    </>
  )

  if (!wod) return (
    <>
      <Topbar title="En vivo" profile={profile} />
      <div className="p-4 lg:p-6 max-w-2xl mx-auto w-full">
        <Card className="text-center py-14 flex flex-col items-center gap-3">
          <div className="size-14 rounded-2xl bg-p2 grid place-items-center text-mu"><ClipboardList size={26} aria-hidden /></div>
          <h2 className="font-display text-2xl font-extrabold tracking-tight">Sin WOD publicado hoy</h2>
          <p className="text-mu text-sm max-w-xs text-pretty">Publica el WOD del día y aquí verás en vivo quién registra y cómo va el ranking.</p>
          <Link href="/coach/publish-wod" className="mt-2 h-11 px-5 rounded-full bg-ac text-onac font-bold text-sm grid place-items-center active:scale-[0.96] transition-transform">
            Publicar WOD
          </Link>
        </Card>
      </div>
    </>
  )

  return (
    <>
      <Topbar title="En vivo" profile={profile} />
      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-2xl mx-auto w-full">

        <Card>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {meta && <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${meta.cls}`}>{meta.label}</span>}
            {wod.duration_mins && <span className="text-mu text-xs tabular-nums">{wod.duration_mins} min</span>}
            <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-rd">
              <span className="relative flex size-2" aria-hidden><span className="absolute inset-0 rounded-full bg-rd animate-ping-slow" /><span className="relative size-2 rounded-full bg-rd" /></span> En vivo
            </span>
          </div>
          <h2 className="font-display text-3xl font-extrabold text-balance tracking-tight">{wod.title}</h2>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <div className="font-display text-5xl font-extrabold leading-none tabular-nums tracking-tight">
                {doneCount}<span className="text-mu text-2xl"> / {athleteCount}</span>
              </div>
              <div className="text-mu text-xs mt-1">
                {athleteCount === 0
                  ? <>Aún no tienes atletas. Comparte el código <span className="text-ac font-bold tracking-widest">{wod.box?.invite_code}</span></>
                  : 'atletas registraron su resultado'}
              </div>
            </div>
            <div className="font-display text-2xl font-extrabold text-ac tabular-nums tracking-tight">{pct}%</div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-p3 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Atletas que registraron">
            <div className="h-full bg-ac rounded-full transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </Card>

        <Card padding={false}>
          <div className="px-5 pt-5 pb-3 font-display font-extrabold text-lg tracking-tight">
            Ranking <span className="text-mu text-sm font-sans normal-case tracking-normal font-normal">· Rx+ y Rx primero</span>
          </div>
          {ranked.length === 0 ? (
            <p className="px-5 pb-5 text-mu text-sm">Todavía nadie registra. Se actualiza solo cuando lo hagan.</p>
          ) : (
            <ol className="px-2 pb-2">
              {ranked.map((r: any, idx: number) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
                  <span className={`w-7 text-center font-display font-extrabold text-2xl tabular-nums ${idx === 0 ? 'text-ac' : idx < 3 ? 'text-t' : 'text-fa'}`}>
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{r.profiles?.full_name ?? r.profiles?.email}</div>
                    <div className="text-xs text-mu tabular-nums truncate">
                      {new Date(r.recorded_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      {r.notes ? ` · ${r.notes}` : ''}
                    </div>
                  </div>
                  <span className="font-display text-xl font-extrabold tabular-nums tracking-tight">{r.result_value}</span>
                  <Badge color={r.rx_level === 'rx+' ? 'orange' : r.rx_level === 'scaled' ? 'blue' : 'lime'} className="w-[58px] justify-center">
                    {r.rx_level.toUpperCase()}
                  </Badge>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {pendingAthletes.length > 0 && (
          <Card>
            <div className="text-[11px] uppercase tracking-[1.4px] text-mu font-bold mb-3">
              Sin registrar ({pendingAthletes.length})
            </div>
            <ul className="flex flex-wrap gap-2">
              {pendingAthletes.map((m: any) => (
                <li key={m.id} className="px-3 py-1.5 rounded-full bg-p2 text-xs font-medium">
                  {m.profiles?.full_name}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {movements.length > 0 && (
          <Card padding={false}>
            <div className="px-5 pt-5 pb-3 font-display font-extrabold text-lg tracking-tight">Movimientos</div>
            <ol className="px-5 pb-5 flex flex-col gap-2">
              {movements.map((m: any, idx: number) => (
                <li key={idx} className="flex items-center gap-3 py-2.5 px-3.5 bg-p2 rounded-xl">
                  <span className="size-6 rounded-full bg-p3 grid place-items-center text-xs font-black text-mu tabular-nums">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{m.name}</div>
                    {m.weight && <div className="text-xs text-mu">{m.weight}</div>}
                  </div>
                  <span className="font-display text-lg font-bold tabular-nums tracking-tight">{m.sets > 1 ? `${m.sets}×` : ''}{m.reps}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </>
  )
}
