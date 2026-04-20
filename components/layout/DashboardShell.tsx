'use client'
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { ShellProvider } from '@/lib/hooks/useShell'
import type { Profile } from '@/lib/types/database'

export function DashboardShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <ShellProvider profile={profile} openSidebar={() => setSidebarOpen(true)}>
      <div className="flex min-h-screen bg-bg">
        <Sidebar profile={profile} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 flex flex-col lg:ml-[240px] min-h-screen pb-[72px] lg:pb-0">
          {children}
        </main>
        <MobileNav profile={profile} />
      </div>
    </ShellProvider>
  )
}
