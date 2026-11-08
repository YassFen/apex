'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/utils/errors'
import { Field, PasswordField, Alert, BrandMark } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

export function LoginForm({ confirmed = false, initialError = '', initialEmail = '' }: {
  confirmed?: boolean; initialError?: string; initialEmail?: string
}) {
  const router = useRouter()
  const [email, setEmail]       = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(initialError ? friendlyError(initialError) : '')
  const [notice, setNotice]     = useState(confirmed ? 'Correo confirmado. Ya puedes iniciar sesión.' : '')
  const [loading, setLoading]   = useState(false)
  const [needsConfirm, setNeedsConfirm] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(''); setNotice(''); setNeedsConfirm(false)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setError(friendlyError(error.message))
      setNeedsConfirm(error.message.includes('Email not confirmed'))
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  async function resendConfirmation() {
    if (!email.trim()) { setError('Escribe tu email arriba para reenviarte el correo.'); return }
    const supabase = createClient()
    const { error } = await supabase.auth.resend({
      type: 'signup', email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    if (error) { setError(friendlyError(error.message)); return }
    setError(''); setNeedsConfirm(false)
    setNotice(`Te reenviamos el correo de confirmación a ${email.trim()}.`)
  }

  async function handleGoogle() {
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
    if (error) setError(friendlyError(error.message))
  }

  return (
    <div className="animate-fade-up flex flex-col gap-7">
      <BrandMark />

      <div>
        <h1 className="font-barlow text-4xl font-black tracking-wide uppercase text-balance">Bienvenido</h1>
        <p className="text-mu text-sm mt-1">Entra para ver el WOD de hoy y tus récords.</p>
      </div>

      {(error || notice) && (
        <div className="flex flex-col gap-2">
          {notice && <Alert tone="success">{notice}</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
          {needsConfirm && (
            <button type="button" onClick={resendConfirmation} className="self-start text-sm font-semibold text-ac hover:underline underline-offset-4 min-h-10">
              Reenviar correo de confirmación
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleLogin} className="flex flex-col gap-4" noValidate={false}>
        <Field
          label="Email" type="email" name="email" required autoComplete="email" inputMode="email"
          spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com"
        />
        <PasswordField
          label="Contraseña" name="password" required autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)}
        />
        <Link href="/auth/reset-password" className="self-end -mt-2 text-xs font-semibold text-mu hover:text-t min-h-10 grid place-items-center">
          ¿Olvidaste tu contraseña?
        </Link>
        <Button type="submit" size="lg" disabled={loading} className="w-full">
          {loading ? 'Entrando…' : 'Iniciar sesión'}
        </Button>
      </form>

      <div className="flex items-center gap-3" aria-hidden>
        <div className="flex-1 h-px bg-p3" />
        <span className="text-fa text-xs">o</span>
        <div className="flex-1 h-px bg-p3" />
      </div>

      <Button type="button" variant="secondary" size="lg" onClick={handleGoogle} className="w-full">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continuar con Google
      </Button>

      <p className="text-center text-sm text-mu">
        ¿Sin cuenta?{' '}
        <Link href="/auth/register" className="text-ac font-semibold hover:underline underline-offset-4">Regístrate</Link>
      </p>
    </div>
  )
}
