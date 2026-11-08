'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { CaretLeft, Gear } from '@/components/ui/icons'
import { NotificationBell } from '@/components/layout/NotificationBell'
import type { Profile } from '@/lib/types/database'

interface TopbarProps {
  title: string
  profile: Profile
  actions?: React.ReactNode
  /** Where the back arrow goes. Defaults to the parent path on nested screens. */
  backHref?: string | null
}

/**
 * Parent of a nested screen, or null on top-level screens (those have the tab bar).
 * /coach/... counts as one level: /coach/publish-wod is top-level, /settings/profile is nested.
 */
function parentOf(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  const depth = parts[0] === 'coach' ? parts.length - 1 : parts.length
  if (depth <= 1) return null
  if (parts[0] === 'calendar' && parts[1] === 'event') {
    return parts.length > 3 ? `/${parts.slice(0, 3).join('/')}` : '/calendar'
  }
  return `/${parts.slice(0, -1).join('/')}`
}

/**
 * Large-title header (iOS style). Nested screens get a back arrow, since iPhone has no
 * system back button. Notifications and Settings live on every screen.
 */
export function Topbar({ title, actions, backHref }: TopbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const back = backHref === undefined ? parentOf(pathname) : backHref

  return (
    <header className="h-[64px] flex items-center justify-between gap-2 px-4 lg:px-6 sticky top-0 bg-bg z-20 pt-[env(safe-area-inset-top)] box-content">
      <div className="flex items-center gap-1 min-w-0">
        {back && (
          <motion.button type="button" whileTap={{ scale: 0.88 }} aria-label="Volver"
            initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}
            onClick={() => (window.history.length > 1 ? router.back() : router.push(back))}
            className="-ml-2 size-10 flex-shrink-0 grid place-items-center rounded-full text-t hover:bg-p2">
            <CaretLeft size={24} weight="bold" />
          </motion.button>
        )}
        <h1 className={`font-display font-bold tracking-tight min-w-0 leading-tight whitespace-nowrap ${title.length > 14 ? 'text-[20px]' : title.length > 9 ? 'text-[24px]' : 'text-[28px]'}`}>{title}</h1>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {actions}
        <NotificationBell />
        <Link href="/settings" aria-label="Configuración" title="Configuración"
          className="size-10 grid place-items-center rounded-full text-t hover:bg-p2 active:scale-95 transition">
          <Gear size={22} aria-hidden />
        </Link>
      </div>
    </header>
  )
}
