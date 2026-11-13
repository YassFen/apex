'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/utils/errors'
import { Field, PasswordField, Alert, BrandMark, inputBase, labelCls } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

const MIN_LENGTH = 8

type Step = 'email' | 'code' | 'password'

/**
 * Password recovery with a one-time code sent by email (the Reset Password
 * template must include {{ .Token }}). The code works on any device, unlike
 * the PKCE link, which only works in the browser where it was requested.
 * `email` is set when the person is already signed in (e.g. they used the link).
 */
export function ResetPasswordForm({ email: sessionEmail, expired }: { email: string | null; expired: boolean }) {
  const router = useRouter()
  const [step, setStep]         = useState<Step>(sessionEmail ? 'password' : 'email')
  const [email, setEmail]       = useState(sessionEmail ?? '')
  const [code, setCode]         = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState(expired ? 'Ese enlace ya no sirve. Pide un código abajo; funciona en cualquier dispositivo.' : '')
  const [notice, setNotice]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault()
    setError(''); setNotice('')
    if (!email.trim()) { setError('Escribe tu email.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth/callback?next=/auth/reset-password`,
    })
    setLoading(false)
    if (error) { setError(friendlyError(error.message)); return }
    setCode('')
    setStep('code')
    setNotice(`Si existe una cuenta con ${email.trim()}, te llegó un código. Revisa también spam.`)
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setNotice('')
    const token = code.replace(/\D/g, '')
    if (token.length < 6) { setError('El código tiene 6 dígitos.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'recovery' })
    setLoading(false)
    if (error) {
      setError(/expired|invalid/i.test(error.message)
        ? 'Código incorrecto o vencido. Revisa que sea el del último correo, o pide uno nuevo.'
        : friendlyError(error.message))
      return
    }
    setStep('password')
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < MIN_LENGTH) { setError(`Usa al menos ${MIN_LENGTH} caracteres.`); return }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(/different from the old/i.test(error.message)
        ? 'La nueva contraseña debe ser distinta a la anterior.'
        : friendlyError(error.message))
      return
    }
    setDone(true)
    setTimeout(() => { router.push('/dashboard'); router.refresh() }, 1200)
  }

  const heading = step === 'password' ? 'Nueva contraseña' : 'Recuperar contraseña'
  const sub =
    step === 'email' ? 'Te enviamos un código de 6 dígitos a tu correo.' :
    step === 'code'  ? `Escribe el código que enviamos a ${email.trim()}.` :
                       `Para la cuenta ${email.trim()}.`

  return (
    <div className="animate-fade-up flex flex-col gap-7">
      <BrandMark />

      <div>
        <h1 className="font-display text-4xl font-bold text-balance tracking-tight">{heading}</h1>
        <p className="text-mu text-sm mt-1 break-words text-pretty">{sub}</p>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}

      {step === 'email' && (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          <Field
            label="Email" type="email" name="email" required autoComplete="email" inputMode="email" autoFocus
            spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com"
          />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" size="lg" disabled={loading} className="w-full">
            {loading ? 'Enviando…' : 'Enviar código'}
          </Button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verifyCode} className="flex flex-col gap-4">
          <div>
            <label htmlFor="reset-code" className={labelCls}>Código</label>
            <input
              id="reset-code" name="code" required autoFocus autoComplete="one-time-code"
              inputMode="numeric" pattern="[0-9]*" maxLength={8} placeholder="000000"
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              className={inputBase + ' h-16 text-center font-display text-4xl font-bold tracking-[0.3em] tabular-nums'}
            />
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" size="lg" disabled={loading} className="w-full">
            {loading ? 'Verificando…' : 'Continuar'}
          </Button>
          <div className="flex justify-between gap-3 text-sm">
            <button type="button" onClick={() => { setStep('email'); setError(''); setNotice('') }} className="font-semibold text-mu hover:text-t min-h-10">
              Cambiar email
            </button>
            <button type="button" onClick={() => sendCode()} disabled={loading} className="font-semibold text-ac hover:underline underline-offset-4 min-h-10">
              Reenviar código
            </button>
          </div>
        </form>
      )}

      {step === 'password' && (done ? (
        <Alert tone="success">Contraseña actualizada. Entrando a tu cuenta…</Alert>
      ) : (
        <form onSubmit={savePassword} className="flex flex-col gap-4">
          {/* Lets password managers save the new password under the right account. */}
          <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
          <PasswordField
            label="Nueva contraseña" name="new-password" required autoComplete="new-password" autoFocus
            minLength={MIN_LENGTH} value={password} onChange={e => setPassword(e.target.value)}
            hint={`Mínimo ${MIN_LENGTH} caracteres.`}
          />
          <PasswordField
            label="Repite la contraseña" name="confirm-password" required autoComplete="new-password"
            minLength={MIN_LENGTH} value={confirm} onChange={e => setConfirm(e.target.value)}
          />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" size="lg" disabled={loading} className="w-full">
            {loading ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </form>
      ))}

      {step !== 'password' && (
        <p className="text-center text-sm text-mu">
          <Link href="/auth/login" className="text-ac font-semibold hover:underline underline-offset-4">Volver a iniciar sesión</Link>
        </p>
      )}
    </div>
  )
}
