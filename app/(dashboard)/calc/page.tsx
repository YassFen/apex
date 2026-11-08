import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { redirect } from 'next/navigation'
import { RMCalcView, type CalcPr } from '@/components/athlete/RMCalcView'
import type { Profile } from '@/lib/types/database'

export default async function CalcPage() {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const p = await getProfile(user.id)
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')
  const { data: rawPrs } = await supabase
    .from('pr_records')
    .select('id, metric, value_lb, recorded_at, movements(name, category)')
    .eq('user_id', user.id)
    .eq('is_pr', true)
    .in('metric', ['1rm', '2rm', '3rm'])

  const prs: CalcPr[] = ((rawPrs ?? []) as any[])
    .filter(r => r.movements?.name && Number(r.value_lb) > 0)
    .map(r => ({
      id: r.id,
      movement: r.movements.name as string,
      category: (r.movements.category ?? 'weightlifting') as string,
      reps: Number(String(r.metric).replace('rm', '')) || 1,
      valueLb: Number(r.value_lb),
      recordedAt: r.recorded_at as string,
    }))
    .sort((a, b) => a.movement.localeCompare(b.movement, 'es') || a.reps - b.reps)

  return <RMCalcView profile={profile} prs={prs} />
}
