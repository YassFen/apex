import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { redirect } from 'next/navigation'
import { SettingsHub } from '@/components/settings/SettingsHub'
import type { Profile } from '@/lib/types/database'

export default async function SettingsPage() {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const p = await getProfile(user.id)
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')
  const { data: box } = profile.role === 'coach'
    ? await supabase.from('boxes').select('id').eq('owner_id', user.id).maybeSingle()
    : { data: null }
  return <SettingsHub profile={profile} ownsBox={!!box} />
}
