import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { redirect } from 'next/navigation'
import { todayISO } from '@/lib/utils/dates'
import { rankResults } from '@/lib/utils/wod-ranking'
import { WodHistoryView, type HistoryEntry } from '@/components/wod/WodHistoryView'
import type { Profile } from '@/lib/types/database'

const DAYS = 60

export default async function WodHistoryPage() {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const p = await getProfile(user.id)
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  const { data: memberships } = await supabase
    .from('box_members').select('box_id').eq('user_id', user.id).eq('is_active', true)
  const boxIds = ((memberships ?? []) as any[]).map(m => m.box_id as string)

  const today = todayISO()
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString().slice(0, 10)

  const { data: rawWods } = boxIds.length > 0
    ? await supabase
        .from('daily_wods')
        .select('id, title, type, duration_mins, scheduled_for, movements, boxes(name)')
        .in('box_id', boxIds)
        .eq('is_live', true)
        .gte('scheduled_for', since)
        .lte('scheduled_for', today)
        .order('scheduled_for', { ascending: false })
    : { data: [] as any[] }
  const wods = (rawWods ?? []) as any[]

  // All results for those WODs, only the fields needed to compute each place.
  const { data: rawResults } = wods.length > 0
    ? await supabase
        .from('wod_results')
        .select('daily_wod_id, user_id, result_type, result_value, rx_level, recorded_at')
        .in('daily_wod_id', wods.map(w => w.id))
    : { data: [] as any[] }

  const byWod = new Map<string, any[]>()
  for (const r of (rawResults ?? []) as any[]) {
    const list = byWod.get(r.daily_wod_id) ?? []
    list.push(r)
    byWod.set(r.daily_wod_id, list)
  }

  const entries: HistoryEntry[] = wods.map(w => {
    const ranked = rankResults(byWod.get(w.id) ?? [])
    const idx = ranked.findIndex(r => r.user_id === user.id)
    const mine = idx >= 0 ? ranked[idx] : null
    return {
      id: w.id,
      date: w.scheduled_for,
      title: w.title,
      type: w.type,
      durationMins: w.duration_mins,
      boxName: w.boxes?.name ?? null,
      movementCount: Array.isArray(w.movements) ? w.movements.length : 0,
      athletes: ranked.length,
      result: mine ? { value: mine.result_value, level: mine.rx_level, place: idx + 1 } : null,
      isToday: w.scheduled_for === today,
    }
  })

  return <WodHistoryView profile={profile} entries={entries} hasBox={boxIds.length > 0} />
}
