import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { redirect } from 'next/navigation'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { isMissingTable } from '@/lib/utils/errors'
import { CalendarView, type CalWod, type CalEvent, type CalBox } from '@/components/calendar/CalendarView'
import type { Profile } from '@/lib/types/database'

/** Month window loaded around the visible month, so browsing nearby months needs no round trip. */
function windowFor(month: string) {
  const [y, m] = month.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10)  // previous month
  const to = new Date(Date.UTC(y, m + 2, 0)).toISOString().slice(0, 10)    // end of month +2
  return { from, to }
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const p = await getProfile(user.id)
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  const today = todayISO()
  const { m } = await searchParams
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : today.slice(0, 7)
  const { from, to } = windowFor(month)

  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase.from('boxes').select('id, name, logo_url').eq('owner_id', user.id),
    supabase.from('box_members').select('role, boxes(id, name, logo_url)').eq('user_id', user.id).eq('is_active', true),
  ])
  const boxMap = new Map<string, CalBox>()
  for (const b of (owned ?? []) as any[]) boxMap.set(b.id, { id: b.id, name: b.name, logo: b.logo_url, isCoach: true })
  for (const mm of (memberships ?? []) as any[]) {
    const b = mm.boxes
    if (!b?.id) continue
    const isCoach = boxMap.get(b.id)?.isCoach || mm.role === 'coach' || mm.role === 'admin'
    boxMap.set(b.id, { id: b.id, name: b.name, logo: b.logo_url, isCoach })
  }
  const boxes = [...boxMap.values()]
  const boxIds = boxes.map(b => b.id)

  const [wodsRes, daysRes, eventsRes] = await Promise.all([
    boxIds.length
      ? supabase.from('daily_wods')
          .select('id, box_id, scheduled_for, title, type, description, duration_mins, movements, is_live, show_early, class_time')
          .in('box_id', boxIds).gte('scheduled_for', from).lte('scheduled_for', to)
      : Promise.resolve({ data: [] as any[], error: null }),
    boxIds.length
      ? supabase.rpc('box_wod_days', { p_from: from, p_to: to })
      : Promise.resolve({ data: [] as any[], error: null }),
    supabase.from('events')
      .select('id, box_id, created_by, name, kind, starts_on, ends_on, location, event_workouts(id), event_participants(user_id)')
      .gte('starts_on', addDaysISO(from, -14))
      .order('starts_on'),
  ])

  // Before migrations 006/007 show_early/class_time don't exist: retry without them.
  let rawWods = (wodsRes.data ?? []) as any[]
  if (wodsRes.error && boxIds.length) {
    const { data } = await supabase.from('daily_wods')
      .select('id, box_id, scheduled_for, title, type, description, duration_mins, movements, is_live')
      .in('box_id', boxIds).gte('scheduled_for', from).lte('scheduled_for', to)
    rawWods = (data ?? []) as any[]
  }

  const wodIds = rawWods.map(w => w.id as string)
  const { data: myResults } = wodIds.length
    ? await supabase.from('wod_results').select('daily_wod_id, result_value').eq('user_id', user.id).in('daily_wod_id', wodIds)
    : { data: [] as any[] }
  const done = new Map(((myResults ?? []) as any[]).map(r => [r.daily_wod_id as string, r.result_value as string]))

  const wods: CalWod[] = rawWods.map(w => ({
    id: w.id, boxId: w.box_id, date: w.scheduled_for, title: w.title, type: w.type,
    description: w.description ?? '', duration: w.duration_mins ?? null,
    movements: Array.isArray(w.movements) ? w.movements : [],
    isLive: !!w.is_live, showEarly: !!w.show_early, classTime: w.class_time ? String(w.class_time).slice(0, 5) : null,
    myResult: done.get(w.id) ?? null,
  }))

  // Days with a WOD the athlete can't see yet (coach reveals it that day).
  const visible = new Set(wods.map(w => `${w.boxId}|${w.date}`))
  const hiddenDays = ((daysRes.error ? [] : daysRes.data ?? []) as any[])
    .filter(d => !visible.has(`${d.box_id}|${d.scheduled_for}`))
    .map(d => ({ boxId: d.box_id as string, date: d.scheduled_for as string }))

  const eventsMissing = isMissingTable(eventsRes.error)
  const events: CalEvent[] = ((eventsRes.error ? [] : eventsRes.data ?? []) as any[]).map(e => ({
    id: e.id, boxId: e.box_id, name: e.name, kind: e.kind,
    startsOn: e.starts_on, endsOn: e.ends_on ?? e.starts_on, location: e.location,
    workouts: (e.event_workouts ?? []).length,
    going: (e.event_participants ?? []).some((x: any) => x.user_id === user.id),
    participants: (e.event_participants ?? []).length,
    mine: e.created_by === user.id,
  }))

  return (
    <CalendarView
      key={month}
      profile={profile}
      today={today}
      month={month}
      range={{ from, to }}
      boxes={boxes}
      wods={wods}
      hiddenDays={hiddenDays}
      events={events}
      eventsMissing={eventsMissing}
    />
  )
}
