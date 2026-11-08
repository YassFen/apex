import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { notFound, redirect } from 'next/navigation'
import { todayISO } from '@/lib/utils/dates'
import { EventView, type EventDetail } from '@/components/calendar/EventView'
import type { EventWorkout, PrLite, BenchmarkLite } from '@/lib/utils/readiness'
import type { Profile } from '@/lib/types/database'

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const p = await getProfile(user.id)
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  const { data: e } = await supabase
    .from('events')
    .select('*, boxes(id, name, owner_id), event_workouts(*), event_participants(user_id, category, division, profiles(full_name, avatar_url))')
    .eq('id', id)
    .maybeSingle()
  if (!e) notFound()
  const ev = e as any

  const [{ data: rawPrs }, { data: rawBench }, { data: membership }] = await Promise.all([
    supabase.from('pr_records').select('metric, value_lb, movements(name)').eq('user_id', user.id).eq('is_pr', true),
    supabase.from('benchmarks').select('name, result, recorded_at').eq('user_id', user.id).order('recorded_at', { ascending: false }),
    ev.box_id
      ? supabase.from('box_members').select('role').eq('box_id', ev.box_id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const prs: PrLite[] = ((rawPrs ?? []) as any[])
    .filter(r => r.movements?.name)
    .map(r => ({ movement: r.movements.name, metric: r.metric, valueLb: Number(r.value_lb) }))
  const seen = new Set<string>()
  const benchmarks: BenchmarkLite[] = ((rawBench ?? []) as any[]).filter(b => {
    const k = String(b.name).toLowerCase()
    if (seen.has(k)) return false
    seen.add(k); return true
  }).map(b => ({ name: b.name, result: b.result }))

  // Migration 007: per-workout results and final standings (null when the table is missing).
  const [resRes, finalRes] = await Promise.all([
    supabase.from('event_results').select('workout_id, user_id, result_value, place, profiles(full_name)').eq('event_id', id),
    supabase.from('event_participants').select('user_id, final_place, field_size').eq('event_id', id),
  ])
  const results = resRes.error ? null : ((resRes.data ?? []) as any[]).map(r => ({
    workoutId: r.workout_id as string, userId: r.user_id as string, name: (r.profiles?.full_name as string) ?? 'Atleta',
    value: r.result_value as string, place: (r.place as number) ?? null,
  }))
  const finals = new Map(((finalRes.error ? [] : finalRes.data ?? []) as any[]).map(f => [f.user_id, f]))

  const role = (membership as any)?.role
  const canEdit = ev.created_by === user.id || ev.boxes?.owner_id === user.id || role === 'coach' || role === 'admin'

  const workouts: EventWorkout[] = ((ev.event_workouts ?? []) as any[])
    .sort((a, b) => a.position - b.position)
    .map(w => ({
      id: w.id, position: w.position, title: w.title, type: w.type, time_cap_mins: w.time_cap_mins,
      description: w.description ?? '', movements: Array.isArray(w.movements) ? w.movements : [],
    }))

  const participants = ((ev.event_participants ?? []) as any[]).map(x => ({
    userId: x.user_id as string, category: x.category as 'm' | 'f', division: x.division as string,
    name: (x.profiles?.full_name as string) ?? 'Atleta', avatar: (x.profiles?.avatar_url as string) ?? null,
    finalPlace: finals.get(x.user_id)?.final_place ?? null, fieldSize: finals.get(x.user_id)?.field_size ?? null,
  }))

  const event: EventDetail = {
    id: ev.id, boxId: ev.box_id, boxName: ev.boxes?.name ?? null, name: ev.name, kind: ev.kind,
    startsOn: ev.starts_on, endsOn: ev.ends_on ?? ev.starts_on, location: ev.location, url: ev.url, notes: ev.notes,
    workouts, participants, results,
  }

  return <EventView profile={profile} event={event} today={todayISO()} prs={prs} benchmarks={benchmarks} canEdit={canEdit} />
}
