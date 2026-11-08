import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { loadChallenges } from '@/lib/utils/challenges'
import { todayISO } from '@/lib/utils/dates'
import { ChallengesView } from '@/components/challenges/ChallengesView'
import type { Profile } from '@/lib/types/database'

export default async function ChallengesPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  const [{ data: owned }, { data: members }] = await Promise.all([
    supabase.from('boxes').select('id, name').eq('owner_id', user.id),
    supabase.from('box_members').select('boxes(id, name)').eq('user_id', user.id).eq('is_active', true),
  ])
  const boxMap = new Map<string, { id: string; name: string }>()
  for (const b of (owned ?? []) as any[]) boxMap.set(b.id, { id: b.id, name: b.name })
  for (const m of (members ?? []) as any[]) if (m.boxes?.id) boxMap.set(m.boxes.id, { id: m.boxes.id, name: m.boxes.name })
  const boxes = [...boxMap.values()]

  const { data: movs } = await supabase.from('movements').select('name').order('name')
  const challenges = await loadChallenges(supabase, user.id, boxes.map(b => b.id))
  const { open } = await searchParams

  return <ChallengesView profile={profile} boxes={boxes} challenges={challenges} today={todayISO()} openId={open ?? null}
    movementNames={((movs ?? []) as any[]).map(m => m.name as string)} />
}
