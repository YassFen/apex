// Who sees an announcement, and whether it should pop up for them.
import { WEEKDAYS, hhmm, weekdayOf } from '@/lib/utils/schedule'
import type { Announcement, ClassSlot } from '@/lib/types/database'

export interface ShellAnnouncement {
  id: string; boxId: string; boxName: string; title: string; body: string | null; urgent: boolean
  audience: Announcement['audience']; target: string | null; startsOn: string; endsOn: string | null
  mine: boolean; read: boolean
  /** Opens by itself the first time (urgent ones, general ones, or targeted ones that match a booking). */
  popup: boolean
}

export const isLive = (a: Pick<Announcement, 'starts_on' | 'ends_on'>, today: string) => a.starts_on <= today && (!a.ends_on || a.ends_on >= today)

export function targetLabel(a: Pick<Announcement, 'weekday' | 'slot_id'>, slots: Pick<ClassSlot, 'id' | 'weekday' | 'start_time' | 'name'>[]): string | null {
  if (a.slot_id) {
    const s = slots.find(x => x.id === a.slot_id)
    return s ? `Clase de ${WEEKDAYS[s.weekday].toLowerCase()} ${hhmm(s.start_time)}` : 'Una clase'
  }
  if (a.weekday !== null && a.weekday !== undefined) return `Quienes vienen los ${WEEKDAYS[a.weekday].toLowerCase()}`
  return null
}

/** Staff see everything of their box; athletes see what is addressed to athletes or to everyone. */
export function visibleTo(a: Pick<Announcement, 'audience' | 'author_id'>, staff: boolean, me: string): boolean {
  return a.author_id === me || staff || a.audience !== 'coaches'
}

export function matchesBooking(a: Pick<Announcement, 'weekday' | 'slot_id'>, bookings: { slot_id: string; class_date: string }[]): boolean {
  if (a.slot_id) return bookings.some(b => b.slot_id === a.slot_id)
  if (a.weekday !== null && a.weekday !== undefined) return bookings.some(b => weekdayOf(b.class_date) === a.weekday)
  return true
}

export const AUDIENCE_LABEL: Record<Announcement['audience'], string> = { coaches: 'Solo coaches', athletes: 'Atletas', all: 'Todo el box' }
