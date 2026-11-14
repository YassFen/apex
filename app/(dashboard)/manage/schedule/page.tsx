import { requireAdminBox, loadPeople } from '@/lib/utils/admin-box'
import { ScheduleView } from '@/components/manage/ScheduleView'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { weekStart } from '@/lib/utils/schedule'
import { isMissingTable } from '@/lib/utils/errors'
import type { ClassBooking, ClassOverride, ClassSlot, CoachIssue } from '@/lib/types/database'

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ box?: string; w?: string }> }) {
  const sp = await searchParams
  const { supabase, profile, box, boxes } = await requireAdminBox(sp.box)
  const today = todayISO()
  const from = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(sp.w ?? '') ? (sp.w as string) : today)
  const to = addDaysISO(from, 6)

  const [people, slotsRes, ovRes, bkRes, isRes] = await Promise.all([
    loadPeople(supabase, box),
    supabase.from('class_slots').select('*').eq('box_id', box.id).order('start_time'),
    supabase.from('class_overrides').select('*').eq('box_id', box.id).gte('class_date', from).lte('class_date', to),
    supabase.from('class_bookings').select('id, slot_id, class_date, user_id, status, created_at').eq('box_id', box.id).gte('class_date', from).lte('class_date', to),
    supabase.from('coach_issues').select('*').eq('box_id', box.id).eq('status', 'open').gte('class_date', today),
  ])

  return (
    <ScheduleView
      profile={profile} box={box} boxes={boxes} today={today} from={from}
      people={people.filter(p => p.isActive).map(p => ({ id: p.id, name: p.name, avatar: p.avatar, role: p.role }))}
      slots={(slotsRes.data ?? []) as ClassSlot[]}
      overrides={(ovRes.data ?? []) as ClassOverride[]}
      bookings={(bkRes.data ?? []) as ClassBooking[]}
      issues={(isRes.data ?? []) as CoachIssue[]}
      missing={isMissingTable(slotsRes.error)}
    />
  )
}
