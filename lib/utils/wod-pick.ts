// Which of today's WODs to show when the box runs several classes.
// 1. the one I already logged, 2. the class I booked, 3. the last class that already started,
// 4. the next one to come.
export function pickTodayWod<T extends { id: string; box_id: string; class_time?: string | null }>(
  todays: T[], opts: { logged: Set<string>; bookedTimes: Map<string, string[]>; nowHm: string },
): T | null {
  const hm = (w: T) => (w.class_time ? String(w.class_time).slice(0, 5) : '')
  const mine = todays.find(w => opts.logged.has(w.id))
  if (mine) return mine
  const booked = todays.find(w => (opts.bookedTimes.get(w.box_id) ?? []).includes(hm(w)))
  if (booked) return booked
  const started = todays.filter(w => !hm(w) || hm(w) <= opts.nowHm)
  if (started.length) return started[started.length - 1]
  return todays[0] ?? null
}

export const nowHmSantiago = () =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())

/** My bookings today, as class times per box (needs 010; empty without it). */
export async function bookedTimesToday(supabase: any, userId: string, today: string): Promise<Map<string, string[]>> {
  const { data, error } = await supabase.from('class_bookings').select('box_id, status, class_slots(start_time)')
    .eq('user_id', userId).eq('class_date', today)
  const out = new Map<string, string[]>()
  if (error) return out
  for (const b of (data ?? []) as any[]) {
    if (b.status === 'cancelled' || !b.class_slots?.start_time) continue
    out.set(b.box_id, [...(out.get(b.box_id) ?? []), String(b.class_slots.start_time).slice(0, 5)])
  }
  return out
}
