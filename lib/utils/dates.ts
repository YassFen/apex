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
