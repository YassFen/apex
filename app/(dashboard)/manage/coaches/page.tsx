import { requireAdminBox, loadPeople } from '@/lib/utils/admin-box'
import { CoachesView } from '@/components/manage/CoachesView'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { monthEnd, monthStart, weekStart } from '@/lib/utils/schedule'
import { isMissingTable } from '@/lib/utils/errors'
import type { ClassBooking, ClassOverride, ClassSlot, CoachIssue } from '@/lib/types/database'

export default async function CoachesPage({ searchParams }: { searchParams: Promise<{ box?: string; p?: string; d?: string }> }) {
  const sp = await searchParams
  const { supabase, profile, box, boxes } = await requireAdminBox(sp.box)
  const today = todayISO()
  const period = sp.p === 'month' ? 'month' : 'week'
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? '') ? (sp.d as string) : today
  const from = period === 'month' ? monthStart(anchor) : weekStart(anchor)
  const to = period === 'month' ? monthEnd(anchor) : addDaysISO(from, 6)

  const [people, slotsRes, ovRes, bkRes, isRes] = await Promise.all([
    loadPeople(supabase, box),
    supabase.from('class_slots').select('*').eq('box_id', box.id).order('start_time'),
    supabase.from('class_overrides').select('*').eq('box_id', box.id).gte('class_date', from).lte('class_date', to),
    supabase.from('class_bookings').select('slot_id, class_date, status').eq('box_id', box.id).gte('class_date', from).lte('class_date', to),
    supabase.from('coach_issues').select('*').eq('box_id', box.id).gte('class_date', addDaysISO(today, -14)).order('class_date'),
  ])

  return (
    <CoachesView
      profile={profile} box={box} boxes={boxes} today={today} period={period} from={from} to={to}
      coaches={people.filter(p => p.isActive && p.role !== 'athlete').map(p => ({ id: p.id, name: p.name, avatar: p.avatar, role: p.role }))}
      slots={(slotsRes.data ?? []) as ClassSlot[]}
      overrides={(ovRes.data ?? []) as ClassOverride[]}
      bookings={(bkRes.data ?? []) as Pick<ClassBooking, 'slot_id' | 'class_date' | 'status'>[]}
      issues={(isRes.data ?? []) as CoachIssue[]}
      missing={isMissingTable(slotsRes.error)}
    />
  )
}
