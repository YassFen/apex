'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useShell, type ViewMode } from '@/lib/hooks/useShell'

/** Changes mode and moves to a screen that exists in it (the admin area lives under /manage). */
export function useModeSwitch() {
  const { viewMode, setViewMode, modes } = useShell()
  const router = useRouter()
  const pathname = usePathname()
  const go = (m: ViewMode) => {
    if (m === viewMode) return
    setViewMode(m)
    if (m === 'admin') router.push('/manage')
    else if (pathname.startsWith('/manage')) router.push('/dashboard')
  }
  const next = modes[(modes.indexOf(viewMode) + 1) % modes.length]
  return { go, next, modes, viewMode }
}
