import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PublishWodPanel } from '@/components/coach/PublishWodPanel'
import type { Profile, Box, Movement } from '@/lib/types/database'

export default async function PublishWodPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile || profile.role !== 'coach') redirect('/dashboard')

  const { data: b } = await supabase.from('boxes').select('*').eq('owner_id', user.id).single()
  const box = b as Box | null
  if (!box) redirect('/dashboard')

  const { data: movs } = await supabase.from('movements').select('*').order('category').order('name')
  const today = new Date().toISOString().split('T')[0]
  const { data: todayWod } = await supabase
    .from('daily_wods').select('*').eq('box_id', box.id).eq('scheduled_for', today).single()

  return (
    <PublishWodPanel
      profile={profile}
      box={box}
      movements={(movs ?? []) as Movement[]}
      todayWod={todayWod ?? null}
    />
  )
}
