import { redirect } from 'next/navigation'
import { requireAdminBox, loadPeople, loadAttendance } from '@/lib/utils/admin-box'
import { MemberFileView } from '@/components/manage/MemberFileView'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { isMissingTable } from '@/lib/utils/errors'
import type { Membership, MembershipEvent, MembershipPlan, MemberFile } from '@/lib/types/database'

export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ box?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const { supabase, userId, profile, box } = await requireAdminBox(sp.box)
  const today = todayISO()

  const [people, days, msRes, evRes, plansRes, fileRes] = await Promise.all([
    loadPeople(supabase, box),
    loadAttendance(supabase, box.id, addDaysISO(today, -185), today),
    supabase.from('memberships').select('*').eq('box_id', box.id).eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('membership_events').select('*').eq('box_id', box.id).eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('membership_plans').select('*').eq('box_id', box.id).eq('is_active', true).order('created_at'),
    supabase.from('member_files').select('*').eq('box_id', box.id).eq('user_id', id).maybeSingle(),
  ])
  const person = people.find(p => p.id === id)
  if (!person) redirect('/manage/members')

  return (
    <MemberFileView
      profile={profile} box={box} person={person} me={userId} today={today}
      days={[...(days.get(id) ?? [])].sort()}
      memberships={(msRes.data ?? []) as Membership[]}
      events={(evRes.data ?? []) as MembershipEvent[]}
      plans={(plansRes.data ?? []) as MembershipPlan[]}
      file={(fileRes.data ?? null) as MemberFile | null}
      missing={isMissingTable(msRes.error)}
    />
  )
}
