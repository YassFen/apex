import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { notFound, redirect } from 'next/navigation'
import { coachBoxRows } from '@/lib/utils/coach-boxes'
import { CompetitionDetailView, type CompDetail } from '@/components/coach/CompetitionDetailView'
import type { Profile } from '@/lib/types/database'

// Real ids are UUIDs; the demo uses short readable ids. Either way only safe characters.
const UUID = /^[A-Za-z0-9-]{1,64}$/

export default async function CoachCompetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const profile = (await getProfile(user.id)) as Profile | null
  if (!profile) redirect('/dashboard')

  const [{ data: ev }, boxes] = await Promise.all([
    supabase.from('events').select('id, box_id, name, kind, starts_on, ends_on, location').eq('id', id).maybeSingle(),
    coachBoxRows(supabase, user.id),
  ])
  const e = ev as any
  if (!e || !e.box_id || !boxes.some(b => b.id === e.box_id)) notFound()

  const partCols = 'user_id, category, division, profiles(full_name, avatar_url)'
  const [workoutsRes, partsFirst, resultsRes] = await Promise.all([
    supabase.from('event_workouts').select('id, title, type, position').eq('event_id', id).order('position').limit(30),
    supabase.from('event_participants').select(`${partCols}, final_place, field_size`).eq('event_id', id).limit(500),
    supabase.from('event_results').select('workout_id, user_id, result_value, place').eq('event_id', id).range(0, 4999),
  ])
  // Final places need the 007 columns; without them show the rest.
  let parts = partsFirst.data as any[] | null
  if (partsFirst.error) parts = (await supabase.from('event_participants').select(partCols).eq('event_id', id).limit(500)).data as any[] | null

  const detail: CompDetail = {
    id: e.id, boxId: e.box_id, name: e.name, kind: e.kind, startsOn: e.starts_on, endsOn: e.ends_on ?? e.starts_on, location: e.location ?? null,
    workouts: ((workoutsRes.data ?? []) as any[]).map(w => ({ id: w.id, title: w.title, type: w.type })),
    athletes: (parts ?? []).map(p => ({
      id: p.user_id, name: p.profiles?.full_name ?? 'Atleta', avatar: p.profiles?.avatar_url ?? null,
      category: p.category, division: p.division, finalPlace: p.final_place ?? null, fieldSize: p.field_size ?? null,
    })),
    results: ((resultsRes.error ? [] : resultsRes.data ?? []) as any[]).map(r => ({
      workoutId: r.workout_id, userId: r.user_id, value: r.result_value, place: r.place ?? null,
    })),
  }
  return <CompetitionDetailView profile={profile} event={detail} />
}
