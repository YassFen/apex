'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types/database'

interface TopbarProps {
  title: string
  onMenuClick: () => void
  profile: Profile
  actions?: React.ReactNode
}

export function Topbar({ title, onMenuClick, profile, actions }: TopbarProps) {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <header className="h-[60px] border-b border-[var(--ln)] flex items-center justify-between px-6 sticky top-0 bg-bg/90 backdrop-blur-[16px] z-20">
      <div className="flex items-center gap-3.5">
        <button onClick={onMenuClick} className="lg:hidden p-2 rounded-xl hover:bg-p2 transition-colors text-t">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <h1 className="font-barlow text-[22px] font-extrabold tracking-wide uppercase">{title}</h1>
      </div>
      <div className="flex items-center gap-2.5">
        {actions}
        <button onClick={signOut} className="text-[11px] text-fa hover:text-mu transition-colors px-2 py-1">
          Salir
        </button>
      </div>
    </header>
  )
}
