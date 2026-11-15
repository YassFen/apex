import { requireAdminBox, loadPeople, selectAll } from '@/lib/utils/admin-box'
import { PlansView } from '@/components/manage/PlansView'
import { todayISO } from '@/lib/utils/dates'
import { currentMembership, planState } from '@/lib/utils/membership'
import { isMissingTable } from '@/lib/utils/errors'
import type { Membership, MembershipPlan } from '@/lib/types/database'

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const sp = await searchParams
  const { supabase, profile, box, boxes } = await requireAdminBox(sp.box)
  const today = todayISO()
  const [plansRes, msRes, people] = await Promise.all([
    supabase.from('membership_plans').select('*').eq('box_id', box.id).order('created_at'),
    selectAll(() => supabase.from('memberships').select('*').eq('box_id', box.id).order('id')),
    loadPeople(supabase, box),
  ])
  // People per plan: only memberships in force today, of people still in the box.
  const active = new Set(people.filter(p => p.isActive).map(p => p.id))
  const byUser = new Map<string, Membership[]>()
  for (const m of (msRes.data as Membership[])) {
    if (active.has(m.user_id)) byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), m])
  }
  const counts: Record<string, number> = {}
  for (const rows of byUser.values()) {
    const m = currentMembership(rows, today)
    const s = planState(m, today)
    if (m?.plan_id && s !== 'expired' && s !== 'none') counts[m.plan_id] = (counts[m.plan_id] ?? 0) + 1
  }
  return <PlansView profile={profile} box={box} boxes={boxes} plans={(plansRes.data ?? []) as MembershipPlan[]} counts={counts} missing={isMissingTable(plansRes.error)} />
}
