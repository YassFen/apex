import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { notFound, redirect } from 'next/navigation'
import { SettingsView } from '@/components/athlete/SettingsView'
import { SECTION_TITLE, type SettingsSection } from '@/lib/constants/settings'
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

  // Each section loads only what it shows, all at once (appearance, security… need nothing extra).
  const none = Promise.resolve({ data: null })
  const [{ data: memberships }, { data: movementsRaw }, { data: prsRaw }, { data: b }] = await Promise.all([
    section === 'boxes' || section === 'profile'
      ? supabase.from('box_members').select('*, boxes(id, name, city, country, invite_code, logo_url)').eq('user_id', user.id).eq('is_active', true)
      : none,
    section === 'profile' ? supabase.from('movements').select('id, name, category').order('category').order('name') : none,
    section === 'athletic' ? supabase.from('pr_records').select('metric, value_lb, movements(name, category)').eq('user_id', user.id).eq('is_pr', true) : none,
    section === 'box' && profile.role === 'coach' ? supabase.from('boxes').select('*').eq('owner_id', profile.id).limit(1).maybeSingle() : none,
  ])
  const ownedBox = (b ?? null) as Box | null

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
