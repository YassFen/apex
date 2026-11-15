import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { todayISO } from '@/lib/utils/dates'
import { redirect } from 'next/navigation'
import { WodView } from '@/components/wod/WodView'
import type { Profile } from '@/lib/types/database'

export default async function WodPage({ searchParams }: { searchParams: Promise<{ box?: string; time?: string; rounds?: string }> }) {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const p = await getProfile(user.id)
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  const { data: memberships } = await supabase
    .from('box_members')
    .select('*, boxes(id, name, slug)')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const boxIds = ((memberships ?? []) as any[]).map((m: any) => m.box_id as string)
  const today = todayISO()

  // One WOD per box and day. With several boxes: ?box= picks one, else the one I logged, else the first.
  const { box: boxParam, time: timeParam, rounds: roundsParam } = await searchParams
  const { data: dailyWods } = boxIds.length > 0
    ? await supabase
        .from('daily_wods')
        .select('*, boxes(name)')
        .in('box_id', boxIds)
        .eq('scheduled_for', today)
        .eq('is_live', true)
        .order('published_at', { ascending: false })
        .limit(20)
    : { data: [] as any[] }
  const todays = ((dailyWods ?? []) as any[])
  const wanted = boxParam ? todays.filter(w => w.box_id === boxParam) : todays
  const { data: myToday } = wanted.length > 1
    ? await supabase.from('wod_results').select('daily_wod_id').eq('user_id', user.id).in('daily_wod_id', wanted.map(w => w.id))
    : { data: [] as any[] }
  const logged = new Set(((myToday ?? []) as any[]).map(r => r.daily_wod_id as string))
  const wod = wanted.find(w => logged.has(w.id)) ?? wanted[0] ?? todays[0] ?? null

  // The timer links here with the finished time or rounds, to prefill the result.
  const prefill = {
    time: timeParam && /^\d{1,3}:[0-5]\d$/.test(timeParam) ? timeParam : undefined,
    rounds: roundsParam && /^\d{1,4}$/.test(roundsParam) ? roundsParam : undefined,
  }

  let results: any[] = []
  if (wod) {
    const { data } = await supabase
      .from('wod_results')
      .select('*, profiles(full_name, avatar_url)')
      .eq('daily_wod_id', wod.id)
    results = (data ?? []) as any[]
  }

  const myResult = results.find((r: any) => r.user_id === user.id) ?? null

  // "Fuego" reactions. null = table not created yet (migration 005), so the UI hides them.
  let bumps: { result_id: string; user_id: string }[] | null = []
  if (results.length > 0) {
    const { data, error } = await supabase
      .from('wod_result_bumps')
      .select('result_id, user_id')
      .in('result_id', results.map((r: any) => r.id))
    bumps = error ? null : ((data ?? []) as any[])
  }

  // Current 1RMs, so the WOD can show "your numbers" for today's lifts.
  const { data: rawMaxes } = wod
    ? await supabase
        .from('pr_records')
        .select('value_lb, movements(name)')
        .eq('user_id', user.id)
        .eq('metric', '1rm')
        .eq('is_pr', true)
    : { data: [] as any[] }
  const maxes = ((rawMaxes ?? []) as any[])
    .filter(r => r.movements?.name)
    .map(r => ({ name: r.movements.name as string, valueLb: Number(r.value_lb) }))

  // How-to for each of today's movements (tap a movement in the WOD).
  const names = ((wod?.movements ?? []) as any[]).map(m => String(m.name ?? '')).filter(Boolean)
  const { data: library } = names.length ? await supabase.from('movements').select('*').in('name', names) : { data: [] as any[] }

  return (
    <WodView
      library={(library ?? []) as any[]}
      key={wod?.id ?? 'none'}
      profile={profile}
      prefill={prefill}
      wod={wod}
      results={results}
      myResult={myResult}
      maxes={maxes}
      bumps={bumps}
      memberships={(memberships ?? []) as any[]}
    />
  )
}
