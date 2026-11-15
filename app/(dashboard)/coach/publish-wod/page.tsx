import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { redirect } from 'next/navigation'
import { PublishWodPanel, type ScheduledDay, type DaySession } from '@/components/coach/PublishWodPanel'
import type { Profile, Movement } from '@/lib/types/database'
import { pickCoachBox } from '@/lib/utils/coach-boxes'

const AHEAD_DAYS = 13

export default async function PublishWodPage({ searchParams }: { searchParams: Promise<{ date?: string; wod?: string; box?: string }> }) {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const p = await getProfile(user.id)
  const profile = p as Profile | null
  if (!profile) redirect('/dashboard')

  const { date: rawDate, wod: wodParam, box: boxParam } = await searchParams
  const { box } = await pickCoachBox(supabase, user.id, boxParam)
  if (!box) redirect('/coach/create-box')

  const today = todayISO()
  // Programming is for today and the next two weeks; anything else falls back to today.
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate >= today && rawDate <= addDaysISO(today, AHEAD_DAYS)
    ? rawDate : today

  const [{ data: movs }, { data: dayWods }, { data: upcoming }] = await Promise.all([
    supabase.from('movements').select('*').order('category').order('name'),
    supabase.from('daily_wods').select('*').eq('box_id', box.id).eq('scheduled_for', date)
      .order('published_at', { ascending: true }),
    supabase.from('daily_wods').select('scheduled_for, title, is_live').eq('box_id', box.id)
      .gte('scheduled_for', today).lte('scheduled_for', addDaysISO(today, AHEAD_DAYS)),
  ])

  // One WOD per class: ?wod=<id> edits that one, ?wod=new starts another class that day.
  const day = ((dayWods ?? []) as any[]).sort((a, b) => String(a.class_time ?? '').localeCompare(String(b.class_time ?? '')))
  const sessions: DaySession[] = day.map(w => ({ id: w.id, title: w.title, classTime: w.class_time ?? null, isLive: !!w.is_live }))
  const dayWod = wodParam === 'new' ? null : (day.find(w => w.id === wodParam) ?? day[0] ?? null)

  const scheduled: ScheduledDay[] = ((upcoming ?? []) as any[]).map(w => ({
    date: w.scheduled_for as string, title: w.title as string, isLive: !!w.is_live,
  }))

  return (
    <PublishWodPanel
      key={`${date}-${dayWod?.id ?? 'new'}`}
      sessions={sessions}
      profile={profile}
      box={box}
      movements={(movs ?? []) as Movement[]}
      todayWod={dayWod ?? null}
      date={date}
      today={today}
      scheduled={scheduled}
      aheadDays={AHEAD_DAYS}
    />
  )
}
