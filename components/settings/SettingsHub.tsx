'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  UserCircle, Barbell, ShieldCheck, Buildings, UsersThree, ChartPolar, PaintBrush, Bell, Lock,
  SquaresFour, CaretRight, SignOut, ArrowsLeftRight, BookOpenText,
} from '@/components/ui/icons'
import { Topbar } from '@/components/layout/Topbar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useShell } from '@/lib/hooks/useShell'
import { createClient } from '@/lib/supabase/client'
import { roleLabel } from '@/lib/utils/cn'
import { APP_VERSION } from '@/lib/constants/version'
import type { Profile } from '@/lib/types/database'

type Row = { href?: string; onClick?: () => void; icon: typeof Bell; tone: string; label: string; hint?: string }

/** iOS-style grouped settings list. Each row opens its own screen (/settings/[section]). */
export function SettingsHub({ profile, ownsBox }: { profile: Profile; ownsBox: boolean }) {
  const router = useRouter()
  const { canSwitchMode, viewMode, setViewMode } = useShell()
  const [confirmOut, setConfirmOut] = useState(false)
  const [busy, setBusy] = useState(false)
  const initials = profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  async function signOut() {
    setBusy(true)
    await createClient().auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const groups: { title: string; rows: Row[] }[] = [
    { title: 'Entrenamiento', rows: [
      { href: '/settings/training', icon: Barbell, tone: 'bg-or', label: 'Unidades y categoría', hint: `${profile.preferred_unit} · ${profile.sex === 'f' ? 'Femenino' : profile.sex === 'm' ? 'Masculino' : 'Sin definir'}` },
      { href: '/settings/athletic', icon: ChartPolar, tone: 'bg-pu', label: 'Perfil atlético' },
      { href: '/movements', icon: BookOpenText, tone: 'bg-gr', label: 'Biblioteca de ejercicios' },
    ]},
    { title: 'Box', rows: [
      ...(ownsBox ? [{ href: '/settings/box', icon: Buildings, tone: 'bg-bl', label: 'Datos de mi box' }] : []),
      { href: '/settings/boxes', icon: UsersThree, tone: 'bg-ac', label: 'Mis boxes', hint: 'Unirme a otro' },
      ...(canSwitchMode ? [{ onClick: () => setViewMode(viewMode === 'coach' ? 'athlete' : 'coach'), icon: ArrowsLeftRight, tone: 'bg-mu', label: `Cambiar a modo ${viewMode === 'coach' ? 'atleta' : 'coach'}` }] : []),
    ]},
    { title: 'App', rows: [
      { href: '/dashboard?edit=1', icon: SquaresFour, tone: 'bg-ac', label: 'Personalizar Inicio', hint: 'Orden y widgets' },
      { href: '/settings/appearance', icon: PaintBrush, tone: 'bg-pu', label: 'Apariencia', hint: 'Modo y color' },
      { href: '/settings/notifications', icon: Bell, tone: 'bg-rd', label: 'Avisos' },
    ]},
    { title: 'Cuenta', rows: [
      { href: '/settings/privacy', icon: Lock, tone: 'bg-bl', label: 'Privacidad', hint: profile.profile_public ? 'Perfil público' : 'Perfil privado' },
      { href: '/settings/security', icon: ShieldCheck, tone: 'bg-gr', label: 'Contraseña y sesión' },
    ]},
  ]

  return (
    <>
      <Topbar title="Configuración" profile={profile} />
      <div className="p-4 lg:p-6 flex flex-col gap-6 max-w-2xl w-full mx-auto">
        <Link href="/settings/profile" className="tap-card flex items-center gap-4 p-4 rounded-[24px] bg-p">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" className="size-16 rounded-[20px] object-cover" />
            : <span className="size-16 rounded-[20px] bg-gradient-to-br from-ac to-bl grid place-items-center text-xl font-bold text-onac">{initials}</span>}
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl font-bold tracking-tight truncate">{profile.full_name}</span>
            <span className="block text-mu text-sm truncate">{roleLabel(profile.role)} · Editar perfil</span>
          </span>
          <CaretRight size={18} className="text-fa" />
        </Link>

        {groups.map(g => g.rows.length > 0 && (
          <section key={g.title}>
            <h2 className="text-[13px] text-mu font-medium px-4 mb-2">{g.title}</h2>
            <ul className="rounded-[24px] bg-p overflow-hidden divide-y divide-[var(--ln)]">
              {g.rows.map(r => {
                const inner = (
                  <>
                    <span className={`size-8 rounded-[10px] grid place-items-center text-white ${r.tone}`}><r.icon size={18} weight="fill" aria-hidden /></span>
                    <span className="flex-1 min-w-0 text-[15px] font-medium truncate">{r.label}</span>
                    {r.hint && <span className="text-mu text-sm truncate max-w-[40%]">{r.hint}</span>}
                    <CaretRight size={16} className="text-fa flex-shrink-0" aria-hidden />
                  </>
                )
                const cls = 'flex items-center gap-3.5 px-4 h-[56px] w-full text-left hover:bg-p2 active:bg-p3 transition-colors'
                return (
                  <li key={r.label}>
                    {r.href ? <Link href={r.href} className={cls}>{inner}</Link> : <button type="button" onClick={r.onClick} className={cls}>{inner}</button>}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        <button type="button" onClick={() => setConfirmOut(true)}
          className="flex items-center justify-center gap-2 h-[56px] rounded-[24px] bg-p text-rd font-semibold hover:bg-p2 transition-colors">
          <SignOut size={18} aria-hidden /> Cerrar sesión
        </button>
        <p className="text-center text-xs text-fa">APEX {APP_VERSION} · {profile.email}</p>
      </div>
      <ConfirmDialog open={confirmOut} title="¿Cerrar sesión?" body="Tendrás que volver a ingresar tu email y contraseña." confirmLabel="Cerrar sesión" danger busy={busy}
        onConfirm={signOut} onClose={() => setConfirmOut(false)} />
    </>
  )
}
