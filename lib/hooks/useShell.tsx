'use client'
import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import type { Profile, Box } from '@/lib/types/database'

export type ViewMode = 'coach' | 'athlete'

interface ShellCtx {
  profile: Profile
  openSidebar: () => void

  /** Actual role from DB — never changes within a session. */
  accountRole: 'coach' | 'athlete' | 'admin'
  /** The view the user is currently in. Coaches can flip to 'athlete'. */
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  canSwitchMode: boolean

  /** All boxes this user belongs to (either as coach or athlete). */
  boxes: Box[]
  activeBoxId: string | null
  setActiveBoxId: (id: string) => void
}

const Ctx = createContext<ShellCtx | null>(null)
const VIEW_MODE_KEY = 'apex.viewMode'
const ACTIVE_BOX_KEY = 'apex.activeBoxId'

export function ShellProvider({
  profile,
  openSidebar,
  boxes = [],
  children,
}: {
  profile: Profile
  openSidebar: () => void
  boxes?: Box[]
  children: React.ReactNode
}) {
  const accountRole = profile.role as 'coach' | 'athlete' | 'admin'
  const canSwitchMode = accountRole === 'coach' || accountRole === 'admin'

  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (!canSwitchMode) return 'athlete'
    if (typeof window === 'undefined') return 'coach'
    const stored = window.localStorage.getItem(VIEW_MODE_KEY)
    return stored === 'athlete' ? 'athlete' : 'coach'
  })

  function setViewMode(m: ViewMode) {
    if (!canSwitchMode && m === 'coach') return
    setViewModeState(m)
    try { window.localStorage.setItem(VIEW_MODE_KEY, m) } catch {}
  }

  const [activeBoxId, setActiveBoxIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return boxes[0]?.id ?? null
    const stored = window.localStorage.getItem(ACTIVE_BOX_KEY)
    if (stored && boxes.some(b => b.id === stored)) return stored
    return boxes[0]?.id ?? null
  })

  function setActiveBoxId(id: string) {
    setActiveBoxIdState(id)
    try { window.localStorage.setItem(ACTIVE_BOX_KEY, id) } catch {}
  }

  useEffect(() => {
    if (boxes.length > 0 && (!activeBoxId || !boxes.some(b => b.id === activeBoxId))) {
      setActiveBoxIdState(boxes[0].id)
    }
  }, [boxes, activeBoxId])

  const value = useMemo<ShellCtx>(() => ({
    profile,
    openSidebar,
    accountRole,
    viewMode,
    setViewMode,
    canSwitchMode,
    boxes,
    activeBoxId,
    setActiveBoxId,
  }), [profile, openSidebar, accountRole, viewMode, canSwitchMode, boxes, activeBoxId])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useShell(): ShellCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useShell outside ShellProvider')
  return ctx
}
