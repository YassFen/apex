// Server-side guard and shared types for the application panel (/admin).
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import type { Profile } from '@/lib/types/database'
import type { Usage } from '@/lib/utils/platform-shared'

/** Only accounts listed in platform_admins get in (added by hand in SQL, never from the app). */
export async function requirePlatformAdmin(): Promise<{ supabase: any; userId: string; profile: Profile }> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const profile = await getProfile(user.id)
  if (!profile) redirect('/auth/login')
  const { data, error } = await supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (error || !data) redirect('/dashboard')
  return { supabase, userId: user.id, profile }
}

export async function loadUsage(supabase: any, days: number): Promise<Usage | null> {
  const [{ data, error }, people] = await Promise.all([
    supabase.rpc('admin_usage', { p_days: days }),
    supabase.rpc('admin_period_users', { p_days: days }),
  ])
  if (error || !data) return null
  const u = data as Usage
  if (!people.error && people.data !== null) u.totals.period_users = Number(people.data)
  return u
}
