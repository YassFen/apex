import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { redirect } from 'next/navigation'
import { PublishWodPanel, type ScheduledDay, type DaySession } from '@/components/coach/PublishWodPanel'
import type { Profile, Box, Movement } from '@/lib/types/database'

const AHEAD_DAYS = 13

export default async function PublishWodPage({ searchParams }: { searchParams: Promise<{ date?: string; wod?: string }> }) {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const p = await getProfile(user.id)
  const profile = p as Profile | null
  if (!profile || profile.role !== 'coach') redirect('/dashboard')

  const { data: b } = await supabase.from('boxes').select('*').eq('owner_id', user.id).single()
  const box = b as Box | null
  if (!box) redirect('/dashboard')

  const today = todayISO()
  const { date: rawDate, wod: wodParam } = await searchParams
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
