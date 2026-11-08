'use client'
import { AthleteDashboard } from '@/components/athlete/AthleteDashboard'
import { CoachDashboard } from '@/components/coach/CoachDashboard'
import { useShell } from '@/lib/hooks/useShell'
import type { Profile, Box, Movement } from '@/lib/types/database'
import type { NextEvent } from '@/components/calendar/NextEventCard'
import type { TodayWod, GoalProgress } from '@/components/athlete/AthleteDashboard'
import type { Hit } from '@/lib/utils/movement-guide'
import type { CoachActivity } from '@/components/coach/CoachDashboard'
import type { ChallengeSummary } from '@/lib/utils/challenges'

interface Props {
  profile: Profile
  coachBox: Box | null
  prs: any[]
  movements?: Movement[]
  athleteCount?: number
  todayWod?: { id: string; title: string; type: string } | null
  todayResults?: number
  recentMembers?: { id: string; name: string; avatar: string | null; joinedAt: string }[]
  athleteToday?: TodayWod | null
  hasBox?: boolean
  resultDates?: string[]
  nextEvent?: NextEvent | null
  hits?: Hit[]
  goals?: GoalProgress[]
  logDates?: string[]
  goalsMissing?: boolean
  coachActivity?: CoachActivity
  challenges?: ChallengeSummary[] | null
}

export function DashboardDispatcher({ profile, coachBox, prs, movements = [], athleteCount = 0, todayWod = null, todayResults = 0, recentMembers = [], athleteToday = null, hasBox = false, resultDates = [], nextEvent = null, hits = [], goals = [], logDates = [], goalsMissing = false, coachActivity, challenges = null }: Props) {
  const { viewMode } = useShell()
  if (viewMode === 'coach' && (profile.role === 'coach' || profile.role === 'admin')) {
    return <CoachDashboard profile={profile} box={coachBox} athleteCount={athleteCount} todayWod={todayWod} todayResults={todayResults} recentMembers={recentMembers} nextEvent={nextEvent} activity={coachActivity} challenges={challenges} />
  }
  return <AthleteDashboard profile={profile} prs={prs} movements={movements} today={athleteToday} hasBox={hasBox} resultDates={resultDates} nextEvent={nextEvent} hits={hits} goals={goals} logDates={logDates} goalsMissing={goalsMissing} challenges={challenges} />
}
