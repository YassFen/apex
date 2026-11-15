'use client'
import { Logo } from '@/components/ui/Logo'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, TrendingUp, Timer, Flame, Activity,
  BarChart3, Calculator, Users, User, Trophy, Dumbbell,
  ArrowLeftRight, ChevronDown, History, CalendarDays, Medal, BookOpenText, Gear, Flag,
  CalendarCheck, Megaphone, Ticket, ChalkboardTeacher, ChartPieSlice, ShieldCheck, Lifebuoy, RectangleDashed, ShieldStar,
} from '@/components/ui/icons'
import { cn } from '@/lib/utils/cn'
import { useShell, MODE_LABEL } from '@/lib/hooks/useShell'
import { useModeSwitch } from '@/lib/hooks/useModeSwitch'
import { APP_VERSION } from '@/lib/constants/version'
import type { Profile } from '@/lib/types/database'

// Analytics is coach-only (box-level stats). Athletes see their own history in /prs.
const ATHLETE_NAV = [
  { label: 'Entrenar', items: [
    { href: '/dashboard',    icon: LayoutGrid, label: 'Inicio' },
    { href: '/wod',          icon: Flame,      label: 'WOD del día', dot: true },
    { href: '/classes',      icon: CalendarCheck, label: 'Clases' },
    { href: '/calendar',     icon: CalendarDays, label: 'Calendario' },
    { href: '/wod/history',  icon: History,    label: 'Historial de WODs' },
    { href: '/timer',        icon: Timer,      label: 'Timer' },
  ]},
  { label: 'Progreso', items: [
    { href: '/league',       icon: ShieldStar, label: 'Liga' },
    { href: '/prs',          icon: TrendingUp, label: 'Récords' },
    { href: '/benchmarks',   icon: Trophy,     label: 'Benchmarks' },
    { href: '/competitions', icon: Medal,      label: 'Competencias' },
    { href: '/challenges',   icon: Flag,       label: 'Retos' },
    { href: '/announcements', icon: Megaphone, label: 'Comunicados' },
  ]},
  { label: 'Herramientas', items: [
    { href: '/calc',         icon: Calculator, label: 'Calculadora RM' },
    { href: '/movements',    icon: BookOpenText, label: 'Ejercicios' },
  ]},
  { label: 'Cuenta', items: [
    { href: '/support',      icon: Lifebuoy,   label: 'Ayuda' },
    { href: '/settings',     icon: Gear,       label: 'Configuración' },
  ]},
]

const COACH_NAV = [
  { label: 'Box', items: [
    { href: '/dashboard',           icon: LayoutGrid, label: 'Inicio' },
    { href: '/coach/publish-wod',   icon: Flame,      label: 'WOD' },
    { href: '/calendar',            icon: CalendarDays, label: 'Calendario' },
    { href: '/classes',             icon: CalendarCheck, label: 'Mis clases' },
    { href: '/coach/wod-live',      icon: Activity,   label: 'En vivo', dot: true },
    { href: '/coach/athletes',      icon: Users,      label: 'Atletas' },
    { href: '/analytics',           icon: BarChart3,  label: 'Estadísticas' },
    { href: '/challenges',          icon: Flag,       label: 'Retos' },
    { href: '/announcements',       icon: Megaphone,  label: 'Comunicados' },
  ]},
  { label: 'Herramientas', items: [
    { href: '/calc',                icon: Calculator, label: 'Calculadora RM' },
    { href: '/movements',           icon: BookOpenText, label: 'Ejercicios' },
    { href: '/timer',               icon: Timer,      label: 'Timer' },
  ]},
  { label: 'Cuenta', items: [
    { href: '/support',             icon: Lifebuoy,   label: 'Ayuda' },
    { href: '/settings',            icon: Gear,       label: 'Configuración' },
  ]},
]

const ADMIN_NAV = [
  { label: 'Administración', items: [
    { href: '/manage',               icon: ChartPieSlice,     label: 'Resumen' },
    { href: '/manage/members',       icon: Users,             label: 'Personas' },
    { href: '/manage/plans',         icon: Ticket,            label: 'Planes' },
    { href: '/manage/schedule',      icon: CalendarDays,      label: 'Horarios' },
    { href: '/manage/coaches',       icon: ChalkboardTeacher, label: 'Coaches' },
    { href: '/announcements',        icon: Megaphone,         label: 'Comunicados' },
    { href: '/manage/banners',       icon: RectangleDashed,   label: 'Banners' },
  ]},
  { label: 'Cuenta', items: [
    { href: '/support',              icon: Lifebuoy,          label: 'Ayuda' },
    { href: '/settings',             icon: Gear,              label: 'Configuración' },
  ]},
]

export function Sidebar({ profile, isOpen, onClose }: { profile: Profile; isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const { viewMode, canSwitchMode, boxes, activeBoxId, setActiveBoxId, isPlatformAdmin } = useShell()
  const { go, next } = useModeSwitch()
  const nav = viewMode === 'admin' ? ADMIN_NAV : viewMode === 'coach' ? COACH_NAV : ATHLETE_NAV
  const initials = profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  const activeBox = boxes.find(b => b.id === activeBoxId) ?? boxes[0]

  return (
    <>
      {/* Desktop only: phones and tablets use the bottom tab bar. */}
      <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 w-[240px] bg-p flex-col z-30">
        <div className="px-5 py-[22px] flex items-center gap-3">
          <Logo size={34} />
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
                onClick={() => go(next)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors bg-p2 text-mu hover:bg-p3 hover:text-t"
                aria-label="Cambiar modo"
              >
                <ArrowLeftRight size={13} />
                Modo {MODE_LABEL[viewMode]}
                <span className="ml-auto text-[10px] font-normal opacity-60">cambiar</span>
              </button>
            )}
          </div>
        )}

        <nav className="flex-1 py-2 px-2.5 overflow-y-auto flex flex-col gap-1">
          {nav.map(group => (
            <div key={group.label}>
              <div className="px-2.5 pt-3 pb-1.5 text-xs text-mu font-semibold">{group.label}</div>
              {group.items.map(item => {
                const active = pathname === item.href || (item.href !== '/dashboard' && item.href !== '/manage' && pathname.startsWith(item.href + '/') && !nav.some(g => g.items.some(i => i.href !== item.href && pathname.startsWith(i.href) && i.href.length > item.href.length)))
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
          {isPlatformAdmin && (
            <Link href="/admin" className="mt-2 flex items-center gap-3 px-3 py-[11px] rounded-xl text-[13px] font-medium text-mu hover:bg-p2 hover:text-t transition-colors">
              <ShieldCheck size={17} /> Panel de la aplicación
            </Link>
          )}
        </nav>

        <Link
          href="/settings" onClick={onClose}
          className="px-5 py-4 flex items-center gap-2.5 hover:bg-p2 transition-colors"
        >
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-p3 grid place-items-center font-bold text-sm text-t flex-shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm leading-tight truncate">{profile.full_name.split(' ')[0]}</div>
            <div className="text-mu text-[11px] truncate">
              {MODE_LABEL[viewMode]}
              {activeBox ? ` · ${activeBox.name}` : profile.city ? ` · ${profile.city}` : ''}
            </div>
          </div>
        </Link>

        <div className="px-5 pb-3 pt-1 text-xs text-mu/70 font-semibold text-center">
          APEX · v{APP_VERSION}
        </div>
      </aside>
    </>
  )
}
