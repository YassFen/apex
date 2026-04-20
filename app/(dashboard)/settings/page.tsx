import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsView } from '@/components/athlete/SettingsView'
import type { Profile, Movement, Box } from '@/lib/types/database'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  const { data: memberships } = await supabase
    .from('box_members')
    .select('*, boxes(id, name, city, country, invite_code, logo_url)')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const { data: movementsRaw } = await supabase
    .from('movements').select('id, name, category').order('category').order('name')

  let ownedBox: Box | null = null
  if (profile.role === 'coach') {
    const { data: b } = await supabase
      .from('boxes').select('*').eq('owner_id', profile.id).maybeSingle()
    ownedBox = b as Box | null
  }

  return (
    <SettingsView
      profile={profile}
      memberships={(memberships ?? []) as any[]}
      movements={(movementsRaw ?? []) as Movement[]}
      ownedBox={ownedBox}
    />
  )
}
