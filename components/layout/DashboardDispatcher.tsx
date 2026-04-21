'use client'
import { AthleteDashboard } from '@/components/athlete/AthleteDashboard'
import { CoachDashboard } from '@/components/coach/CoachDashboard'
import { useShell } from '@/lib/hooks/useShell'
import type { Profile, Box } from '@/lib/types/database'

export function DashboardDispatcher({ profile, coachBox, prs }: { profile: Profile; coachBox: Box | null; prs: any[] }) {
  const { viewMode } = useShell()
  if (viewMode === 'coach' && (profile.role === 'coach' || profile.role === 'admin')) {
    return <CoachDashboard profile={profile} box={coachBox} />
  }
  return <AthleteDashboard profile={profile} prs={prs} />
}
