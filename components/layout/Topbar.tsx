'use client'
import { useRouter } from 'next/navigation'
import { Menu } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useShell } from '@/lib/hooks/useShell'
import type { Profile } from '@/lib/types/database'

interface TopbarProps {
  title: string
  profile: Profile
  actions?: React.ReactNode
}

export function Topbar({ title, profile, actions }: TopbarProps) {
  const { openSidebar } = useShell()
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
        <button onClick={openSidebar} aria-label="Abrir menú" className="lg:hidden p-2 -ml-2 rounded-xl hover:bg-p2 active:bg-p3 transition-colors text-t">
          <Menu size={22} strokeWidth={2} />
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
