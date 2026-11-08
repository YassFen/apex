import { createClient } from '@/lib/supabase/server'
import { todayISO } from '@/lib/utils/dates'
import { redirect } from 'next/navigation'
import { WodView } from '@/components/wod/WodView'
import type { Profile } from '@/lib/types/database'

export default async function WodPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
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

  const wod = ((dailyWods ?? []) as any[])[0] ?? null

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

  return (
    <WodView
      profile={profile}
      wod={wod}
      results={results}
      myResult={myResult}
      maxes={maxes}
      bumps={bumps}
      memberships={(memberships ?? []) as any[]}
    />
  )
}
