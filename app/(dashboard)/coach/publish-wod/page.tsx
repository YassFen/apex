import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { redirect } from 'next/navigation'
import { PublishWodPanel, type ScheduledDay } from '@/components/coach/PublishWodPanel'
import type { Profile, Movement } from '@/lib/types/database'
import { pickCoachBox } from '@/lib/utils/coach-boxes'

const AHEAD_DAYS = 13
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function PublishWodPage({ searchParams }: { searchParams: Promise<{ date?: string; box?: string; from?: string }> }) {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const p = await getProfile(user.id)
  const profile = p as Profile | null
  if (!profile) redirect('/dashboard')

  const { date: rawDate, box: boxParam, from: fromParam } = await searchParams
  const { box } = await pickCoachBox(supabase, user.id, boxParam)
  if (!box) redirect('/coach/create-box')

  const today = todayISO()
  const yesterday = addDaysISO(today, -1)
  // Yesterday (to fix it), today and the next two weeks; anything else falls back to today.
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate >= yesterday && rawDate <= addDaysISO(today, AHEAD_DAYS)
    ? rawDate : today

  const [{ data: movs }, { data: dayWod }, { data: upcoming }, { data: from }] = await Promise.all([
    supabase.from('movements').select('*').order('category').order('name'),
    supabase.from('daily_wods').select('*').eq('box_id', box.id).eq('scheduled_for', date)
      .order('published_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('daily_wods').select('scheduled_for, title, is_live').eq('box_id', box.id)
      .gte('scheduled_for', yesterday).lte('scheduled_for', addDaysISO(today, AHEAD_DAYS)).limit(40),
    // An older WOD of this box to start from (the library's "Usar de nuevo").
    fromParam && UUID.test(fromParam)
      ? supabase.from('daily_wods').select('*').eq('id', fromParam).eq('box_id', box.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const scheduled: ScheduledDay[] = ((upcoming ?? []) as any[]).map(w => ({
    date: w.scheduled_for as string, title: w.title as string, isLive: !!w.is_live,
  }))

  return (
    <PublishWodPanel
      key={`${box.id}-${date}-${(dayWod as any)?.id ?? 'new'}-${fromParam ?? ''}`}
      profile={profile}
      box={box}
      movements={(movs ?? []) as Movement[]}
      todayWod={dayWod ?? null}
      source={from ?? null}
      date={date}
      today={today}
      scheduled={scheduled}
      aheadDays={AHEAD_DAYS}
    />
  )
}
