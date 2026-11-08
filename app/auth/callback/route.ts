import { createClient } from '@/lib/supabase/server'
import { joinBoxByCode } from '@/lib/utils/join-box'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

const RESET_PATH = '/auth/reset-password'

// Handles Google OAuth, the "confirm your email" link and the password reset link.
// Supports both the PKCE `code` link (default email templates) and the
// `token_hash` link, which also works when opened in another browser or the phone's mail app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const otpType = searchParams.get('type') as EmailOtpType | null
  const providerError = searchParams.get('error_description') ?? searchParams.get('error')

  // Only same-site relative paths, so the link can't bounce people to another domain.
  const next = searchParams.get('next')
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null
  const isRecovery = otpType === 'recovery' || safeNext === RESET_PATH

  if (providerError) {
    const target = isRecovery ? `${origin}${RESET_PATH}` : `${origin}/auth/login`
    return NextResponse.redirect(`${target}?error=${encodeURIComponent(providerError)}`)
  }
  if (!code && !tokenHash) return NextResponse.redirect(`${origin}/auth/login`)

  const supabase = await createClient()
  const { data, error } = tokenHash && otpType
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType })
    : await supabase.auth.exchangeCodeForSession(code ?? '')

  if (error || !data.user) {
    // A reset link only works once and, with the PKCE link, only in the browser
    // where it was requested. Send the person to the reset page to ask for a new one.
    if (isRecovery) return NextResponse.redirect(`${origin}${RESET_PATH}?expired=1`)
    // Typical case: the confirmation link was opened in another browser or app
    // (e.g. the phone's mail app). Supabase already confirmed the email before
    // redirecting here, so the person only needs to sign in.
    return NextResponse.redirect(`${origin}/auth/login?confirmed=1`)
  }

  if (isRecovery) return NextResponse.redirect(`${origin}${RESET_PATH}`)

  // Invite code typed at sign-up is applied once the account is confirmed.
  const pendingCode = data.user.user_metadata?.invite_code as string | undefined
  if (pendingCode) {
    await joinBoxByCode(supabase, pendingCode, data.user.id)
    await supabase.auth.updateUser({ data: { invite_code: null } })
  }

  // When the redirect URL isn't allow-listed, Supabase drops `next` and lands on
  // the Site URL. A reset requested in the last hour means this was a reset link.
  const recoverySent = data.user.recovery_sent_at ? Date.parse(data.user.recovery_sent_at) : 0
  if (!safeNext && Date.now() - recoverySent < 60 * 60 * 1000) {
    return NextResponse.redirect(`${origin}${RESET_PATH}`)
  }

  return NextResponse.redirect(`${origin}${safeNext ?? '/dashboard'}`)
}
