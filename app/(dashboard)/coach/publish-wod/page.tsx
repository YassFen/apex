import { createClient } from '@/lib/supabase/server'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { redirect } from 'next/navigation'
import { PublishWodPanel, type ScheduledDay } from '@/components/coach/PublishWodPanel'
import type { Profile, Box, Movement } from '@/lib/types/database'

const AHEAD_DAYS = 13

export default async function PublishWodPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile || profile.role !== 'coach') redirect('/dashboard')

  const { data: b } = await supabase.from('boxes').select('*').eq('owner_id', user.id).single()
  const box = b as Box | null
  if (!box) redirect('/dashboard')

  const today = todayISO()
  const { date: rawDate } = await searchParams
  // Programming is for today and the next two weeks; anything else falls back to today.
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate >= today && rawDate <= addDaysISO(today, AHEAD_DAYS)
    ? rawDate : today

  const [{ data: movs }, { data: dayWod }, { data: upcoming }] = await Promise.all([
    supabase.from('movements').select('*').order('category').order('name'),
    supabase.from('daily_wods').select('*').eq('box_id', box.id).eq('scheduled_for', date)
      .order('published_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('daily_wods').select('scheduled_for, title, is_live').eq('box_id', box.id)
      .gte('scheduled_for', today).lte('scheduled_for', addDaysISO(today, AHEAD_DAYS)),
  ])

  const scheduled: ScheduledDay[] = ((upcoming ?? []) as any[]).map(w => ({
    date: w.scheduled_for as string, title: w.title as string, isLive: !!w.is_live,
  }))

  return (
    <PublishWodPanel
      key={date}
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
