import { createClient } from '@/lib/supabase/server'
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
  const today = new Date().toISOString().split('T')[0]

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
      .order('result_value', { ascending: true })
    results = (data ?? []) as any[]
  }

  const myResult = results.find((r: any) => r.user_id === user.id) ?? null

  return (
    <WodView
      profile={profile}
      wod={wod}
      results={results}
      myResult={myResult}
      memberships={(memberships ?? []) as any[]}
    />
  )
}
