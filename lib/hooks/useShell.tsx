'use client'
import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import type { Profile, Box } from '@/lib/types/database'

export type ViewMode = 'coach' | 'athlete'

interface ShellCtx {
  profile: Profile
  openSidebar: () => void
  accountRole: 'coach' | 'athlete' | 'admin'
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  canSwitchMode: boolean
  boxes: Box[]
  activeBoxId: string | null
  setActiveBoxId: (id: string) => void
}

const Ctx = createContext<ShellCtx | null>(null)
const VIEW_MODE_KEY  = 'apex.viewMode'
const ACTIVE_BOX_KEY = 'apex.activeBoxId'

export function ShellProvider({
  profile, openSidebar, boxes = [], children,
}: {
  profile: Profile; openSidebar: () => void; boxes?: Box[]; children: React.ReactNode
}) {
  const accountRole  = profile.role as 'coach' | 'athlete' | 'admin'
  const canSwitchMode = accountRole === 'coach' || accountRole === 'admin'

  // ── SSR-safe init: always use the server-safe default so client hydration matches ──
  // After mount, useEffect reads localStorage and corrects if needed.
  const [viewMode, setViewModeState] = useState<ViewMode>(
    canSwitchMode ? 'coach' : 'athlete'
  )
  const [activeBoxId, setActiveBoxIdState] = useState<string | null>(
    boxes[0]?.id ?? null
  )

  // Sync from localStorage after hydration
  useEffect(() => {
    if (!canSwitchMode) return
    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY)
      if (stored === 'athlete' || stored === 'coach') setViewModeState(stored)
    } catch {}
  }, [canSwitchMode])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_BOX_KEY)
      if (stored && boxes.some(b => b.id === stored)) setActiveBoxIdState(stored)
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // only on mount — boxes array ref changes on every render

  // Keep activeBoxId valid when boxes change
  useEffect(() => {
    if (boxes.length > 0 && (!activeBoxId || !boxes.some(b => b.id === activeBoxId))) {
      setActiveBoxIdState(boxes[0].id)
    }
  }, [boxes, activeBoxId])

  function setViewMode(m: ViewMode) {
    if (!canSwitchMode && m === 'coach') return
    setViewModeState(m)
    try { localStorage.setItem(VIEW_MODE_KEY, m) } catch {}
  }

  function setActiveBoxId(id: string) {
    setActiveBoxIdState(id)
    try { localStorage.setItem(ACTIVE_BOX_KEY, id) } catch {}
  }

  const value = useMemo<ShellCtx>(() => ({
    profile, openSidebar, accountRole, viewMode, setViewMode,
    canSwitchMode, boxes, activeBoxId, setActiveBoxId,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [profile, openSidebar, accountRole, viewMode, canSwitchMode, boxes, activeBoxId])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useShell(): ShellCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useShell outside ShellProvider')
  return ctx
}
