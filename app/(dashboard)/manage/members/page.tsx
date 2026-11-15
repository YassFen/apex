import { requireAdminBox, loadPeople, loadAttendance, selectAll } from '@/lib/utils/admin-box'
import { MembersView, type MemberRow } from '@/components/manage/MembersView'
import { addDaysISO, daysBetween, todayISO, toDateInput } from '@/lib/utils/dates'
import { classesLeft, currentMembership, planState } from '@/lib/utils/membership'
import { isMissingTable } from '@/lib/utils/errors'
import type { Membership } from '@/lib/types/database'

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ box?: string; f?: string }> }) {
  const sp = await searchParams
  const { supabase, profile, box, boxes } = await requireAdminBox(sp.box)
  const today = todayISO()
  const from = addDaysISO(today, -365)

  const [people, days, msRes] = await Promise.all([
    loadPeople(supabase, box),
    loadAttendance(supabase, box.id, from, today),
    selectAll(() => supabase.from('memberships').select('*').eq('box_id', box.id).order('id')),
  ])
  const byUser = new Map<string, Membership[]>()
  for (const m of ((msRes.data ?? []) as Membership[])) byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), m])

  const month30 = addDaysISO(today, -30)
  const rows: MemberRow[] = people.map(p => {
    const d = [...(days.get(p.id) ?? [])].sort()
    const last = d[d.length - 1] ?? null
    const m = currentMembership(byUser.get(p.id) ?? [], today)
    return {
      id: p.id, name: p.name, email: p.email, avatar: p.avatar, role: p.role, isActive: p.isActive,
      joinedDays: daysBetween(toDateInput(p.joinedAt), today),
      attendance30: d.filter(x => x >= month30).length,
      lastDays: last ? daysBetween(last, today) : null,
      plan: m?.plan_name ?? null, state: planState(m, today), endsOn: m?.ends_on ?? null, left: classesLeft(m),
    }
  })

  return <MembersView profile={profile} box={box} boxes={boxes} rows={rows} initialFilter={sp.f ?? 'all'} missing={isMissingTable(msRes.error)} />
}
