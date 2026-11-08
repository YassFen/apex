import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { notFound, redirect } from 'next/navigation'
import { SettingsView, SECTION_TITLE, type SettingsSection } from '@/components/athlete/SettingsView'
import type { Profile, Movement, Box } from '@/lib/types/database'

export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!(section in SECTION_TITLE)) notFound()

  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const p = await getProfile(user.id)
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  const { data: memberships } = await supabase
    .from('box_members')
    .select('*, boxes(id, name, city, country, invite_code, logo_url)')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const { data: movementsRaw } = await supabase
    .from('movements').select('id, name, category').order('category').order('name')

  const { data: prsRaw } = await supabase
    .from('pr_records')
    .select('metric, value_lb, movements(name, category)')
    .eq('user_id', user.id)
    .eq('is_pr', true)

  let ownedBox: Box | null = null
  if (profile.role === 'coach') {
    const { data: b } = await supabase
      .from('boxes').select('*').eq('owner_id', profile.id).maybeSingle()
    ownedBox = b as Box | null
  }

  return (
    <SettingsView
      section={section as SettingsSection}
      profile={profile}
      memberships={(memberships ?? []) as any[]}
      movements={(movementsRaw ?? []) as Movement[]}
      prs={(prsRaw ?? []) as any[]}
      ownedBox={ownedBox}
    />
  )
}
