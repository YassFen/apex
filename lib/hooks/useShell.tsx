'use client'
import { createContext, useContext, useState } from 'react'
import type { Profile } from '@/lib/types/database'

interface ShellCtx {
  profile: Profile
  openSidebar: () => void
}

const Ctx = createContext<ShellCtx | null>(null)

export function ShellProvider({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Ctx.Provider value={{ profile, openSidebar: () => setOpen(true) }}>
      {children}
    </Ctx.Provider>
  )
}

export function useShell() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useShell outside ShellProvider')
  return ctx
}
