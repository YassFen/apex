// Leaderboard ordering. result_value is stored as text ("9:30", "5+12", "135"),
// so sorting it as a string ranks "10:05" before "9:30". Parse it per type instead.

const LEVEL_RANK: Record<string, number> = { 'rx+': 0, rx: 1, scaled: 2 }

/** Numeric score where a bigger number is always better. */
function score(resultType: string, value: string): number {
  const v = (value ?? '').trim()
  if (resultType === 'time') {
    const [mm, ss] = v.split(':').map(n => parseInt(n, 10) || 0)
    const secs = mm * 60 + ss
    return secs > 0 ? -secs : -Infinity // faster is better; empty goes last
  }
  if (resultType === 'rounds') {
    const [rounds, reps] = v.split('+').map(n => parseInt(n, 10) || 0)
    return rounds * 1000 + reps
  }
  const n = parseFloat(v.replace(',', '.')) || 0
  // Weights are saved in each athlete's unit ("100 kg", "225 lb"): compare them in lb.
  if (resultType === 'weight' && /kg/i.test(v)) return n * 2.20462262
  return n
}

/** Result type a WOD is scored in: For Time -> time, AMRAP -> rounds, Strength -> weight, the rest -> reps. */
export function nativeResultType(wodType: string | null | undefined): string {
  return wodType === 'fortime' ? 'time' : wodType === 'amrap' ? 'rounds' : wodType === 'strength' ? 'weight' : 'reps'
}

/**
 * Without the WOD type, work it out from the results themselves: a time only exists
 * in a For Time, rounds in an AMRAP, a weight in a Strength; otherwise it's plain reps.
 */
function inferNative(results: { result_type: string }[]): string {
  for (const t of ['time', 'rounds', 'weight']) if (results.some(r => r.result_type === t)) return t
  return 'reps'
}

/**
 * Orders a WOD's results: Rx level first (rx+ > rx > scaled), then results in the WOD's
 * own type (For Time: finishers by time), then the rest (e.g. capped athletes by reps, most first).
 * Pass `wodType` when you have it; otherwise the native type is inferred from the results.
 */
export function rankResults<T extends { result_type: string; result_value: string; rx_level: string; recorded_at?: string }>(
  results: T[],
  wodType?: string | null,
): T[] {
  const native = wodType ? nativeResultType(wodType) : inferNative(results)
  return [...results].sort((a, b) => {
    const lvl = (LEVEL_RANK[a.rx_level] ?? 3) - (LEVEL_RANK[b.rx_level] ?? 3)
    if (lvl !== 0) return lvl
    const na = a.result_type === native ? 0 : 1, nb = b.result_type === native ? 0 : 1
    if (na !== nb) return na - nb
    if (a.result_type !== b.result_type) return a.result_type.localeCompare(b.result_type)
    const sa = score(a.result_type, a.result_value), sb = score(b.result_type, b.result_value)
    if (sa !== sb) return sb > sa ? 1 : -1
    return (a.recorded_at ?? '').localeCompare(b.recorded_at ?? '')
  })
}
