'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, TrendingUp, Timer, Flame, Activity,
  BarChart3, Calculator, Users, User, Trophy, Dumbbell,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { Profile } from '@/lib/types/database'

const ATHLETE_NAV = [
  { label: 'Training', items: [
    { href: '/dashboard',    icon: LayoutGrid, label: 'Dashboard' },
    { href: '/prs',          icon: TrendingUp, label: 'Historial & RMs' },
    { href: '/benchmarks',   icon: Trophy,     label: 'Benchmarks' },
  ]},
  { label: 'Build', items: [
    { href: '/wod',          icon: Flame,      label: 'WOD del Día', dot: true },
    { href: '/timer',        icon: Timer,      label: 'Timer' },
  ]},
  { label: 'Stats', items: [
    { href: '/analytics',    icon: BarChart3,  label: 'Analytics' },
    { href: '/calc',         icon: Calculator, label: 'Calculadora RM' },
  ]},
  { label: 'Cuenta', items: [
    { href: '/settings',     icon: User,       label: 'Mi Perfil' },
  ]},
]

const COACH_NAV = [
  { label: 'Box', items: [
    { href: '/dashboard',           icon: LayoutGrid, label: 'Dashboard' },
    { href: '/coach/publish-wod',   icon: Flame,      label: 'Publicar WOD' },
    { href: '/coach/wod-live',      icon: Activity,   label: 'Seguimiento WOD', dot: true },
    { href: '/coach/athletes',      icon: Users,      label: 'Atletas' },
    { href: '/analytics',           icon: BarChart3,  label: 'Analytics' },
  ]},
  { label: 'Herramientas', items: [
    { href: '/calc',                icon: Calculator, label: 'Calculadora RM' },
    { href: '/timer',               icon: Timer,      label: 'Timer' },
  ]},
  { label: 'Cuenta', items: [
    { href: '/settings',            icon: User,       label: 'Mi Perfil' },
  ]},
]

export function Sidebar({ profile, isOpen, onClose }: { profile: Profile; isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const nav = profile.role === 'coach' ? COACH_NAV : ATHLETE_NAV
  const initials = profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-[29] lg:hidden" onClick={onClose} />
      )}

      <aside className={cn(
        'fixed top-0 left-0 bottom-0 w-[240px] bg-gradient-to-b from-[#0e1117] to-[#111620] border-r border-[var(--ln)] flex flex-col z-30 transition-transform duration-[280ms]',
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        <div className="px-5 py-[22px] border-b border-[var(--ln)] flex items-center gap-3">
          <div className="w-[38px] h-[38px] rounded-xl bg-ac grid place-items-center flex-shrink-0">
            <Dumbbell size={20} className="text-bg" strokeWidth={2.5} />
          </div>
          <div className="font-barlow text-[26px] font-black tracking-[3px]">AP<span className="text-ac">E</span>X</div>
        </div>

        <nav className="flex-1 py-4 px-2.5 overflow-y-auto flex flex-col gap-1">
          {nav.map(group => (
            <div key={group.label}>
              <div className="px-2.5 pt-3 pb-1 text-[10px] uppercase tracking-[2px] text-fa font-bold">{group.label}</div>
              {group.items.map(item => {
                const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                const Icon = item.icon
                return (
                  <Link
                    key={item.href} href={item.href} onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 px-3 py-[11px] rounded-xl text-[13px] font-medium border transition-all duration-[180ms]',
                      active
                        ? 'bg-ac/[0.11] border-ac/20 text-ac font-bold'
                        : 'border-transparent text-mu hover:bg-p2 hover:text-t'
                    )}
                  >
                    <Icon size={17} strokeWidth={active ? 2.3 : 1.9} className={active ? 'opacity-100' : 'opacity-80'} />
                    {item.label}
                    {(item as any).dot && !active && (
                      <span className="ml-auto w-[7px] h-[7px] rounded-full bg-ac animate-pulse" />
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <Link
          href="/settings" onClick={onClose}
          className="px-5 py-4 border-t border-[var(--ln)] flex items-center gap-2.5 hover:bg-p2 transition-colors"
        >
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-ac to-bl grid place-items-center font-black text-sm text-bg flex-shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm leading-tight truncate">{profile.full_name.split(' ')[0]}</div>
            <div className="text-mu text-[11px] truncate">{profile.role} · {profile.city ?? 'CrossFit'}</div>
          </div>
        </Link>
      </aside>
    </>
  )
}
