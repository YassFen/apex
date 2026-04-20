import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsView } from '@/components/athlete/SettingsView'
import type { Profile } from '@/lib/types/database'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  const { data: memberships } = await supabase
    .from('box_members')
    .select('*, boxes(id, name, city, country, invite_code)')
    .eq('user_id', user.id)
    .eq('is_active', true)

  return <SettingsView profile={profile} memberships={(memberships ?? []) as any[]} />
}
