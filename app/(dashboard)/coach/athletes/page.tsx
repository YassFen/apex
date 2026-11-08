import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { redirect } from 'next/navigation'
import { AthletesView, type AthleteRow } from '@/components/coach/AthletesView'
import type { Profile, Box } from '@/lib/types/database'

const WINDOW_DAYS = 30

export default async function AthletesPage() {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const p = await getProfile(user.id)
  const profile = p as Profile | null
  if (!profile || profile.role !== 'coach') redirect('/dashboard')

  const { data: b } = await supabase.from('boxes').select('*').eq('owner_id', user.id).maybeSingle()
  const box = b as Box | null
  if (!box) redirect('/dashboard')

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)

  const [{ data: rawMembers }, { data: rawWods }] = await Promise.all([
    supabase
      .from('box_members')
      .select('user_id, role, joined_at, profiles(full_name, email, city, avatar_url)')
      .eq('box_id', box.id)
      .eq('is_active', true)
      .order('joined_at', { ascending: false }),
    supabase
      .from('daily_wods')
      .select('id')
      .eq('box_id', box.id)
      .eq('is_live', true)
      .gte('scheduled_for', since),
  ])

  const wodIds = ((rawWods ?? []) as any[]).map(w => w.id as string)
  const { data: rawResults } = wodIds.length > 0
    ? await supabase.from('wod_results').select('user_id, recorded_at').in('daily_wod_id', wodIds)
    : { data: [] as any[] }

  const activity = new Map<string, { count: number; last: string }>()
  for (const r of (rawResults ?? []) as any[]) {
    const a = activity.get(r.user_id) ?? { count: 0, last: '' }
    a.count++
    if (r.recorded_at > a.last) a.last = r.recorded_at
    activity.set(r.user_id, a)
  }

  const rows: AthleteRow[] = ((rawMembers ?? []) as any[]).map(m => ({
    id: m.user_id,
    name: m.profiles?.full_name ?? 'Atleta',
    email: m.profiles?.email ?? '',
    city: m.profiles?.city ?? null,
    avatar: m.profiles?.avatar_url ?? null,
    role: m.role,
    joinedAt: m.joined_at,
    wods30: activity.get(m.user_id)?.count ?? 0,
    lastResultAt: activity.get(m.user_id)?.last || null,
    isMe: m.user_id === user.id,
  }))

  return <AthletesView profile={profile} box={box} rows={rows} wodsPublished={wodIds.length} />
}
