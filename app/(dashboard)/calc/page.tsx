import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RMCalcView } from '@/components/athlete/RMCalcView'
import type { Profile } from '@/lib/types/database'

export default async function CalcPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')
  const { data: rawPrs } = await supabase
    .from('pr_records')
    .select('*, movements(name)')
    .eq('user_id', user.id)
    .eq('is_pr', true)
  return <RMCalcView profile={profile} prs={(rawPrs ?? []) as any[]} />
}
