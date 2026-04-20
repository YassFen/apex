import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AthleteDashboard } from '@/components/athlete/AthleteDashboard'
import { CoachDashboard } from '@/components/coach/CoachDashboard'
import type { Profile, Box } from '@/lib/types/database'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  if (profile.role === 'coach') {
    const { data: b } = await supabase.from('boxes').select('*').eq('owner_id', user.id).single()
    return <CoachDashboard profile={profile} box={b as Box | null} />
  }

  const { data: rawPrs } = await supabase
    .from('pr_records')
    .select('*, movements(name, category)')
    .eq('user_id', user.id)
    .eq('is_pr', true)
    .order('recorded_at', { ascending: false })
    .limit(20)

  return <AthleteDashboard profile={profile} prs={(rawPrs ?? []) as any[]} />
}
