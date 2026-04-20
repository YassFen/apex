'use client'
import { createContext, useContext } from 'react'
import type { Profile } from '@/lib/types/database'

interface ShellCtx {
  profile: Profile
  openSidebar: () => void
}

const Ctx = createContext<ShellCtx | null>(null)

export function ShellProvider({
  profile,
  openSidebar,
  children,
}: {
  profile: Profile
  openSidebar: () => void
  children: React.ReactNode
}) {
  return <Ctx.Provider value={{ profile, openSidebar }}>{children}</Ctx.Provider>
}

export function useShell(): ShellCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useShell outside ShellProvider')
  return ctx
}
