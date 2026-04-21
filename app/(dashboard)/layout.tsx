import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/DashboardShell'
import type { Box } from '@/lib/types/database'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  if (!profile) redirect('/auth/login')

  // Load all boxes this user belongs to (as owner or member)
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase.from('boxes').select('*').eq('owner_id', user.id),
    supabase.from('box_members').select('box_id, boxes(*)').eq('user_id', user.id).eq('is_active', true),
  ])

  const boxMap = new Map<string, Box>()
  ;(owned ?? []).forEach((b: any) => { if (b?.id) boxMap.set(b.id, b as Box) })
  ;(memberships ?? []).forEach((m: any) => {
    const b = m.boxes
    if (b?.id) boxMap.set(b.id, b as Box)
  })
  const boxes = Array.from(boxMap.values())

  return <DashboardShell profile={profile as any} boxes={boxes}>{children}</DashboardShell>
}
