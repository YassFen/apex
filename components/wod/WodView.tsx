'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, Users, Timer, Pencil, History, Dumbbell, Clock, Info } from '@/components/ui/icons'
import { createClient } from '@/lib/supabase/client'
import { rankResults } from '@/lib/utils/wod-ranking'
import { todayISO } from '@/lib/utils/dates'
import { ActivePill } from '@/components/ui/motion'
import { cn } from '@/lib/utils/cn'
import { WOD_TYPE_META } from '@/lib/utils/wod-types'

import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { WodResultModal } from './WodResultModal'
import { WodLeaderboard } from './WodLeaderboard'
import { useToast } from '@/components/ui/Toast'
import type { Profile, DailyWod, Movement } from '@/lib/types/database'
import { MovementDetail } from '@/components/movements/MovementsView'

interface Props {
  profile: Profile
  wod: any | null
  results: any[]
  myResult: any | null
  memberships: any[]
  maxes?: { name: string; valueLb: number }[]
  bumps?: Bump[] | null
  todayWods?: { id: string; label: string }[]
  library?: Movement[]
}

type Bump = { result_id: string; user_id: string }


const MAX_EDITS = 2

export function WodView({ profile, wod: initialWod, results: initialResults, memberships, maxes = [], bumps: initialBumps = [], todayWods = [], library = [] }: Props) {
  const [info, setInfo] = useState<Movement | null>(null)
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [wod, setWod]           = useState(initialWod)
  const [results, setResults]   = useState<any[]>(initialResults)
  const [resultModalOpen, setResultModalOpen] = useState(false)
  const [justPublished, setJustPublished]     = useState(false)
  const [bumps, setBumps] = useState<Bump[] | null>(initialBumps)
  const { fire } = useToast()

  const ranked = useMemo(() => rankResults(results), [results])
  const myResult = results.find(r => r.user_id === profile.id) ?? null

  async function reloadResults(wodId: string) {
    const { data } = await supabase
      .from('wod_results')
      .select('*, profiles(full_name, avatar_url)')
      .eq('daily_wod_id', wodId)
    setResults(data ?? [])
    const ids = (data ?? []).map((r: any) => r.id)
    if (ids.length === 0) return
    const { data: b, error } = await supabase.from('wod_result_bumps').select('result_id, user_id').in('result_id', ids)
    setBumps(error ? null : ((b ?? []) as Bump[]))
  }

  async function toggleBump(resultId: string) {
    if (!bumps) return
    const mine = bumps.some(b => b.result_id === resultId && b.user_id === profile.id)
    const prev = bumps
    // Optimistic: the tap feels instant, and we roll back if the server says no.
    setBumps(mine
      ? bumps.filter(b => !(b.result_id === resultId && b.user_id === profile.id))
      : [...bumps, { result_id: resultId, user_id: profile.id }])
    const { error } = mine
      ? await supabase.from('wod_result_bumps').delete().eq('result_id', resultId).eq('user_id', profile.id)
      : await supabase.from('wod_result_bumps').insert({ result_id: resultId, user_id: profile.id })
    if (error) { setBumps(prev); fire('No se pudo enviar. Inténtalo de nuevo.', 'error') }
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
      // Ignore WODs programmed for other days and other boxes' WODs when one is already shown.
      if (!next.is_live || next.scheduled_for !== todayISO()) return
      if (wod?.id && next.id !== wod.id) return
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
      channel.on('postgres_changes', {
        event: '*', schema: 'public', table: 'wod_result_bumps',
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
      <Topbar title="WOD del día" profile={profile} actions={
        <Link href="/wod/history" aria-label="Historial de WODs" title="Historial de WODs"
          className="size-10 grid place-items-center rounded-xl text-mu hover:text-t hover:bg-p2 transition-colors">
          <History size={18} aria-hidden />
        </Link>
      } />

      {justPublished && (
        <div className="fixed top-[70px] inset-x-0 flex justify-center z-50 px-4 animate-fade-up pointer-events-none" role="status">
          <div className="bg-ac text-onac font-bold text-sm px-4 py-2 rounded-full">
            Tu coach actualizó el WOD
          </div>
        </div>
      )}

      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-2xl mx-auto w-full">
        {todayWods.length > 1 && (
          <nav aria-label="WODs de hoy" className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-1.5 overflow-x-auto scrollbar-none">
            {todayWods.map(t => {
              const active = t.id === wod?.id
              return (
                <Link key={t.id} href={`/wod?wod=${t.id}`} ref={el => { if (active) el?.scrollIntoView({ inline: 'center', block: 'nearest' }) }} scroll={false} aria-current={active ? 'page' : undefined}
                  className={cn('relative isolate flex-shrink-0 h-9 px-4 rounded-full text-sm font-bold grid place-items-center transition-colors max-w-[200px] truncate',
                    active ? 'text-onac' : 'bg-p text-mu hover:text-t')}>
                  {active && <ActivePill layoutId="wod-box" className="rounded-full bg-ac" />}
                  {t.label}
                </Link>
              )
            })}
          </nav>
        )}
        {!wod ? (
          <Card className="text-center py-14 flex flex-col items-center gap-3">
            <div className="size-14 rounded-2xl bg-p2 grid place-items-center text-mu">
              {memberships.length === 0 ? <Users size={26} aria-hidden /> : <CalendarClock size={26} aria-hidden />}
            </div>
            <h2 className="font-display text-2xl font-extrabold text-t tracking-tight">
              {memberships.length === 0 ? 'Aún no estás en un box' : 'Sin WOD por ahora'}
            </h2>
            <p className="text-mu text-sm max-w-xs text-pretty">
              {memberships.length === 0
                ? 'Pídele el código de invitación a tu coach para ver el WOD y competir en el leaderboard.'
                : 'Tu coach aún no publica el WOD de hoy. Aparecerá aquí apenas lo haga, sin recargar.'}
            </p>
            {memberships.length === 0 ? (
              <Link href="/settings" className="mt-2 h-11 px-5 rounded-full bg-ac text-onac font-bold text-sm grid place-items-center active:scale-[0.96] transition-transform">
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
                  {wod.class_time && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-p2 text-[11px] font-bold tabular-nums"><Clock size={12} weight="bold" aria-hidden />{String(wod.class_time).slice(0, 5)}</span>}
                  {wod.duration_mins && <span className="text-mu text-xs tabular-nums">{wod.duration_mins} min</span>}
                  {wod.boxes?.name && <span className="text-mu text-xs truncate">· {wod.boxes.name}</span>}
                </div>
                <h2 className="font-display text-[32px] leading-tight font-extrabold text-balance tracking-tight">{wod.title}</h2>
                {wod.description && (
                  <p className="text-mu text-sm leading-relaxed whitespace-pre-line mt-2 text-pretty">{wod.description}</p>
                )}
              </div>

              {movements.length > 0 && (
                <ol className="px-5 pb-5 flex flex-col gap-2" aria-label="Movimientos">
                  {movements.map((m: any, i: number) => (
                    <li key={i}>
                    <button type="button" onClick={() => setInfo(library.find(x => x.name.toLowerCase() === String(m.name ?? '').toLowerCase()) ?? { id: `wod-${i}`, name: m.name, category: 'weightlifting', description: null, video_url: null })}
                      className="w-full text-left flex items-center gap-3 py-3 px-3.5 bg-p2 rounded-xl hover:bg-p3 active:scale-[0.99] transition">
                      <span className="size-7 rounded-full bg-p3 grid place-items-center text-mu font-display font-extrabold text-sm tabular-nums flex-shrink-0 tracking-tight">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">{m.name}</div>
                        {m.weight && <div className="text-mu text-xs">{m.weight}</div>}
                      </div>
                      <div className="font-display text-xl font-bold text-t tabular-nums whitespace-nowrap tracking-tight">
                        {m.sets > 1 ? `${m.sets}×` : ''}{m.reps}
                      </div>
                      <Info size={16} className="text-fa flex-shrink-0" aria-label="Cómo se hace" />
                    </button>
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
                        <div className="font-display text-3xl font-extrabold tabular-nums tracking-tight">{myResult.result_value}</div>
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
                    <button type="button" onClick={() => setResultModalOpen(true)} className="w-full h-14 rounded-full bg-ac text-onac font-bold text-base hover:bg-ac/90 active:scale-[0.96] transition-[transform,background-color]">
                      Registrar resultado
                    </button>
                  </div>
                )}
              </div>
            </Card>

            <YourNumbers movements={movements} maxes={maxes} unit={profile.preferred_unit ?? 'kg'} />

            <WodLeaderboard results={ranked} currentUserId={profile.id} bumps={bumps} onBump={toggleBump} />
          </>
        )}
      </div>

      {resultModalOpen && wod && (
        <WodResultModal
          wod={wod}
          profile={profile}
          existingResult={myResult ?? undefined}
          onClose={() => setResultModalOpen(false)}
          onSaved={() => {
            setResultModalOpen(false); reloadResults(wod.id); router.refresh()
            fire(myResult ? 'Resultado corregido' : 'Resultado registrado. ¡Bien hecho!', 'pr')
          }}
        />
      )}
      <MovementDetail movement={info} onClose={() => setInfo(null)} unit={profile.preferred_unit ?? 'kg'}
        records={info ? maxes.filter(x => x.name === info.name).map(x => ({ metric: '1rm', valueLb: x.valueLb })) : []} />
    </>
  )
}

const PERCENTS = [60, 70, 80, 90]

/** Today's lifts matched against the athlete's 1RMs, with quick working percentages. */
function YourNumbers({ movements, maxes, unit }: { movements: any[]; maxes: { name: string; valueLb: number }[]; unit: 'kg' | 'lb' }) {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const matches = movements
    .map(m => {
      const name = norm(m.name ?? '')
      const max = maxes.find(x => { const n = norm(x.name); return name && (name.includes(n) || n.includes(name)) })
      return max ? { label: max.name, valueLb: max.valueLb } : null
    })
    .filter((m, i, arr): m is { label: string; valueLb: number } => !!m && arr.findIndex(x => x?.label === m.label) === i)

  if (matches.length === 0) return null

  const toUnit = (lb: number) => {
    const v = unit === 'kg' ? lb * 0.453592 : lb
    // Round to what you can actually load: 0.5 kg / 1 lb steps.
    return unit === 'kg' ? Math.round(v * 2) / 2 : Math.round(v)
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Dumbbell size={16} className="text-ac" aria-hidden />
        <h3 className="font-display text-lg font-extrabold tracking-tight">Tus números</h3>
      </div>
      <ul className="flex flex-col gap-3">
        {matches.map(m => (
          <li key={m.label}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="font-semibold text-sm truncate">{m.label}</span>
              <span className="text-mu text-xs tabular-nums">1RM <span className="text-t font-bold">{toUnit(m.valueLb)} {unit}</span></span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {PERCENTS.map(p => (
                <div key={p} className="rounded-xl bg-p2 py-2 text-center">
                  <div className="text-[10px] text-mu font-bold">{p}%</div>
                  <div className="font-display text-lg font-extrabold tabular-nums leading-tight tracking-tight">{toUnit(m.valueLb * p / 100)}</div>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
