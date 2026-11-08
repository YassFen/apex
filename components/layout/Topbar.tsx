'use client'
import Link from 'next/link'
import { Gear } from '@/components/ui/icons'
import { NotificationBell } from '@/components/layout/NotificationBell'
import type { Profile } from '@/lib/types/database'

interface TopbarProps {
  title: string
  profile: Profile
  actions?: React.ReactNode
}

/**
 * Large-title header (iOS style). Phones and tablets navigate with the bottom tab bar only;
 * the left sidebar exists from lg up. Notifications and Settings live on every screen.
 */
export function Topbar({ title, actions }: TopbarProps) {
  return (
    <header className="h-[64px] flex items-center justify-between gap-3 px-4 lg:px-6 sticky top-0 bg-bg z-20 pt-[env(safe-area-inset-top)] box-content">
      <h1 className="font-display text-[28px] font-bold tracking-tight truncate min-w-0">{title}</h1>
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
