import { requireAdminBox, loadPeople, loadAttendance, selectAll } from '@/lib/utils/admin-box'
import { ManageHome, type ManageSummary } from '@/components/manage/ManageHome'
import { addDaysISO, daysBetween, formatDateOnly, todayISO, toDateInput } from '@/lib/utils/dates'
import { currentMembership, planState } from '@/lib/utils/membership'
import { WEEKDAYS_SHORT, WEEK_ORDER, attended, buildSessions, hasStarted, isOverbooked, monthStart, nowHM, occupancy, weekdayOf, hhmm } from '@/lib/utils/schedule'
import { isMissingTable } from '@/lib/utils/errors'
import type { ClassBooking, ClassOverride, ClassSlot, CoachIssue, Membership } from '@/lib/types/database'

const INACTIVE_DAYS = 14

export default async function ManagePage({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const sp = await searchParams
  const { supabase, profile, box, boxes } = await requireAdminBox(sp.box)
  const today = todayISO()
  const thisStart = monthStart(today)
  const prevStart = monthStart(addDaysISO(thisStart, -1))
  const dayN = Number(today.slice(8))
  const prevSameDay = addDaysISO(prevStart, dayN - 1)           // same day number last month
  const prevKey = prevStart.slice(0, 7), thisKey = today.slice(0, 7)

  const [people, days, msRes, slotsRes, ovRes, bkRes, isRes] = await Promise.all([
    loadPeople(supabase, box),
    loadAttendance(supabase, box.id, addDaysISO(today, -365), today),
    selectAll(() => supabase.from('memberships').select('*').eq('box_id', box.id).order('id')),
    supabase.from('class_slots').select('*').eq('box_id', box.id),
    selectAll(() => supabase.from('class_overrides').select('*').eq('box_id', box.id).gte('class_date', prevStart).lte('class_date', addDaysISO(today, 7)).order('id')),
    selectAll(() => supabase.from('class_bookings').select('id, slot_id, class_date, user_id, status').eq('box_id', box.id).gte('class_date', prevStart).lte('class_date', addDaysISO(today, 7)).neq('status', 'cancelled').order('id')),
    supabase.from('coach_issues').select('*').eq('box_id', box.id).eq('status', 'open').gte('class_date', today),
  ])
  const slots = (slotsRes.data ?? []) as ClassSlot[]
  const bookings = (bkRes.data ?? []) as ClassBooking[]
  const athletes = people.filter(p => p.role === 'athlete')
  const coaches = people.filter(p => p.role !== 'athlete' && p.isActive)

  /* ── People ── */
  const lastOf = (id: string) => [...(days.get(id) ?? [])].sort().pop() ?? null
  const isAway = (p: typeof athletes[number]) => {
    const last = lastOf(p.id)
    return daysBetween(last ?? toDateInput(p.joinedAt), today) >= INACTIVE_DAYS
  }
  const activeNow = athletes.filter(p => p.isActive && !isAway(p)).length
  const away = athletes.filter(p => p.isActive && isAway(p))
  const joinedIn = (key: string) => athletes.filter(p => toDateInput(p.joinedAt).startsWith(key)).length
  const leftIn = (key: string) => athletes.filter(p => !p.isActive && p.leftAt && toDateInput(p.leftAt).startsWith(key)).length

  /* ── Plans ── */
  const byUser = new Map<string, Membership[]>()
  for (const m of ((msRes.data ?? []) as Membership[])) byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), m])
  let frozen = 0, expiring = 0, expired = 0
  const planCount = new Map<string, number>()
  for (const p of athletes) {
    if (!p.isActive) continue
    const m = currentMembership(byUser.get(p.id) ?? [], today)
    const s = planState(m, today)
    if (s === 'frozen') frozen++
    if (s === 'expiring') expiring++
    if (s === 'expired' || s === 'no_classes') expired++
    if (m && s !== 'expired') planCount.set(m.plan_name, (planCount.get(m.plan_name) ?? 0) + 1)
  }

  /* ── Attendance: this month to date against the same days of last month ── */
  let attNow = 0, attPrev = 0, attPrevFull = 0
  const byDow = new Map<number, { now: number; before: number }>()
  const cumNow = Array.from({ length: dayN }, () => 0), cumPrev = Array.from({ length: dayN }, () => 0)
  for (const set of days.values()) for (const d of set) {
    const isNow = d.startsWith(thisKey)
    if (isNow) attNow++
    else if (d.startsWith(prevKey)) { attPrevFull++; if (d <= prevSameDay) attPrev++ }
    const w = byDow.get(weekdayOf(d)) ?? { now: 0, before: 0 }
    if (isNow) w.now++; else if (d.startsWith(prevKey) && d <= prevSameDay) w.before++
    byDow.set(weekdayOf(d), w)
    const i = Number(d.slice(8)) - 1
    if (i < dayN) { if (isNow) cumNow[i]++; else if (d.startsWith(prevKey)) cumPrev[i]++ }
  }
  for (let i = 1; i < dayN; i++) { cumNow[i] += cumNow[i - 1]; cumPrev[i] += cumPrev[i - 1] }

  /* ── Classes: busiest times, occupancy, waiting lists, per coach ── */
  const now = nowHM()
  const sessions = buildSessions(slots, (ovRes.data ?? []) as ClassOverride[], bookings, prevStart, addDaysISO(today, 7), today, now)
  const given = sessions.filter(s => !s.cancelled && s.date >= thisStart && hasStarted(s, today, now))
  const byHour = new Map<string, { sum: number; n: number }>()
  for (const s of sessions.filter(x => !x.cancelled && hasStarted(x, today, now))) {
    const h = byHour.get(s.time) ?? { sum: 0, n: 0 }
    h.sum += s.booked; h.n++; byHour.set(s.time, h)
  }
  const occ = given.length ? Math.round((given.reduce((a, s) => a + Math.min(1, occupancy(s)), 0) / given.length) * 100) : null
  const upcoming = sessions.filter(s => !s.cancelled && !hasStarted(s, today, now))
  const waitlisted = upcoming.filter(isOverbooked)
  const noCoach = upcoming.filter(s => !s.coachId)
  // Low demand: weekly slots that averaged under 30% over what has been given since last month.
  const slotAvg = new Map<string, { sum: number; n: number }>()
  for (const s of sessions.filter(x => !x.cancelled && x.date < today)) {
    const a = slotAvg.get(s.slotId) ?? { sum: 0, n: 0 }
    a.sum += occupancy(s); a.n++; slotAvg.set(s.slotId, a)
  }
  const lowSlots = slots.filter(s => s.is_active).filter(s => { const a = slotAvg.get(s.id); return a && a.n >= 2 && a.sum / a.n < 0.3 })
  const sessionCoach = new Map(sessions.map(s => [s.key, s.coachId]))
  const perCoach = new Map<string, number>()
  for (const b of bookings) {
    if (!b.class_date.startsWith(thisKey) || !attended(b, today)) continue
    const c = sessionCoach.get(`${b.slot_id}|${b.class_date}`)
    if (c) perCoach.set(c, (perCoach.get(c) ?? 0) + 1)
  }

  /* ── Six months of members ── */
  const evolution: ManageSummary['evolution'] = []
  let cursor = thisStart
  for (let i = 0; i < 6; i++) {
    const key = cursor.slice(0, 7)
    const end = i === 0 ? today : addDaysISO(monthStart(addDaysISO(cursor, 32)), -1)
    evolution.unshift({
      label: formatDateOnly(cursor, { month: 'short' }).replace('.', ''),
      members: athletes.filter(p => toDateInput(p.joinedAt) <= end && (p.isActive || (p.leftAt ? toDateInput(p.leftAt) > end : false))).length,
      joined: joinedIn(key),
    })
    cursor = monthStart(addDaysISO(cursor, -1))
  }

  const summary: ManageSummary = {
    monthLabel: formatDateOnly(today, { month: 'long' }),
    activeNow, totalAthletes: athletes.filter(p => p.isActive).length, coaches: coaches.length,
    attNow, attPrev, attPrevFull,
    joinedNow: joinedIn(thisKey), joinedPrev: joinedIn(prevKey), leftNow: leftIn(thisKey), leftPrev: leftIn(prevKey),
    frozen, expiring, expired, occupancy: occ, waitlisted: waitlisted.length, noCoach: noCoach.length, issues: ((isRes.data ?? []) as CoachIssue[]).length,
    lowSlots: lowSlots.map(s => `${WEEKDAYS_SHORT[s.weekday]} ${hhmm(s.start_time)}`),
    away: away.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, days: daysBetween(lastOf(p.id) ?? toDateInput(p.joinedAt), today) })).sort((a, b) => a.days - b.days).slice(0, 6),
    awayCount: away.length,
    cumLabels: cumNow.map((_, i) => String(i + 1)), cumNow, cumPrev,
    byDow: WEEK_ORDER.map(d => ({ label: WEEKDAYS_SHORT[d], now: byDow.get(d)?.now ?? 0, before: byDow.get(d)?.before ?? 0 })),
    byHour: [...byHour.entries()].sort().map(([label, h]) => ({ label, value: Math.round((h.sum / h.n) * 10) / 10 })),
    perCoach: [...perCoach.entries()].map(([id, value]) => ({ label: people.find(p => p.id === id)?.name ?? 'Coach', value })).sort((a, b) => b.value - a.value),
    plans: [...planCount.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    evolution, hasSchedule: slots.some(s => s.is_active),
  }

  return <ManageHome profile={profile} box={box} boxes={boxes} s={summary} missing={isMissingTable(slotsRes.error) || isMissingTable(msRes.error)} />
}
