'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Dumbbell, ClipboardList, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/utils/errors'
import { joinBoxByCode } from '@/lib/utils/join-box'
import { Field, PasswordField, Alert, BrandMark } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils/cn'

const ROLES = [
  { value: 'athlete', label: 'Atleta', sub: 'Registro mis marcas', icon: Dumbbell },
  { value: 'coach',   label: 'Coach / Box', sub: 'Publico WODs', icon: ClipboardList },
] as const

export function RegisterForm() {
  const router = useRouter()
  const [name, setName]             = useState('')
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [role, setRole]             = useState<'athlete' | 'coach'>('athlete')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [sentTo, setSentTo]         = useState('')

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    setLoading(true); setError('')
    const supabase = createClient()
    const code = role === 'athlete' ? inviteCode.trim().toUpperCase() : ''

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
        // invite_code is applied in /auth/callback once the email is confirmed
        data: { full_name: name.trim(), role, ...(code ? { invite_code: code } : {}) },
      },
    })
    if (signUpErr || !data.user) {
      setError(friendlyError(signUpErr?.message ?? 'No se pudo crear la cuenta'))
      setLoading(false)
      return
    }

    // Supabase returns a user with no identities when the email is already taken
    if (data.user.identities && data.user.identities.length === 0) {
      setError(friendlyError('User already registered'))
      setLoading(false)
      return
    }

    // Email confirmation is on: there is no session yet, so say so instead of
    // bouncing to /dashboard (the middleware would send them back to login).
    if (!data.session) {
      setSentTo(email.trim())
      setLoading(false)
      return
    }

    if (code) await joinBoxByCode(supabase, code, data.user.id)
    router.push('/dashboard')
    router.refresh()
  }

  if (sentTo) {
    return (
      <div className="animate-fade-up flex flex-col gap-6">
        <BrandMark />
        <div className="size-14 rounded-2xl bg-p2 grid place-items-center text-ac">
          <MailCheck size={28} aria-hidden />
        </div>
        <div>
          <h1 className="font-barlow text-4xl font-black tracking-wide uppercase text-balance">Revisa tu correo</h1>
          <p className="text-mu text-sm mt-2 text-pretty">
            Enviamos un enlace de confirmación a <span className="text-t font-semibold">{sentTo}</span>.
            Ábrelo para activar tu cuenta y luego inicia sesión. Si no lo ves, revisa spam o promociones.
          </p>
        </div>
        <Link
          href={`/auth/login?email=${encodeURIComponent(sentTo)}`}
          className="h-12 rounded-full bg-ac text-bg font-bold grid place-items-center hover:bg-[#b8e030] active:scale-[0.96] transition-[transform,background-color]"
        >
          Ir a iniciar sesión
        </Link>
      </div>
    )
  }

  return (
    <div className="animate-fade-up flex flex-col gap-7">
      <BrandMark />

      <div>
        <h1 className="font-barlow text-4xl font-black tracking-wide uppercase text-balance">Crear cuenta</h1>
        <p className="text-mu text-sm mt-1">Tus marcas y el WOD de tu box en un solo lugar.</p>
      </div>

      <fieldset>
        <legend className="block text-[11px] uppercase tracking-[1.4px] text-mu font-bold mb-2">Soy</legend>
        <div className="grid grid-cols-2 gap-3">
          {ROLES.map(r => {
            const Icon = r.icon
            const active = role === r.value
            return (
              <button
                key={r.value} type="button" onClick={() => setRole(r.value)} aria-pressed={active}
                className={cn(
                  'flex flex-col items-start gap-2 p-3.5 rounded-2xl text-left transition-[background-color,box-shadow] active:scale-[0.96]',
                  active ? 'bg-ac/15 ring-1 ring-inset ring-ac/50' : 'bg-p2 hover:bg-p3',
                )}
              >
                <Icon size={18} className={active ? 'text-ac' : 'text-mu'} aria-hidden />
                <span>
                  <span className={cn('block font-bold text-sm', active ? 'text-ac' : 'text-t')}>{r.label}</span>
                  <span className="block text-xs text-mu">{r.sub}</span>
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      {error && <Alert tone="error">{error}</Alert>}

      <form onSubmit={handleRegister} className="flex flex-col gap-4">
        <Field label="Nombre completo" name="name" required autoComplete="name"
          value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Camila Rojas" />
        <Field label="Email" type="email" name="email" required autoComplete="email" inputMode="email"
          spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />
        <PasswordField label="Contraseña" name="password" required minLength={8} autoComplete="new-password"
          value={password} onChange={e => setPassword(e.target.value)} hint="Mínimo 8 caracteres." />

        {role === 'athlete' && (
          <Field
            label={<>Código de box <span className="text-fa normal-case tracking-normal font-normal">(opcional)</span></>}
            name="invite-code" autoComplete="off" spellCheck={false} maxLength={8}
            value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
            placeholder="Ej. A1B2C3D4" className="uppercase tracking-[3px] font-barlow font-bold"
            hint="Te lo da tu coach. También puedes ingresarlo después en tu perfil."
          />
        )}

        <Button type="submit" size="lg" disabled={loading} className="w-full mt-1">
          {loading ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </form>

      <p className="text-center text-sm text-mu">
        ¿Ya tienes cuenta?{' '}
        <Link href="/auth/login" className="text-ac font-semibold hover:underline underline-offset-4">Iniciar sesión</Link>
      </p>
    </div>
  )
}
