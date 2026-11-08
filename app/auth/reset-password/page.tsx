export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { ResetPasswordForm } from './ResetPasswordForm'

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ expired?: string; error?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <ResetPasswordForm
      email={user?.email ?? null}
      expired={sp.expired === '1' || !!sp.error}
    />
  )
}
