'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep]           = useState<1 | 2>(1)
  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [role, setRole]           = useState<'athlete' | 'coach'>('athlete')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name, role } },
    })
    if (signUpErr || !data.user) { setError(signUpErr?.message ?? 'Error al registrar'); setLoading(false); return }

    // If athlete with invite code, join box
    if (role === 'athlete' && inviteCode.trim()) {
      const { data: box } = await supabase
        .from('boxes').select('id').eq('invite_code', inviteCode.trim().toUpperCase()).single()
      if (box) {
        await supabase.from('box_members').insert({ box_id: box.id, user_id: data.user.id, role: 'athlete', is_active: true })
      }
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-ac grid place-items-center font-barlow text-2xl font-black text-bg">A</div>
        <div className="font-barlow text-3xl font-black tracking-widest">AP<span className="text-ac">E</span>X</div>
      </div>

      <h1 className="font-barlow text-3xl font-black tracking-wide mb-1">CREAR CUENTA</h1>
      <p className="text-mu text-sm mb-6">Únete a la plataforma CrossFit</p>

      {/* Role selector */}
      <div className="flex gap-3 mb-6">
        {(['athlete', 'coach'] as const).map(r => (
          <button key={r} onClick={() => setRole(r)}
            className={`flex-1 py-3 rounded-xl border font-bold text-sm transition-all ${
              role === r
                ? 'bg-ac/10 border-ac/40 text-ac'
                : 'border-[var(--ln2)] text-mu hover:text-t hover:border-mu'
            }`}
          >
            {r === 'athlete' ? '🏋️ Atleta' : '📋 Coach / Box'}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rd/10 border border-rd/20 text-rd text-sm font-semibold">{error}</div>
      )}

      <form onSubmit={handleRegister} className="flex flex-col gap-4">
        <div>
          <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Nombre completo</label>
          <input required value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac transition-colors"
            placeholder="Tu nombre" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Email</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac transition-colors"
            placeholder="tu@email.com" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Contraseña</label>
          <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac transition-colors"
            placeholder="Mínimo 8 caracteres" />
        </div>

        {role === 'athlete' && (
          <div>
            <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
              Código de box <span className="text-fa normal-case">(opcional)</span>
            </label>
            <input value={inviteCode} onChange={e => setInviteCode(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac transition-colors uppercase tracking-widest"
              placeholder="XXXXXXXX" maxLength={8} />
          </div>
        )}

        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-xl bg-ac text-bg font-bold text-sm transition-all active:scale-95 disabled:opacity-60 mt-1">
          {loading ? 'Creando cuenta...' : 'Crear cuenta'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-mu">
        ¿Ya tienes cuenta?{' '}
        <Link href="/auth/login" className="text-ac font-semibold hover:underline">Iniciar sesión</Link>
      </p>
    </div>
  )
}
