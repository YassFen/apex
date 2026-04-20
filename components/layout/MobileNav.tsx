'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import type { Profile } from '@/lib/types/database'

const ATHLETE_ITEMS = [
  { href: '/dashboard',  label: 'Home',   icon: '⊞' },
  { href: '/wod',        label: 'WOD',    icon: '🔥' },
  { href: '/timer',      label: 'Timer',  icon: '⏱' },
  { href: '/prs',        label: 'PRs',    icon: '📈' },
  { href: '/calc',       label: 'Calc',   icon: '🧮' },
]

const COACH_ITEMS = [
  { href: '/dashboard',         label: 'Dashboard', icon: '⊞' },
  { href: '/coach/publish-wod', label: 'WOD',       icon: '🔥' },
  { href: '/coach/athletes',    label: 'Atletas',   icon: '👥' },
  { href: '/analytics',         label: 'Analytics', icon: '📊' },
]

export function MobileNav({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const items = profile.role === 'coach' ? COACH_ITEMS : ATHLETE_ITEMS

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-[#0e1117]/95 backdrop-blur-xl border-t border-[var(--ln)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-[58px] max-w-lg mx-auto px-2">
        {items.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl min-w-[52px] transition-colors text-center',
                active ? 'text-ac' : 'text-fa hover:text-mu'
              )}
            >
              <span className="text-[18px] leading-none">{item.icon}</span>
              <span className="text-[10px] font-bold tracking-wide">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
