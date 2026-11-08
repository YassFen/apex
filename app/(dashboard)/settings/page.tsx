import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsHub } from '@/components/settings/SettingsHub'
import type { Profile } from '@/lib/types/database'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')
  const { data: box } = profile.role === 'coach'
    ? await supabase.from('boxes').select('id').eq('owner_id', user.id).maybeSingle()
    : { data: null }
  return <SettingsHub profile={profile} ownsBox={!!box} />
}
