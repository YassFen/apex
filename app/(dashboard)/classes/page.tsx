import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { ClassesView } from '@/components/classes/ClassesView'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { isMissingTable } from '@/lib/utils/errors'
import { selectAll } from '@/lib/utils/admin-box'
import { currentMembership, upcomingMembership } from '@/lib/utils/membership'
import type { Box, ClassBooking, ClassOverride, ClassSlot, CoachIssue, Membership } from '@/lib/types/database'

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const profile = await getProfile(user.id)
  if (!profile) redirect('/auth/login')

  const [{ data: owned }, { data: mine }] = await Promise.all([
    supabase.from('boxes').select('*').eq('owner_id', user.id),
    supabase.from('box_members').select('role, boxes(*)').eq('user_id', user.id).eq('is_active', true),
  ])
  const map = new Map<string, { box: Box; staff: boolean }>()
  for (const m of (mine ?? []) as any[]) if (m.boxes?.id) map.set(m.boxes.id, { box: m.boxes as Box, staff: m.role !== 'athlete' })
  for (const b of (owned ?? []) as any[]) if (b?.id) map.set(b.id, { box: b as Box, staff: true })
  const all = [...map.values()]
  const picked = all.find(x => x.box.id === sp.box) ?? all[0] ?? null
  const today = todayISO()
  const to = addDaysISO(today, 6)

  if (!picked) {
    return <ClassesView profile={profile} me={user.id} boxes={[]} box={null} staff={false} today={today} slots={[]} overrides={[]} bookings={[]} people={[]} membership={null} upcoming={null} issues={[]} missing={false} />
  }
  const boxId = picked.box.id
  // Staff also see yesterday, to mark attendance that was left pending.
  const from = picked.staff ? addDaysISO(today, -1) : today
  const [slotsRes, ovRes, bkRes, rosterRes, msRes, isRes] = await Promise.all([
    // Switched-off slots too: a class given earlier today keeps its list (buildSessions decides).
    supabase.from('class_slots').select('*').eq('box_id', boxId).order('start_time'),
    supabase.from('class_overrides').select('*').eq('box_id', boxId).gte('class_date', from).lte('class_date', to),
    selectAll(() => supabase.from('class_bookings').select('id, slot_id, class_date, user_id, status, created_at').eq('box_id', boxId).gte('class_date', from).lte('class_date', to).order('id')),
    selectAll(() => supabase.from('box_members').select('user_id, role, profiles(full_name, avatar_url)').eq('box_id', boxId).eq('is_active', true).order('user_id')),
    supabase.from('memberships').select('*').eq('box_id', boxId).eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('coach_issues').select('*').eq('box_id', boxId).eq('coach_id', user.id).gte('class_date', from),
  ])
  const memberships = (msRes.data ?? []) as Membership[]

  return (
    <ClassesView
      profile={profile} me={user.id} boxes={all.map(x => x.box)} box={picked.box} staff={picked.staff} today={today}
      slots={(slotsRes.data ?? []) as ClassSlot[]}
      overrides={(ovRes.data ?? []) as ClassOverride[]}
      bookings={bkRes.data as ClassBooking[]}
      people={(rosterRes.data as any[]).map(m => ({ id: m.user_id, name: m.profiles?.full_name ?? 'Persona', avatar: m.profiles?.avatar_url ?? null, role: m.role }))}
      membership={currentMembership(memberships, today)}
      upcoming={upcomingMembership(memberships, today)}
      issues={(isRes.data ?? []) as CoachIssue[]}
      missing={isMissingTable(slotsRes.error)}
    />
  )
}
