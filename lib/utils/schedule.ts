// Turns the weekly class grid (slots) plus one-date changes (overrides) into the actual
// classes of a date range, and adds up coach hours and occupancy.
import { APP_TIME_ZONE, addDaysISO, daysBetween, toDateInput } from '@/lib/utils/dates'
import type { ClassBooking, ClassOverride, ClassSlot } from '@/lib/types/database'

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
/** Monday-first order of weekday numbers, as the grid shows them. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export const weekdayOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay()
export const hhmm = (t: string) => t.slice(0, 5)
/** Monday of the week that contains the date. */
export const weekStart = (ymd: string) => addDaysISO(ymd, -((weekdayOf(ymd) + 6) % 7))
export const monthStart = (ymd: string) => `${ymd.slice(0, 7)}-01`
export function monthEnd(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export interface Session {
  key: string            // slotId|date
  slotId: string
  date: string
  time: string           // HH:MM
  durationMin: number
  name: string
  capacity: number
  coachId: string | null
  /** Coach of the weekly slot, when this date has a replacement. */
  regularCoachId: string | null
  cancelled: boolean
  cancelReason: string | null
  booked: number
  waitlist: number
  /** People who actually came (past classes only). */
  attended: number
}

/** Current time in the box's time zone, as HH:MM. */
export function nowHM(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)
}

/** "YYYY-MM-DD HH:MM" of a timestamp, in the box's time zone. */
function localStamp(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${toDateInput(d)} ${nowHM(d)}`
}

/** A class has started once its date and start time (Santiago) have come. */
export function hasStarted(s: { date: string; time: string }, today: string, now: string = nowHM()): boolean {
  return s.date < today || (s.date === today && s.time <= now)
}

export function buildSessions(slots: ClassSlot[], overrides: ClassOverride[], bookings: Pick<ClassBooking, 'slot_id' | 'class_date' | 'status'>[], from: string, to: string, today?: string, now: string = nowHM()): Session[] {
  const ov = new Map(overrides.map(o => [`${o.slot_id}|${o.class_date}`, o]))
  const counts = new Map<string, { booked: number; waitlist: number; attended: number }>()
  for (const b of bookings) {
    const k = `${b.slot_id}|${b.class_date}`
    const c = counts.get(k) ?? { booked: 0, waitlist: 0, attended: 0 }
    if (b.status === 'booked' || b.status === 'attended' || b.status === 'no_show') c.booked++
    if (today && attended(b, today)) c.attended++
    else if (b.status === 'waitlist') c.waitlist++
    counts.set(k, c)
  }
  const out: Session[] = []
  const n = daysBetween(from, to)
  for (let i = 0; i <= n; i++) {
    const date = addDaysISO(from, i)
    const dow = weekdayOf(date)
    for (const s of slots) {
      if (s.weekday !== dow) continue
      const key = `${s.id}|${date}`
      // A slot taken off the grid keeps the classes it gave before (history), not the later ones.
      if (!s.is_active) {
        if (!today) continue
        const removed = (s as ClassSlot & { removed_at?: string | null }).removed_at
        const stamp = removed ? localStamp(removed) : null
        const at = `${date} ${hhmm(s.start_time)}`
        if (stamp) { if (at >= stamp) continue }
        // Without the switch-off time: past days, and today's class only if it already started and had people.
        else if (date > today || (date === today && (hhmm(s.start_time) > now || !counts.get(key)?.booked))) continue
      }
      const o = ov.get(key)
      const c = counts.get(key)
      out.push({
        key, slotId: s.id, date, time: hhmm(s.start_time), durationMin: s.duration_min, name: s.name,
        capacity: o?.capacity ?? s.capacity, coachId: o?.coach_id ?? s.coach_id,
        regularCoachId: o?.coach_id && o.coach_id !== s.coach_id ? s.coach_id : null,
        cancelled: !!o?.cancelled, cancelReason: o?.cancel_reason ?? null,
        booked: c?.booked ?? 0, waitlist: c?.waitlist ?? 0, attended: c?.attended ?? 0,
      })
    }
  }
  return out.sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1))
}

/** Hours and classes per coach for a list of sessions (cancelled ones don't count). */
export function coachLoad(sessions: Session[]): Map<string, { hours: number; classes: number; athletes: number }> {
  const m = new Map<string, { hours: number; classes: number; athletes: number }>()
  for (const s of sessions) {
    if (s.cancelled || !s.coachId) continue
    const c = m.get(s.coachId) ?? { hours: 0, classes: 0, athletes: 0 }
    c.hours += s.durationMin / 60; c.classes++; c.athletes += s.attended
    m.set(s.coachId, c)
  }
  return m
}

export const occupancy = (s: Session) => (s.capacity ? s.booked / s.capacity : 0)
export const LOW_DEMAND = 0.3
export const isLowDemand = (s: Session) => !s.cancelled && occupancy(s) < LOW_DEMAND
export const isOverbooked = (s: Session) => !s.cancelled && (s.booked > s.capacity || s.waitlist > 0)

export function hoursLabel(h: number): string {
  const whole = Math.floor(h), mins = Math.round((h - whole) * 60)
  return mins ? `${whole} h ${mins} min` : `${whole} h`
}

/** A booking counts as attendance once its day has passed, unless it was a no-show. */
export function attended(b: { status: string; class_date: string }, today: string): boolean {
  return b.status === 'attended' || (b.status === 'booked' && b.class_date < today)
}
