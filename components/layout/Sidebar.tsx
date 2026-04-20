'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import type { Profile } from '@/lib/types/database'

const ATHLETE_NAV = [
  { label: 'Training', items: [
    { href: '/dashboard',    icon: IconGrid,   label: 'Dashboard' },
    { href: '/prs',          icon: IconPulse,  label: 'Historial & PRs' },
    { href: '/benchmarks',   icon: IconClock,  label: 'Benchmarks' },
  ]},
  { label: 'Build', items: [
    { href: '/wod',          icon: IconFlame,  label: 'WOD del Día', dot: true },
    { href: '/timer',        icon: IconTimer,  label: 'Timer' },
  ]},
  { label: 'Stats', items: [
    { href: '/analytics',    icon: IconBar,    label: 'Analytics' },
    { href: '/calc',         icon: IconCalc,   label: 'Calculadora RM' },
  ]},
  { label: 'Cuenta', items: [
    { href: '/settings',     icon: IconUser,   label: 'Mi Perfil' },
  ]},
]

const COACH_NAV = [
  { label: 'Box', items: [
    { href: '/dashboard',           icon: IconGrid,   label: 'Dashboard' },
    { href: '/coach/publish-wod',   icon: IconFlame,  label: 'Publicar WOD' },
    { href: '/coach/wod-live',      icon: IconPulse,  label: 'Seguimiento WOD', dot: true },
    { href: '/coach/athletes',      icon: IconUsers,  label: 'Atletas' },
    { href: '/analytics',           icon: IconBar,    label: 'Analytics' },
  ]},
  { label: 'Cuenta', items: [
    { href: '/settings',            icon: IconUser,   label: 'Mi Perfil' },
  ]},
]

export function Sidebar({ profile, isOpen, onClose }: { profile: Profile; isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const nav = profile.role === 'coach' ? COACH_NAV : ATHLETE_NAV
  const initials = profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      {/* Overlay for mobile/tablet */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-[29] lg:hidden" onClick={onClose} />
      )}

      <aside className={cn(
        'fixed top-0 left-0 bottom-0 w-[240px] bg-gradient-to-b from-[#0e1117] to-[#111620] border-r border-[var(--ln)] flex flex-col z-30 transition-transform duration-[280ms]',
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className="px-5 py-[22px] border-b border-[var(--ln)] flex items-center gap-3">
          <div className="w-[38px] h-[38px] rounded-xl bg-ac grid place-items-center font-barlow text-[24px] font-black text-bg flex-shrink-0">A</div>
          <div className="font-barlow text-[26px] font-black tracking-[3px]">AP<span className="text-ac">E</span>X</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2.5 overflow-y-auto flex flex-col gap-1">
          {nav.map(group => (
            <div key={group.label}>
              <div className="px-2.5 pt-3 pb-1 text-[10px] uppercase tracking-[2px] text-fa font-bold">{group.label}</div>
              {group.items.map(item => {
                const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href} href={item.href} onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 px-3 py-[11px] rounded-xl text-[13px] font-medium border transition-all duration-[180ms]',
                      active
                        ? 'bg-ac/[0.11] border-ac/20 text-ac font-bold'
                        : 'border-transparent text-mu hover:bg-p2 hover:text-t'
                    )}
                  >
                    <item.icon size={16} className={active ? 'opacity-100' : 'opacity-70'} />
                    {item.label}
                    {(item as any).dot && !active && (
                      <span className="ml-auto w-[7px] h-[7px] rounded-full bg-ac animate-pulse" />
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="px-5 py-4 border-t border-[var(--ln)] flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-ac to-bl grid place-items-center font-black text-sm text-bg flex-shrink-0">
            {initials}
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight">{profile.full_name.split(' ')[0]}</div>
            <div className="text-mu text-[11px]">{profile.role} · {profile.city ?? 'CrossFit'}</div>
          </div>
        </div>
      </aside>
    </>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconGrid({ size = 16, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
}
function IconPulse({ size = 16, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
}
function IconClock({ size = 16, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
}
function IconFlame({ size = 16, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
}
function IconTimer({ size = 16, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><circle cx="12" cy="12" r="9"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="15" y1="13" x2="12" y2="13"/></svg>
}
function IconBar({ size = 16, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M2 20h20M7 20V10M12 20V4M17 20v-7"/></svg>
}
function IconCalc({ size = 16, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15" x2="11" y2="15"/></svg>
}
function IconUsers({ size = 16, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
}
function IconUser({ size = 16, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
}
