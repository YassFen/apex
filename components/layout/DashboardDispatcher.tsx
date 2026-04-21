'use client'
import { AthleteDashboard } from '@/components/athlete/AthleteDashboard'
import { CoachDashboard } from '@/components/coach/CoachDashboard'
import { useShell } from '@/lib/hooks/useShell'
import type { Profile, Box } from '@/lib/types/database'

interface Props {
  profile: Profile
  coachBox: Box | null
  prs: any[]
  athleteCount?: number
  todayWodTitle?: string | null
}

export function DashboardDispatcher({ profile, coachBox, prs, athleteCount = 0, todayWodTitle = null }: Props) {
  const { viewMode } = useShell()
  if (viewMode === 'coach' && (profile.role === 'coach' || profile.role === 'admin')) {
    return <CoachDashboard profile={profile} box={coachBox} athleteCount={athleteCount} todayWodTitle={todayWodTitle} />
  }
  return <AthleteDashboard profile={profile} prs={prs} />
}
