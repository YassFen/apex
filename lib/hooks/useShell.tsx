'use client'
import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ACTIVE_BOX_COOKIE } from '@/lib/constants/cookies'
import type { Profile, Box } from '@/lib/types/database'
import type { Notice } from '@/lib/utils/notifications'

export type ViewMode = 'admin' | 'coach' | 'athlete'
export const MODE_LABEL: Record<ViewMode, string> = { admin: 'Administrar', coach: 'Coach', athlete: 'Atleta' }

interface ShellCtx {
  profile: Profile
  openSidebar: () => void
  accountRole: 'coach' | 'athlete' | 'admin'
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  canSwitchMode: boolean
  /** Modes this account can use, in display order. */
  modes: ViewMode[]
  /** Boxes this account administers (owner, or member with role admin). */
  adminBoxIds: string[]
  isPlatformAdmin: boolean
  boxes: Box[]
  activeBoxId: string | null
  setActiveBoxId: (id: string) => void
  notices: Notice[]
}

const Ctx = createContext<ShellCtx | null>(null)
const VIEW_MODE_KEY  = 'apex.viewMode'
const ACTIVE_BOX_KEY = 'apex.activeBoxId'

export function ShellProvider({
  profile, openSidebar, boxes = [], notices = [], adminBoxIds = [], isPlatformAdmin = false, coachAllowed, children,
}: {
  profile: Profile; openSidebar: () => void; boxes?: Box[]; notices?: Notice[]; adminBoxIds?: string[]; isPlatformAdmin?: boolean; coachAllowed?: boolean; children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const accountRole  = profile.role as 'coach' | 'athlete' | 'admin'
  const canCoach = coachAllowed ?? (accountRole === 'coach' || accountRole === 'admin')
  const canAdmin = adminBoxIds.length > 0
  const modes = useMemo<ViewMode[]>(() => [...(canAdmin ? ['admin' as const] : []), ...(canCoach ? ['coach' as const] : []), 'athlete'], [canAdmin, canCoach])
  const canSwitchMode = modes.length > 1

  // ── SSR-safe init: always use the server-safe default so client hydration matches ──
  // After mount, useEffect reads localStorage and corrects if needed.
  const [viewMode, setViewModeState] = useState<ViewMode>(
    canCoach ? 'coach' : 'athlete'
  )
  const [activeBoxId, setActiveBoxIdState] = useState<string | null>(
    boxes[0]?.id ?? null
  )

  // Sync from localStorage after hydration
  useEffect(() => {
    if (!canSwitchMode) return
    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY)
      if (stored && (modes as string[]).includes(stored)) setViewModeState(stored as ViewMode)
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSwitchMode])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_BOX_KEY)
      if (stored && boxes.some(b => b.id === stored)) {
        setActiveBoxIdState(stored)
        // Server pages read the box from the cookie: keep it in step with what the screen shows.
        const current = document.cookie.split('; ').find(c => c.startsWith(`${ACTIVE_BOX_COOKIE}=`))?.split('=')[1]
        if (current !== stored) {
          document.cookie = `${ACTIVE_BOX_COOKIE}=${stored}; path=/; max-age=31536000; samesite=lax`
          router.refresh()
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // only on mount — boxes array ref changes on every render

  useEffect(() => {
    if (pathname.startsWith('/manage') && modes.includes('admin') && viewMode !== 'admin') setViewModeState('admin')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Keep activeBoxId valid when boxes change
  useEffect(() => {
    if (boxes.length > 0 && (!activeBoxId || !boxes.some(b => b.id === activeBoxId))) {
      setActiveBoxIdState(boxes[0].id)
    }
  }, [boxes, activeBoxId])

  function setViewMode(m: ViewMode) {
    if (!modes.includes(m)) return
    setViewModeState(m)
    try { localStorage.setItem(VIEW_MODE_KEY, m) } catch {}
  }

  function setActiveBoxId(id: string) {
    setActiveBoxIdState(id)
    try { localStorage.setItem(ACTIVE_BOX_KEY, id) } catch {}
    // Server pages read the box from this cookie, then the screen reloads its data.
    try { document.cookie = `${ACTIVE_BOX_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax` } catch {}
    router.refresh()
  }

  const value = useMemo<ShellCtx>(() => ({
    profile, openSidebar, accountRole, viewMode, setViewMode,
    canSwitchMode, modes, adminBoxIds, isPlatformAdmin, boxes, activeBoxId, setActiveBoxId, notices,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [profile, openSidebar, accountRole, viewMode, canSwitchMode, modes, adminBoxIds, isPlatformAdmin, boxes, activeBoxId, notices])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useShell(): ShellCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useShell outside ShellProvider')
  return ctx
}
