import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { redirect } from 'next/navigation'
import { pickCoachBox } from '@/lib/utils/coach-boxes'
import { todayISO } from '@/lib/utils/dates'
import { WodLibraryView, type LibraryWod } from '@/components/coach/WodLibraryView'
import type { Profile } from '@/lib/types/database'

const PAGE = 30
const MAX_PAGES = 30
const TYPES = ['fortime', 'amrap', 'emom', 'tabata', 'strength']

export default async function WodLibraryPage({ searchParams }: { searchParams: Promise<{ box?: string; q?: string; t?: string; p?: string }> }) {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const profile = (await getProfile(user.id)) as Profile | null
  if (!profile) redirect('/dashboard')

  const { box: boxParam, q: rawQ, t: rawT, p: rawP } = await searchParams
  const { box, boxes } = await pickCoachBox(supabase, user.id, boxParam)
  if (!box) redirect('/coach/create-box')

  // Keep the search text free of characters that have a meaning in the filter syntax.
  const q = (rawQ ?? '').replace(/[,()%*\\]/g, ' ').trim().slice(0, 60)
  const type = rawT && TYPES.includes(rawT) ? rawT : ''
  const page = Math.min(MAX_PAGES, Math.max(1, parseInt(rawP ?? '1', 10) || 1))

  const build = (cols: string) => {
    let qb = supabase.from('daily_wods').select(cols)
      .eq('box_id', box.id).eq('is_live', true).lte('scheduled_for', todayISO())
    if (type) qb = qb.eq('type', type)
    if (q) qb = qb.or(`title.ilike.%${q}%,description.ilike.%${q}%`)
    return qb.order('scheduled_for', { ascending: false }).range(0, page * PAGE) // one extra row tells if there are more
  }
  const cols = 'id, title, type, scheduled_for, duration_mins, description'
  let { data, error } = await build(`${cols}, wod_results(count)`)
  if (error) ({ data } = await build(cols))
  const rows = (data ?? []) as any[]

  const wods: LibraryWod[] = rows.slice(0, page * PAGE).map(w => ({
    id: w.id, title: w.title, type: w.type, date: w.scheduled_for, mins: w.duration_mins ?? null,
    results: Array.isArray(w.wod_results) ? Number(w.wod_results[0]?.count ?? 0) : null,
  }))

  return (
    <WodLibraryView
      profile={profile} boxes={boxes} boxId={box.id} wods={wods}
      q={q} type={type} page={page} hasMore={rows.length > page * PAGE && page < MAX_PAGES}
    />
  )
}
