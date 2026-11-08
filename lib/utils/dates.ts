// Date helpers. The server runs in UTC, so "today" must be computed in the
// gym's time zone or the WOD disappears every evening in Latin America.
export const APP_TIME_ZONE = 'America/Santiago'

/** YYYY-MM-DD for "now" in the given time zone. */
export function todayISO(timeZone: string = APP_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/** YYYY-MM-DD of a timestamp, as seen in the given time zone (for <input type="date">). */
export function toDateInput(value: string | Date, timeZone: string = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value))
}

/**
 * Timestamp for a YYYY-MM-DD picked in a date input. Uses local noon so the
 * stored instant never rolls into the previous or next day in any UTC-12..+12 zone.
 */
export function dateInputToTimestamp(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

/** Format a date-only column (YYYY-MM-DD) without the UTC off-by-one shift. */
export function formatDateOnly(ymd: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', opts)
}

/** Adds whole days to a YYYY-MM-DD string (calendar math, no time zone involved). */
export function addDaysISO(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

/** "Hoy", "Mañana", "En 5 días", "Hace 2 días"… for a YYYY-MM-DD relative to today. */
export function relativeDayLabel(ymd: string, today: string = todayISO()): string {
  const n = daysBetween(today, ymd)
  if (n === 0) return 'Hoy'
  if (n === 1) return 'Mañana'
  if (n === -1) return 'Ayer'
  return n > 0 ? `En ${n} días` : `Hace ${-n} días`
}
