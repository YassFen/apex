import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { SupportView, type MyTicket } from '@/components/support/SupportView'
import { isMissingTable } from '@/lib/utils/errors'

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const profile = await getProfile(user.id)
  if (!profile) redirect('/auth/login')
  const { data, error } = await supabase.from('support_tickets')
    .select('id, kind, message, status, reply, replied_at, seen_reply, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30)
  return <SupportView profile={profile} tickets={(data ?? []) as MyTicket[]} missing={isMissingTable(error)} openNew={sp.new === '1'} />
}
