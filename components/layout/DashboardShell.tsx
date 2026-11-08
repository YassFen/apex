'use client'
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { ShellProvider } from '@/lib/hooks/useShell'
import { ToastProvider } from '@/components/ui/Toast'
import type { Profile, Box } from '@/lib/types/database'

export function DashboardShell({ profile, boxes, children }: { profile: Profile; boxes: Box[]; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <ShellProvider profile={profile} boxes={boxes} openSidebar={() => setSidebarOpen(true)}>
      <ToastProvider>
        <div className="flex min-h-dvh bg-bg">
          <Sidebar profile={profile} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <main className="flex-1 flex flex-col lg:ml-[240px] min-h-dvh pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0">
            {children}
          </main>
          <MobileNav profile={profile} />
        </div>
      </ToastProvider>
    </ShellProvider>
  )
}
