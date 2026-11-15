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
import { DemoTour } from '@/components/demo/DemoTour'
import { Telemetry } from '@/components/layout/Telemetry'
import { AnnouncementCenter } from '@/components/announcements/AnnouncementCenter'
import type { ShellAnnouncement } from '@/lib/utils/announcements'

export function DashboardShell({ profile, boxes, notices = [], adminBoxIds = [], isPlatformAdmin = false, announcements = [], coachAllowed, children }: { coachAllowed?: boolean; announcements?: ShellAnnouncement[]; profile: Profile; boxes: Box[]; notices?: Notice[]; adminBoxIds?: string[]; isPlatformAdmin?: boolean; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <ShellProvider profile={profile} boxes={boxes} notices={notices} adminBoxIds={adminBoxIds} isPlatformAdmin={isPlatformAdmin} coachAllowed={coachAllowed} openSidebar={() => setSidebarOpen(true)}>
      <MotionConfig reducedMotion="user">
      <ToastProvider>
        <Telemetry />
        <div className="flex min-h-dvh bg-bg">
          <Sidebar profile={profile} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <main className="flex-1 min-w-0 flex flex-col lg:ml-[240px] min-h-dvh pb-[calc(96px+env(safe-area-inset-bottom))] lg:pb-0">
            {/* DEMO MODE: mode switch, guided tour, exit */}
            {profile.id === DEMO_USER_ID && <DemoTour />}
            <AnnouncementCenter items={announcements} userId={profile.id} />
            {children}
          </main>
          <MobileNav profile={profile} />
        </div>
      </ToastProvider>
      </MotionConfig>
    </ShellProvider>
  )
}
