import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { coachBoxesFor } from '@/lib/utils/coach-boxes'
import { EventForm } from '@/components/calendar/EventForm'
import type { Profile } from '@/lib/types/database'

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  const { data: e } = await supabase.from('events').select('*, event_workouts(*)').eq('id', id).maybeSingle()
  if (!e) notFound()
  const ev = e as any

  const [coachBoxes, { data: movs }] = await Promise.all([
    coachBoxesFor(supabase, user.id),
    supabase.from('movements').select('name').order('name'),
  ])
  const canEdit = ev.created_by === user.id || coachBoxes.some(b => b.id === ev.box_id)
  if (!canEdit) redirect(`/calendar/event/${id}`)

  return (
    <EventForm
      profile={profile}
      coachBoxes={coachBoxes}
      movementNames={((movs ?? []) as any[]).map(m => m.name as string)}
      initial={{
        id: ev.id, boxId: ev.box_id, name: ev.name, kind: ev.kind, startsOn: ev.starts_on, endsOn: ev.ends_on ?? ev.starts_on,
        location: ev.location ?? '', url: ev.url ?? '', notes: ev.notes ?? '',
        workouts: ((ev.event_workouts ?? []) as any[]).sort((a, b) => a.position - b.position).map(w => ({
          id: w.id, position: w.position, title: w.title, type: w.type, time_cap_mins: w.time_cap_mins,
          description: w.description ?? '', movements: Array.isArray(w.movements) ? w.movements : [],
        })),
      }}
    />
  )
}
