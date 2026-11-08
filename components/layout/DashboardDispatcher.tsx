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
  todayWod?: { id: string; title: string; type: string } | null
  todayResults?: number
  recentMembers?: { id: string; name: string; avatar: string | null; joinedAt: string }[]
  athleteToday?: { title: string; type: string; durationMins: number | null; myResult: string | null } | null
  hasBox?: boolean
  resultDates?: string[]
}

export function DashboardDispatcher({ profile, coachBox, prs, movements = [], athleteCount = 0, todayWod = null, todayResults = 0, recentMembers = [], athleteToday = null, hasBox = false, resultDates = [] }: Props) {
  const { viewMode } = useShell()
  if (viewMode === 'coach' && (profile.role === 'coach' || profile.role === 'admin')) {
    return <CoachDashboard profile={profile} box={coachBox} athleteCount={athleteCount} todayWod={todayWod} todayResults={todayResults} recentMembers={recentMembers} />
  }
  return <AthleteDashboard profile={profile} prs={prs} movements={movements} today={athleteToday} hasBox={hasBox} resultDates={resultDates} />
}
