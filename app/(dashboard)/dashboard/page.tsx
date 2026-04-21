import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardDispatcher } from '@/components/layout/DashboardDispatcher'
import type { Profile, Box } from '@/lib/types/database'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  // Fetch box (coach view)
  let coachBox: Box | null = null
  if (profile.role === 'coach') {
    const { data: b } = await supabase.from('boxes').select('*').eq('owner_id', user.id).maybeSingle()
    coachBox = b as Box | null
  }

  // Fetch athlete PRs (shown in athlete dashboard, even for coaches who flip to athlete mode)
  const { data: rawPrs } = await supabase
    .from('pr_records')
    .select('*, movements(name, category)')
    .eq('user_id', user.id)
    .order('recorded_at', { ascending: false })
    .limit(50)

  return (
    <DashboardDispatcher
      profile={profile}
      coachBox={coachBox}
      prs={(rawPrs ?? []) as any[]}
    />
  )
}
