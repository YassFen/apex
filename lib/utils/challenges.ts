// Box challenges (migration 008): load them with each person's total and the ranking.
import { todayISO } from '@/lib/utils/dates'
import { isMissingTable } from '@/lib/utils/errors'

export interface ChallengeRank { userId: string; name: string; avatar: string | null; total: number }
export interface ChallengeSummary {
  id: string; boxId: string; boxName: string; title: string; movement: string; target: number; unit: string
  startsOn: string; endsOn: string; createdBy: string; creatorName: string
  joined: boolean; myTotal: number; ranking: ChallengeRank[]
}

export const UNIT_WORD: Record<string, string> = { reps: 'reps', cal: 'cal', m: 'm', min: 'min' }

/** null when the tables don't exist yet. Recent = ended in the last 30 days. */
export async function loadChallenges(supabase: any, userId: string, boxIds: string[]): Promise<ChallengeSummary[] | null> {
  if (!boxIds.length) return []
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase.from('challenges')
    .select('id, box_id, title, movement, target, unit, starts_on, ends_on, created_by, boxes(name), profiles(full_name)')
    .in('box_id', boxIds).gte('ends_on', since).order('ends_on', { ascending: true })
  if (error) return isMissingTable(error) ? null : []
  const rows = (data ?? []) as any[]
  const ids = rows.map(r => r.id)
  if (!ids.length) return []
  const [{ data: parts }, { data: entries }] = await Promise.all([
    supabase.from('challenge_participants').select('challenge_id, user_id, profiles(full_name, avatar_url)').in('challenge_id', ids),
    supabase.from('challenge_entries').select('challenge_id, user_id, amount').in('challenge_id', ids),
  ])
  return rows.map(r => {
    const ps = ((parts ?? []) as any[]).filter(p => p.challenge_id === r.id)
    const totals = new Map<string, number>()
    for (const e of ((entries ?? []) as any[]).filter(e => e.challenge_id === r.id)) totals.set(e.user_id, (totals.get(e.user_id) ?? 0) + Number(e.amount))
    const ranking = ps.map(p => ({ userId: p.user_id, name: p.profiles?.full_name ?? 'Atleta', avatar: p.profiles?.avatar_url ?? null, total: totals.get(p.user_id) ?? 0 }))
      .sort((a, b) => b.total - a.total)
    return {
      id: r.id, boxId: r.box_id, boxName: r.boxes?.name ?? 'Box', title: r.title, movement: r.movement, target: r.target, unit: r.unit,
      startsOn: r.starts_on, endsOn: r.ends_on, createdBy: r.created_by, creatorName: r.profiles?.full_name ?? 'Atleta',
      joined: ps.some(p => p.user_id === userId), myTotal: totals.get(userId) ?? 0, ranking,
    }
  })
}

export const isActive = (c: ChallengeSummary, today = todayISO()) => c.startsOn <= today && c.endsOn >= today
