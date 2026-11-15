import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { redirect } from 'next/navigation'
import { pickCoachBox } from '@/lib/utils/coach-boxes'
import { todayISO } from '@/lib/utils/dates'
import { isMissingTable } from '@/lib/utils/errors'
import { CompetitionsLibraryView, type LibEvent } from '@/components/coach/CompetitionsLibraryView'
import type { Profile } from '@/lib/types/database'

const LIMIT = 60

export default async function CoachCompetitionsPage({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const profile = (await getProfile(user.id)) as Profile | null
  if (!profile) redirect('/dashboard')

  const { box: boxParam } = await searchParams
  const { box, boxes } = await pickCoachBox(supabase, user.id, boxParam)
  if (!box) redirect('/coach/create-box')

  const today = todayISO()
  const base = () => supabase.from('events')
    .select('id, name, kind, starts_on, ends_on, location, event_workouts(count), event_participants(count)')
    .eq('box_id', box.id)
  const [up, past] = await Promise.all([
    base().gte('starts_on', today).order('starts_on', { ascending: true }).limit(LIMIT),
    base().lt('starts_on', today).order('starts_on', { ascending: false }).limit(LIMIT),
  ])
  const missing = isMissingTable(up.error) || isMissingTable(past.error)
  const map = (rows: any[] | null): LibEvent[] => (rows ?? []).map(e => ({
    id: e.id, name: e.name, kind: e.kind, startsOn: e.starts_on, endsOn: e.ends_on ?? e.starts_on, location: e.location ?? null,
    workouts: Number(e.event_workouts?.[0]?.count ?? 0), participants: Number(e.event_participants?.[0]?.count ?? 0),
  }))

  return (
    <CompetitionsLibraryView
      profile={profile} boxes={boxes} boxId={box.id} missing={missing}
      upcoming={map(up.error ? [] : up.data as any[])} past={map(past.error ? [] : past.data as any[])}
    />
  )
}
