'use client'
// Frame of the application panel: its own navigation, apart from the box app.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MotionConfig } from 'motion/react'
import { LogoMark } from '@/components/ui/Logo'
import { ToastProvider } from '@/components/ui/Toast'
import { ChartPieSlice, Buildings, Users, CursorClick, Bug, ClockCounterClockwise, ArrowLeft, Lifebuoy, RectangleDashed, Target } from '@/components/ui/icons'
import { cn } from '@/lib/utils/cn'

const NAV = [
  { href: '/admin', label: 'Resumen', icon: ChartPieSlice },
  { href: '/admin/boxes', label: 'Boxes', icon: Buildings },
  { href: '/admin/users', label: 'Usuarios', icon: Users },
  { href: '/admin/usage', label: 'Uso', icon: CursorClick },
  { href: '/admin/errors', label: 'Errores', icon: Bug },
  { href: '/admin/support', label: 'Soporte', icon: Lifebuoy },
  { href: '/admin/banners', label: 'Banners', icon: RectangleDashed },
  { href: '/admin/challenges', label: 'Retos', icon: Target },
  { href: '/admin/audit', label: 'Auditoría', icon: ClockCounterClockwise },
]

export function AdminChrome({ name, openErrors, openTickets = 0, children }: { name: string; openErrors: number; openTickets?: number; children: React.ReactNode }) {
  const badge = (href: string) => (href === '/admin/errors' ? openErrors : href === '/admin/support' ? openTickets : 0)
  const pathname = usePathname()
  const isOn = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href))
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <div className="min-h-dvh bg-bg lg:flex">
          {/* Desktop: side navigation */}
          <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[232px] bg-p flex-col z-30">
            <div className="px-5 py-5 flex items-center gap-2.5">
              <LogoMark size={28} />
              <div className="leading-tight"><div className="font-display font-bold tracking-tight">APEX</div><div className="text-[11px] text-mu">Panel de la aplicación</div></div>
            </div>
            <nav aria-label="Panel" className="flex-1 px-2.5 flex flex-col gap-1">
              {NAV.map(n => (
                <Link key={n.href} href={n.href} aria-current={isOn(n.href) ? 'page' : undefined}
                  className={cn('flex items-center gap-3 px-3 py-[11px] rounded-xl text-[13px] font-medium transition-colors', isOn(n.href) ? 'bg-p2 text-t font-semibold' : 'text-mu hover:bg-p2 hover:text-t')}>
                  <n.icon size={17} className={isOn(n.href) ? 'text-ac' : ''} weight={isOn(n.href) ? 'fill' : 'regular'} />
                  {n.label}
                  {badge(n.href) > 0 && <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-rd text-white text-[11px] font-bold grid place-items-center tabular-nums">{badge(n.href)}</span>}
                </Link>
              ))}
            </nav>
            <Link href="/dashboard" className="m-2.5 flex items-center gap-2 px-3 py-3 rounded-xl text-[13px] text-mu hover:bg-p2 hover:text-t"><ArrowLeft size={16} /> Volver a la app</Link>
            <div className="px-5 pb-4 text-[11px] text-fa truncate">{name}</div>
          </aside>

          <div className="flex-1 min-w-0 lg:ml-[232px]">
            {/* Phones: top bar with scrolling tabs */}
            <header className="lg:hidden sticky top-0 z-20 bg-bg pt-[env(safe-area-inset-top)]">
              <div className="h-14 px-4 flex items-center gap-3">
                <Link href="/dashboard" aria-label="Volver a la app" className="size-10 -ml-2 rounded-full grid place-items-center hover:bg-p2"><ArrowLeft size={20} /></Link>
                <LogoMark size={22} />
                <span className="font-display font-bold tracking-tight">Panel</span>
              </div>
              <nav aria-label="Panel" className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
                {NAV.map(n => (
                  <Link key={n.href} href={n.href} aria-current={isOn(n.href) ? 'page' : undefined}
                    className={cn('flex-shrink-0 h-10 px-4 rounded-full text-sm font-semibold flex items-center gap-1.5', isOn(n.href) ? 'bg-t text-bg' : 'bg-p text-mu')}>
                    {n.label}
                    {badge(n.href) > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-rd text-white text-[11px] font-bold grid place-items-center">{badge(n.href)}</span>}
                  </Link>
                ))}
              </nav>
            </header>
            <main className="p-4 lg:p-8 max-w-6xl w-full pb-16">{children}</main>
          </div>
        </div>
      </ToastProvider>
    </MotionConfig>
  )
}

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
      <div>
        <h1 className="font-display text-[28px] font-bold tracking-tight leading-tight">{title}</h1>
        {sub && <p className="text-sm text-mu mt-1 text-pretty max-w-2xl">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

/** Period switch as plain links (?d=7|30|90). */
export function PeriodTabs({ days, base }: { days: number; base: string }) {
  return (
    <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-p2 w-full sm:w-auto">
      {[7, 30, 90].map(d => (
        <Link key={d} href={`${base}?d=${d}`} aria-current={days === d} className={cn('min-h-9 px-4 rounded-xl text-sm font-bold grid place-items-center', days === d ? 'bg-p3 text-t' : 'text-mu')}>{d} días</Link>
      ))}
    </div>
  )
}
