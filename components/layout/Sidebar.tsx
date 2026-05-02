'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, TrendingUp, Timer, Flame, Activity,
  BarChart3, Calculator, Users, User, Trophy, Dumbbell,
  ArrowLeftRight, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useShell } from '@/lib/hooks/useShell'
import { APP_VERSION } from '@/lib/constants/version'
import type { Profile } from '@/lib/types/database'

// Analytics is coach-only (box-level stats). Athletes see their own history in /prs.
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
  { label: 'Herramientas', items: [
    { href: '/calc',         icon: Calculator, label: 'Calculadora RM' },
  ]},
  { label: 'Cuenta', items: [
    { href: '/settings',     icon: User,       label: 'Mi Perfil' },
  ]},
]

const COACH_NAV = [
  { label: 'Box', items: [
    { href: '/dashboard',           icon: LayoutGrid, label: 'Dashboard' },
    { href: '/coach/publish-wod',   icon: Flame,      label: 'WOD' },
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
  const { viewMode, setViewMode, canSwitchMode, boxes, activeBoxId, setActiveBoxId } = useShell()
  const nav = viewMode === 'coach' ? COACH_NAV : ATHLETE_NAV
  const initials = profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  const activeBox = boxes.find(b => b.id === activeBoxId) ?? boxes[0]

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/70 z-[29] lg:hidden" onClick={onClose} />
      )}

      <aside className={cn(
        'fixed top-0 left-0 bottom-0 w-[240px] bg-p flex flex-col z-30 transition-transform duration-[280ms]',
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        <div className="px-5 py-[22px] flex items-center gap-3">
          <div className="w-[38px] h-[38px] rounded-xl bg-ac grid place-items-center flex-shrink-0">
            <Dumbbell size={20} className="text-bg" strokeWidth={2.5} />
          </div>
          <div className="font-barlow text-[26px] font-black tracking-[3px]">AP<span className="text-ac">E</span>X</div>
        </div>

        {/* Box selector + mode toggle */}
        {(boxes.length > 0 || canSwitchMode) && (
          <div className="px-3 pb-3 flex flex-col gap-2">
            {boxes.length > 0 && (
              <label className="relative block">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fa">
                  <Dumbbell size={13} />
                </span>
                <select
                  value={activeBoxId ?? ''}
                  onChange={e => setActiveBoxId(e.target.value)}
                  className="w-full appearance-none bg-p2 rounded-xl pl-8 pr-8 py-2.5 text-[12px] font-semibold text-t outline-none focus:bg-p3 cursor-pointer truncate"
                >
                  {boxes.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fa pointer-events-none" />
              </label>
            )}
            {canSwitchMode && (
              <button
                onClick={() => setViewMode(viewMode === 'coach' ? 'athlete' : 'coach')}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors bg-p2 text-mu hover:bg-p3 hover:text-t"
                aria-label="Cambiar modo"
              >
                <ArrowLeftRight size={13} />
                Modo {viewMode === 'coach' ? 'Coach' : 'Atleta'}
                <span className="ml-auto text-[10px] font-normal opacity-60">cambiar</span>
              </button>
            )}
          </div>
        )}

        <nav className="flex-1 py-2 px-2.5 overflow-y-auto flex flex-col gap-1">
          {nav.map(group => (
            <div key={group.label}>
              <div className="px-2.5 pt-3 pb-1.5 text-[10px] uppercase tracking-[2px] text-fa font-bold">{group.label}</div>
              {group.items.map(item => {
                const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                const Icon = item.icon
                return (
                  <Link
                    key={item.href} href={item.href} onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 px-3 py-[11px] rounded-xl text-[13px] font-medium transition-all duration-[180ms]',
                      active
                        ? 'bg-p2 text-t font-semibold'
                        : 'text-mu hover:bg-p2 hover:text-t'
                    )}
                  >
                    <Icon size={17} strokeWidth={active ? 2.2 : 1.9} className={active ? 'text-ac' : ''} />
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
          className="px-5 py-4 flex items-center gap-2.5 hover:bg-p2 transition-colors"
        >
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-p3 grid place-items-center font-black text-sm text-t flex-shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm leading-tight truncate">{profile.full_name.split(' ')[0]}</div>
            <div className="text-mu text-[11px] truncate">
              {viewMode === 'coach' ? 'Coach' : 'Atleta'}
              {activeBox ? ` · ${activeBox.name}` : profile.city ? ` · ${profile.city}` : ''}
            </div>
          </div>
        </Link>

        <div className="px-5 pb-3 pt-1 text-[9px] uppercase tracking-[1.8px] text-fa/70 font-bold text-center">
          APEX · v{APP_VERSION}
        </div>
      </aside>
    </>
  )
}
