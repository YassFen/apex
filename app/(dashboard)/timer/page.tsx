import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TimerView } from '@/components/athlete/TimerView'
import type { Profile } from '@/lib/types/database'

export default async function TimerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')
  return <TimerView profile={profile} />
}
