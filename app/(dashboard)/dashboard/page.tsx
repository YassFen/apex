import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardDispatcher } from '@/components/layout/DashboardDispatcher'
import type { Profile, Box, Movement } from '@/lib/types/database'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  // Fetch coach box + stats
  let coachBox: Box | null = null
  let athleteCount = 0
  let todayWodTitle: string | null = null

  if (profile.role === 'coach' || profile.role === 'admin') {
    const { data: b } = await supabase
      .from('boxes').select('*').eq('owner_id', user.id).maybeSingle()
    coachBox = b as Box | null

    if (coachBox) {
      // Count active athletes
      const { count } = await supabase
        .from('box_members')
        .select('*', { count: 'exact', head: true })
        .eq('box_id', coachBox.id)
        .eq('is_active', true)
      athleteCount = count ?? 0

      // Today's WOD
      const today = new Date().toISOString().split('T')[0]
      const { data: wod } = await supabase
        .from('daily_wods')
        .select('title, type')
        .eq('box_id', coachBox.id)
        .eq('scheduled_for', today)
        .maybeSingle()
      todayWodTitle = wod?.title ?? null
    }
  }

  // Fetch athlete PRs (for athlete mode — even coaches have their own PRs)
  const { data: rawPrs } = await supabase
    .from('pr_records')
    .select('*, movements(name, category)')
    .eq('user_id', user.id)
    .order('recorded_at', { ascending: false })
    .limit(50)

  // All movements — used by AthleteDashboard for KPI customization picker
  // so the user can choose any movement, not just ones they've already PR'd.
  const { data: rawMovs } = await supabase
    .from('movements')
    .select('*')
    .order('category')
    .order('name')
  const allMovements = (rawMovs ?? []) as Movement[]

  return (
    <DashboardDispatcher
      profile={profile}
      coachBox={coachBox}
      prs={(rawPrs ?? []) as any[]}
      movements={allMovements}
      athleteCount={athleteCount}
      todayWodTitle={todayWodTitle}
    />
  )
}
