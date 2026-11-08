'use client'
import { useRouter } from 'next/navigation'
import { Menu, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useShell } from '@/lib/hooks/useShell'
import { ThemeToggle } from '@/components/ui/AppearancePicker'
import type { Profile } from '@/lib/types/database'

interface TopbarProps {
  title: string
  profile: Profile
  actions?: React.ReactNode
}

export function Topbar({ title, actions }: TopbarProps) {
  const { openSidebar } = useShell()
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <header className="h-[60px] flex items-center justify-between gap-3 px-4 lg:px-6 sticky top-0 bg-bg/85 backdrop-blur-[16px] z-20 pt-[env(safe-area-inset-top)] box-content">
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={openSidebar} aria-label="Abrir menú" className="lg:hidden size-10 -ml-2 grid place-items-center rounded-xl hover:bg-p2 active:bg-p3 transition-colors text-t">
          <Menu size={22} strokeWidth={2} aria-hidden />
        </button>
        <h1 className="font-barlow text-[22px] font-extrabold tracking-wide uppercase truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {actions}
        <ThemeToggle />
        <button onClick={signOut} aria-label="Cerrar sesión" title="Cerrar sesión"
          className="hidden lg:grid size-10 place-items-center rounded-xl text-fa hover:text-t hover:bg-p2 transition-colors">
          <LogOut size={18} aria-hidden />
        </button>
      </div>
    </header>
  )
}
