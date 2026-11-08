import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { todayISO } from '@/lib/utils/dates'
import { CompetitionsView, type CompEntry } from '@/components/calendar/CompetitionsView'
import type { Profile } from '@/lib/types/database'

export default async function CompetitionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  // Events I went to, with my final standing (007) and my result in each workout.
  const first = await supabase.from('event_participants')
    .select('final_place, field_size, division, events(id, name, kind, starts_on, location, event_workouts(id, title, position))')
    .eq('user_id', user.id)
  let parts = first.data as any[] | null
  if (first.error) {
    const { data } = await supabase.from('event_participants')
      .select('division, events(id, name, kind, starts_on, location, event_workouts(id, title, position))')
      .eq('user_id', user.id)
    parts = data as any[] | null
  }
  const { data: res, error: resErr } = await supabase.from('event_results')
    .select('workout_id, result_value, place').eq('user_id', user.id)
  const byWorkout = new Map(((resErr ? [] : res ?? []) as any[]).map(r => [r.workout_id, r]))

  const entries: CompEntry[] = ((parts ?? []) as any[])
    .filter(x => x.events)
    .map(x => ({
      id: x.events.id, name: x.events.name, kind: x.events.kind, date: x.events.starts_on, location: x.events.location,
      division: x.division, place: x.final_place ?? null, field: x.field_size ?? null,
      workouts: ((x.events.event_workouts ?? []) as any[]).sort((a, b) => a.position - b.position).map(w => ({
        title: w.title as string, value: byWorkout.get(w.id)?.result_value ?? null, place: byWorkout.get(w.id)?.place ?? null,
      })),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  return <CompetitionsView profile={profile} entries={entries} today={todayISO()} missingResults={!!resErr} />
}
