import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WelcomeView } from '@/components/auth/WelcomeView'

export const dynamic = 'force-dynamic'

export default async function WelcomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')
  return <WelcomeView />
}
