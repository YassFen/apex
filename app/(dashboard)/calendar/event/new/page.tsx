import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { coachBoxesFor } from '@/lib/utils/coach-boxes'
import { EventForm } from '@/components/calendar/EventForm'
import type { Profile } from '@/lib/types/database'

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  const { date } = await searchParams
  const startsOn = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : addDaysISO(todayISO(), 30)
  const [coachBoxes, { data: movs }] = await Promise.all([
    coachBoxesFor(supabase, user.id),
    supabase.from('movements').select('name').order('name'),
  ])

  return (
    <EventForm
      profile={profile}
      coachBoxes={coachBoxes}
      movementNames={((movs ?? []) as any[]).map(m => m.name as string)}
      initial={{ boxId: null, name: '', kind: 'competencia', startsOn, endsOn: startsOn, location: '', url: '', notes: '', workouts: [] }}
    />
  )
}
