import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { redirect } from 'next/navigation'
import { BenchmarksView } from '@/components/athlete/BenchmarksView'
import type { Profile, Benchmark } from '@/lib/types/database'

export default async function BenchmarksPage() {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const p = await getProfile(user.id)
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')
  const { data: bms } = await supabase
    .from('benchmarks').select('*')
    .eq('user_id', user.id)
    .order('recorded_at', { ascending: false })
  return <BenchmarksView profile={profile} benchmarks={(bms ?? []) as Benchmark[]} />
}
