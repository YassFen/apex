// Membership state shared by the administrator screens and the athlete's own view.
import { addDaysISO, daysBetween } from '@/lib/utils/dates'
import type { Membership } from '@/lib/types/database'

export type PlanState = 'none' | 'active' | 'expiring' | 'expired' | 'frozen' | 'no_classes'
export const EXPIRING_DAYS = 7

export const PLAN_STATE_META: Record<PlanState, { label: string; color: 'green' | 'orange' | 'red' | 'blue' | 'neutral' }> = {
  none:       { label: 'Sin plan', color: 'neutral' },
  active:     { label: 'Al día', color: 'green' },
  expiring:   { label: 'Por vencer', color: 'orange' },
  expired:    { label: 'Vencido', color: 'red' },
  frozen:     { label: 'Congelado', color: 'blue' },
  no_classes: { label: 'Sin clases', color: 'red' },
}

/**
 * The plan in force today (rows may come in any order): the newest one that already started.
 * A frozen plan wins, because freezing pauses everything (even a renewal that already started).
 * Null when nothing has started yet; see upcomingMembership() for "Empieza el …".
 * Mirrors booking_block() in the database.
 */
export function currentMembership(rows: Membership[], today?: string): Membership | null {
  const live = rows.filter(m => m.status !== 'cancelled').sort((a, b) => (a.starts_on < b.starts_on ? 1 : a.starts_on > b.starts_on ? -1 : a.created_at < b.created_at ? 1 : -1))
  if (!today) return live[0] ?? null
  const started = live.filter(m => m.starts_on <= today)
  return started.find(m => m.status === 'frozen') ?? started[0] ?? null
}

/** True when the request failed because a database function doesn't exist yet. */
export function isMissingFunction(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === 'PGRST202' || err.code === '42883' || /could not find the function|function .* does not exist|no disponible en la demo/i.test(err.message ?? '')
}

/**
 * Reactivates a frozen plan: the frozen days go back to its end date and every plan loaded
 * after it (a renewal) moves forward by the same days. Uses unfreeze_membership (016) and
 * falls back to doing the same updates one by one.
 */
export async function reactivateMembership(supabase: any, m: Membership, all: Membership[], today: string, me: string): Promise<{ error: { message: string } | null; days: number }> {
  const { data, error } = await supabase.rpc('unfreeze_membership', { p_id: m.id })
  if (!error) {
    if (data && data.ok === false) return { error: { message: 'Ese plan ya no está congelado. Recarga la página.' }, days: 0 }
    return { error: null, days: Number(data?.days ?? 0) }
  }
  if (!isMissingFunction(error)) return { error, days: 0 }

  const u = unfreeze(m, today)
  const res = await supabase.from('memberships').update({ status: 'active', frozen_on: null, ends_on: u.ends_on }).eq('id', m.id)
  if (res.error) return { error: res.error, days: 0 }
  if (u.days > 0) {
    for (const later of all.filter(x => x.id !== m.id && x.status !== 'cancelled' && x.starts_on > m.starts_on)) {
      const r = await supabase.from('memberships').update({ starts_on: addDaysISO(later.starts_on, u.days), ends_on: addDaysISO(later.ends_on, u.days) }).eq('id', later.id)
      if (r.error) return { error: r.error, days: u.days }
    }
  }
  const ev = await supabase.from('membership_events').insert({ membership_id: m.id, box_id: m.box_id, user_id: m.user_id, type: 'reactivated', happened_on: today, created_by: me, reason: null, days: u.days })
  return { error: ev.error ?? null, days: u.days }
}

/** A renewal already loaded that starts after the current plan. */
export function upcomingMembership(rows: Membership[], today: string): Membership | null {
  return rows.filter(m => m.status !== 'cancelled' && m.starts_on > today).sort((a, b) => (a.starts_on < b.starts_on ? -1 : 1))[0] ?? null
}

export function planState(m: Membership | null, today: string): PlanState {
  if (!m) return 'none'
  if (m.status === 'frozen') return 'frozen'
  if (m.ends_on < today) return 'expired'
  if (m.kind === 'classes' && m.classes_used >= (m.classes_total ?? 0)) return 'no_classes'
  if (daysBetween(today, m.ends_on) <= EXPIRING_DAYS) return 'expiring'
  return 'active'
}

export function classesLeft(m: Membership | null): number | null {
  if (!m || m.kind !== 'classes') return null
  return Math.max(0, (m.classes_total ?? 0) - m.classes_used)
}

/** New end date after a freeze: the frozen days are given back. */
export function unfreeze(m: Membership, today: string): { ends_on: string; days: number } {
  const days = Math.max(0, daysBetween(m.frozen_on ?? today, today))
  return { ends_on: addDaysISO(m.ends_on, days), days }
}

export const MEMBERSHIP_EVENT_LABEL: Record<string, string> = {
  assigned: 'Plan asignado', renewed: 'Renovación', frozen: 'Congelado', reactivated: 'Reactivado', cancelled: 'Cancelado', adjusted: 'Ajuste',
}

export function money(value: number | null, currency = 'CLP'): string {
  if (value === null || value === undefined) return 'Sin precio'
  try { return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: currency === 'CLP' ? 0 : 2 }).format(value) }
  catch { return `${value} ${currency}` }
}
