import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PRsView } from '@/components/athlete/PRsView'
import type { Profile, Movement } from '@/lib/types/database'

export default async function PRsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  const { data: rawPrs } = await supabase
    .from('pr_records')
    .select('*, movements(id, name, category)')
    .eq('user_id', user.id)
    .order('recorded_at', { ascending: false })

  const { data: movs } = await supabase.from('movements').select('*').order('category').order('name')

  return (
    <PRsView
      profile={profile}
      prs={(rawPrs ?? []) as any[]}
      movements={(movs ?? []) as Movement[]}
    />
  )
}
