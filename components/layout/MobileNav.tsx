'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Flame, Timer, TrendingUp, User, Activity, Users, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useShell } from '@/lib/hooks/useShell'
import type { Profile } from '@/lib/types/database'

const ATHLETE_ITEMS = [
  { href: '/dashboard', label: 'Home',   icon: LayoutGrid },
  { href: '/wod',       label: 'WOD',    icon: Flame },
  { href: '/timer',     label: 'Timer',  icon: Timer },
  { href: '/prs',       label: 'RMs',    icon: TrendingUp },
  { href: '/settings',  label: 'Perfil', icon: User },
]

const COACH_ITEMS = [
  { href: '/dashboard',         label: 'Home',    icon: LayoutGrid },
  { href: '/coach/publish-wod', label: 'WOD',     icon: Flame },
  { href: '/coach/wod-live',    label: 'En Vivo', icon: Activity },
  { href: '/coach/athletes',    label: 'Atletas', icon: Users },
  { href: '/settings',          label: 'Perfil',  icon: User },
]

export function MobileNav({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const { viewMode, setViewMode, canSwitchMode } = useShell()
  const items = viewMode === 'coach' ? COACH_ITEMS : ATHLETE_ITEMS

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-[#0e1117]/95 backdrop-blur-xl border-t border-[var(--ln)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-[58px] px-1">
        {items.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                'flex flex-col items-center gap-[3px] px-2 py-1.5 rounded-xl flex-1 transition-colors text-center',
                active ? 'text-ac' : 'text-fa hover:text-mu'
              )}
            >
              <Icon size={19} strokeWidth={active ? 2.4 : 1.9} />
              <span className="text-[9px] font-bold tracking-wide leading-none">{item.label}</span>
            </Link>
          )
        })}

        {/* Mode toggle — only for coaches */}
        {canSwitchMode && (
          <button
            onClick={() => setViewMode(viewMode === 'coach' ? 'athlete' : 'coach')}
            className={cn(
              'flex flex-col items-center gap-[3px] px-2 py-1.5 rounded-xl flex-1 transition-colors text-center',
              viewMode === 'coach' ? 'text-bl' : 'text-or'
            )}
            aria-label="Cambiar modo"
          >
            <ArrowLeftRight size={19} strokeWidth={1.9} />
            <span className="text-[9px] font-bold tracking-wide leading-none">
              {viewMode === 'coach' ? 'Atleta' : 'Coach'}
            </span>
          </button>
        )}
      </div>
    </nav>
  )
}
