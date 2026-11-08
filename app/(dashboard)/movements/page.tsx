import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { coachBoxesFor } from '@/lib/utils/coach-boxes'
import { MovementsView } from '@/components/movements/MovementsView'
import type { Movement, Profile } from '@/lib/types/database'

export default async function MovementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  const [{ data: movs }, { data: prs }, coachBoxes] = await Promise.all([
    supabase.from('movements').select('*').order('name'),
    supabase.from('pr_records').select('metric, value_lb, movements(name)').eq('user_id', user.id).eq('is_pr', true),
    coachBoxesFor(supabase, user.id),
  ])

  const records: Record<string, { metric: string; valueLb: number }[]> = {}
  for (const r of (prs ?? []) as any[]) {
    const n = r.movements?.name
    if (!n) continue
    ;(records[n] ??= []).push({ metric: r.metric, valueLb: Number(r.value_lb) })
  }

  return <MovementsView profile={profile} movements={(movs ?? []) as Movement[]} records={records} coachBoxes={coachBoxes} />
}
