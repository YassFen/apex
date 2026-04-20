import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BenchmarksView } from '@/components/athlete/BenchmarksView'
import type { Profile, Benchmark } from '@/lib/types/database'

export default async function BenchmarksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')
  const { data: bms } = await supabase
    .from('benchmarks').select('*')
    .eq('user_id', user.id)
    .order('recorded_at', { ascending: false })
  return <BenchmarksView profile={profile} benchmarks={(bms ?? []) as Benchmark[]} />
}
