import { createClient } from '@/lib/supabase/server'
import { joinBoxByCode } from '@/lib/utils/join-box'
import { NextResponse } from 'next/server'

// Handles both Google OAuth and the "confirm your email" link.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const providerError = searchParams.get('error_description') ?? searchParams.get('error')

  if (providerError) {
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(providerError)}`)
  }
  if (!code) return NextResponse.redirect(`${origin}/auth/login`)

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    // Typical case: the confirmation link was opened in another browser or app
    // (e.g. the phone's mail app). Supabase already confirmed the email before
    // redirecting here, so the person only needs to sign in.
    return NextResponse.redirect(`${origin}/auth/login?confirmed=1`)
  }

  // Invite code typed at sign-up is applied once the account is confirmed.
  const pendingCode = data.user.user_metadata?.invite_code as string | undefined
  if (pendingCode) {
    await joinBoxByCode(supabase, pendingCode, data.user.id)
    await supabase.auth.updateUser({ data: { invite_code: null } })
  }

  // Only same-site relative paths, so the link can't bounce people to another domain.
  const next = searchParams.get('next')
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
  return NextResponse.redirect(`${origin}${safeNext}`)
}
