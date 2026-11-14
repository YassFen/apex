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

/** Latest membership that isn't cancelled (rows may come in any order). */
export function currentMembership(rows: Membership[]): Membership | null {
  return rows.filter(m => m.status !== 'cancelled').sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null
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
