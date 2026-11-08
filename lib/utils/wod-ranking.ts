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
  return parseFloat(v.replace(',', '.')) || 0
}

export function rankResults<T extends { result_type: string; result_value: string; rx_level: string; recorded_at?: string }>(
  results: T[],
): T[] {
  return [...results].sort((a, b) => {
    const lvl = (LEVEL_RANK[a.rx_level] ?? 3) - (LEVEL_RANK[b.rx_level] ?? 3)
    if (lvl !== 0) return lvl
    const diff = score(b.result_type, b.result_value) - score(a.result_type, a.result_value)
    if (diff !== 0) return diff
    return (a.recorded_at ?? '').localeCompare(b.recorded_at ?? '')
  })
}
