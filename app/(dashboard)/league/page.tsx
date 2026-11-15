import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { ACTIVE_BOX_COOKIE } from '@/lib/constants/cookies'
import { todayISO } from '@/lib/utils/dates'
import { LeagueView } from '@/components/league/LeagueView'
import type { Progress, RankRow } from '@/lib/utils/progress'

export default async function LeaguePage() {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const [profile, { data: prog, error }, { data: owned }, { data: members }] = await Promise.all([
    getProfile(user.id),
    supabase.rpc('my_progress'),
    supabase.from('boxes').select('id, name').eq('owner_id', user.id),
    supabase.from('box_members').select('boxes(id, name)').eq('user_id', user.id).eq('is_active', true),
  ])
  if (!profile) redirect('/auth/login')

  const boxMap = new Map<string, { id: string; name: string }>()
  for (const b of (owned ?? []) as any[]) boxMap.set(b.id, { id: b.id, name: b.name })
  for (const m of (members ?? []) as any[]) if (m.boxes?.id) boxMap.set(m.boxes.id, { id: m.boxes.id, name: m.boxes.name })
  const boxes = [...boxMap.values()]
  const picked = (await cookies()).get(ACTIVE_BOX_COOKIE)?.value
  const box = boxes.find(b => b.id === picked) ?? boxes[0] ?? null

  const progress = (error || !prog ? null : prog) as Progress | null
  let ranking: RankRow[] = []
  if (progress) {
    const { data } = box
      ? await supabase.rpc('xp_ranking', { p_scope: 'box', p_id: box.id, p_period: 'week' })
      : await supabase.rpc('xp_ranking', { p_scope: 'global', p_id: null, p_period: 'week' })
    ranking = (Array.isArray(data) ? data : []) as RankRow[]
  }

  return <LeagueView profile={profile} progress={progress} box={box} ranking={ranking} today={todayISO()} />
}
