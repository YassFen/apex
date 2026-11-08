import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { todayISO } from '@/lib/utils/dates'
import { redirect } from 'next/navigation'
import { WodView } from '@/components/wod/WodView'
import type { Profile } from '@/lib/types/database'

export default async function WodPage({ searchParams }: { searchParams: Promise<{ box?: string; wod?: string }> }) {
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

  const { data: dailyWods } = boxIds.length > 0
    ? await supabase
        .from('daily_wods')
        .select('*, boxes(name)')
        .in('box_id', boxIds)
        .eq('scheduled_for', today)
        .eq('is_live', true)
        .order('published_at', { ascending: false })
    : { data: [] as any[] }

  // Several WODs today (several boxes, or one per class time): ?wod= picks one.
  // By default show the next class still to come, else the last one.
  const { box: boxParam, wod: wodParam } = await searchParams
  const todays = ((dailyWods ?? []) as any[])
    .sort((x, y) => String(x.class_time ?? '').localeCompare(String(y.class_time ?? '')))
  const nowHm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' }).format(new Date())
  const upcoming = todays.find(w => !w.class_time || String(w.class_time).slice(0, 5) >= nowHm)
  const wod = todays.find(w => w.id === wodParam) ?? todays.find(w => w.box_id === boxParam)
    ?? upcoming ?? todays[todays.length - 1] ?? null
  const multiBox = new Set(todays.map(w => w.box_id)).size > 1
  const todayWods = todays.map(w => ({
    id: w.id as string,
    label: [multiBox ? (w.boxes?.name as string) ?? 'Box' : null, w.class_time ? String(w.class_time).slice(0, 5) : null]
      .filter(Boolean).join(' · ') || (w.title as string),
  }))

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
      todayWods={todayWods}
      wod={wod}
      results={results}
      myResult={myResult}
      maxes={maxes}
      bumps={bumps}
      memberships={(memberships ?? []) as any[]}
    />
  )
}
