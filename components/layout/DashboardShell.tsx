'use client'
import { useState } from 'react'
import { MotionConfig } from 'motion/react'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { ShellProvider } from '@/lib/hooks/useShell'
import { ToastProvider } from '@/components/ui/Toast'
import type { Profile, Box } from '@/lib/types/database'
import type { Notice } from '@/lib/utils/notifications'
import { DEMO_USER_ID } from '@/lib/demo/client'

export function DashboardShell({ profile, boxes, notices = [], children }: { profile: Profile; boxes: Box[]; notices?: Notice[]; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <ShellProvider profile={profile} boxes={boxes} notices={notices} openSidebar={() => setSidebarOpen(true)}>
      <MotionConfig reducedMotion="user">
      <ToastProvider>
        <div className="flex min-h-dvh bg-bg">
          <Sidebar profile={profile} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <main className="flex-1 min-w-0 flex flex-col lg:ml-[240px] min-h-dvh pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0">
            {/* DEMO MODE strip */}
            {profile.id === DEMO_USER_ID && (
              <a href="/demo/exit" className="flex items-center justify-center gap-2 h-8 pt-[env(safe-area-inset-top)] box-content bg-or text-white text-xs font-semibold">
                <span className="size-1.5 rounded-full bg-white animate-ping-slow" />Estás viendo la demo con datos de ejemplo · <span className="underline">Salir</span>
              </a>
            )}
            {children}
          </main>
          <MobileNav profile={profile} />
        </div>
      </ToastProvider>
      </MotionConfig>
    </ShellProvider>
  )
}
