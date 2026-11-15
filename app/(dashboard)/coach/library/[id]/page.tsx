import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { notFound, redirect } from 'next/navigation'
import { coachBoxRows } from '@/lib/utils/coach-boxes'
import { rankResults } from '@/lib/utils/wod-ranking'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { WodLibraryDetail } from '@/components/coach/WodLibraryDetail'
import type { Profile } from '@/lib/types/database'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function WodLibraryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const profile = (await getProfile(user.id)) as Profile | null
  if (!profile) redirect('/dashboard')

  const [{ data: wod }, boxes] = await Promise.all([
    supabase.from('daily_wods').select('*').eq('id', id).maybeSingle(),
    coachBoxRows(supabase, user.id),
  ])
  const w = wod as any
  if (!w || !boxes.some(b => b.id === w.box_id)) notFound()

  const { data: res } = await supabase.from('wod_results')
    .select('*, profiles(full_name, avatar_url)').eq('daily_wod_id', id).limit(300)
  const ranked = rankResults((res ?? []) as any[], w.type)

  const today = todayISO()
  return (
    <WodLibraryDetail
      profile={profile} wod={w} results={ranked}
      minDate={addDaysISO(today, -1)} maxDate={addDaysISO(today, 13)} today={today}
    />
  )
}
