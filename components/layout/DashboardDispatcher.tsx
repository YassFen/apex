'use client'
import { AthleteDashboard } from '@/components/athlete/AthleteDashboard'
import { CoachDashboard } from '@/components/coach/CoachDashboard'
import { useShell } from '@/lib/hooks/useShell'
import type { Profile, Box, Movement } from '@/lib/types/database'

interface Props {
  profile: Profile
  coachBox: Box | null
  prs: any[]
  movements?: Movement[]
  athleteCount?: number
  todayWodTitle?: string | null
}

export function DashboardDispatcher({ profile, coachBox, prs, movements = [], athleteCount = 0, todayWodTitle = null }: Props) {
  const { viewMode } = useShell()
  if (viewMode === 'coach' && (profile.role === 'coach' || profile.role === 'admin')) {
    return <CoachDashboard profile={profile} box={coachBox} athleteCount={athleteCount} todayWodTitle={todayWodTitle} />
  }
  return <AthleteDashboard profile={profile} prs={prs} movements={movements} />
}
