'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/utils/errors'
import { Field, PasswordField, Alert, BrandMark } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

const MIN_LENGTH = 8

/** `email` is set when the reset link already signed the person in. */
export function ResetPasswordForm({ email, expired }: { email: string | null; expired: boolean }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)

  const [requestEmail, setRequestEmail] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSave(e: React.FormEvent) {
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

  async function requestLink(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!requestEmail.trim()) { setError('Escribe tu email.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(requestEmail.trim(), {
      redirectTo: `${location.origin}/auth/callback?next=/auth/reset-password`,
    })
    setLoading(false)
    if (error) { setError(friendlyError(error.message)); return }
    setSent(true)
  }

  return (
    <div className="animate-fade-up flex flex-col gap-7">
      <BrandMark />

      {email ? (
        <>
          <div>
            <h1 className="font-barlow text-4xl font-black tracking-wide uppercase text-balance">Nueva contraseña</h1>
            <p className="text-mu text-sm mt-1 break-words">Para la cuenta {email}.</p>
          </div>

          {done ? (
            <Alert tone="success">Contraseña actualizada. Entrando a tu cuenta…</Alert>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col gap-4">
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
          )}
        </>
      ) : (
        <>
          <div>
            <h1 className="font-barlow text-4xl font-black tracking-wide uppercase text-balance">Recuperar contraseña</h1>
            <p className="text-mu text-sm mt-1 text-pretty">Te enviamos un enlace por correo para elegir una nueva.</p>
          </div>

          {expired && !sent && (
            <Alert tone="error">
              El enlace expiró o ya se usó. También falla si lo abres en otro navegador o app distinta a donde lo pediste. Pide uno nuevo abajo y ábrelo en este mismo navegador.
            </Alert>
          )}

          {sent ? (
            <Alert tone="success">
              Si existe una cuenta con {requestEmail.trim()}, te llegará un enlace. Ábrelo en este mismo navegador.
            </Alert>
          ) : (
            <form onSubmit={requestLink} className="flex flex-col gap-4">
              <Field
                label="Email" type="email" name="email" required autoComplete="email" inputMode="email"
                spellCheck={false} value={requestEmail} onChange={e => setRequestEmail(e.target.value)} placeholder="tu@email.com"
              />
              {error && <Alert tone="error">{error}</Alert>}
              <Button type="submit" size="lg" disabled={loading} className="w-full">
                {loading ? 'Enviando…' : 'Enviar enlace'}
              </Button>
            </form>
          )}
        </>
      )}

      <p className="text-center text-sm text-mu">
        <Link href={email ? '/dashboard' : '/auth/login'} className="text-ac font-semibold hover:underline underline-offset-4">
          {email ? 'Ir a mi cuenta' : 'Volver a iniciar sesión'}
        </Link>
      </p>
    </div>
  )
}
