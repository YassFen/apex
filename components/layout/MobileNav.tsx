'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, Flame, Timer, TrendingUp, Activity, Users, ArrowLeftRight, MoreHorizontal,
  Trophy, Calculator, BarChart3, Gear, History, ChevronRight, CalendarDays, Medal, BookOpenText,
} from '@/components/ui/icons'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils/cn'
import { SPRING } from '@/components/ui/motion'
import { useShell } from '@/lib/hooks/useShell'
import { Modal } from '@/components/ui/Modal'
import type { Profile } from '@/lib/types/database'

type Item = { href: string; label: string; icon: typeof Flame; desc?: string }

const ATHLETE_TABS: Item[] = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutGrid },
  { href: '/wod',       label: 'WOD',    icon: Flame },
  { href: '/calendar',  label: 'Agenda', icon: CalendarDays },
  { href: '/prs',       label: 'RMs',    icon: TrendingUp },
]

const COACH_TABS: Item[] = [
  { href: '/dashboard',         label: 'Inicio',  icon: LayoutGrid },
  { href: '/coach/publish-wod', label: 'WOD',     icon: Flame },
  { href: '/calendar',          label: 'Agenda',  icon: CalendarDays },
  { href: '/coach/athletes',    label: 'Atletas', icon: Users },
]

// Everything that doesn't fit in the tab bar lives in the "Más" sheet.
const ATHLETE_MORE: Item[] = [
  { href: '/timer',       label: 'Timer',             icon: Timer,      desc: 'For Time, AMRAP, EMOM, Tabata' },
  { href: '/competitions', label: 'Competencias',     icon: Medal,      desc: 'Resultados y tu progreso' },
  { href: '/movements',   label: 'Ejercicios',        icon: BookOpenText, desc: 'Cómo se hace cada uno' },
  { href: '/wod/history', label: 'Historial de WODs', icon: History,    desc: 'Tus resultados día a día' },
  { href: '/benchmarks',  label: 'Benchmarks',        icon: Trophy,     desc: 'Fran, Grace, Murph…' },
  { href: '/calc',        label: 'Calculadora RM',    icon: Calculator, desc: 'Porcentajes y discos' },
  { href: '/settings',    label: 'Configuración',     icon: Gear,       desc: 'Perfil, box, avisos y apariencia' },
]

const COACH_MORE: Item[] = [
  { href: '/coach/wod-live', label: 'Seguimiento en vivo', icon: Activity, desc: 'Quién ya registró el WOD' },
  { href: '/analytics', label: 'Analytics',      icon: BarChart3,  desc: 'Progreso del box' },
  { href: '/timer',     label: 'Timer',          icon: Timer,      desc: 'For Time, AMRAP, EMOM, Tabata' },
  { href: '/movements', label: 'Ejercicios',     icon: BookOpenText, desc: 'Crea los de tu box' },
  { href: '/calc',      label: 'Calculadora RM', icon: Calculator, desc: 'Porcentajes y discos' },
  { href: '/settings',  label: 'Configuración',  icon: Gear,       desc: 'Perfil, box, avisos y apariencia' },
]

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'))
}

export function MobileNav({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const { viewMode, setViewMode, canSwitchMode } = useShell()
  const [moreOpen, setMoreOpen] = useState(false)
  const coach = viewMode === 'coach'
  const tabs = coach ? COACH_TABS : ATHLETE_TABS
  const more = coach ? COACH_MORE : ATHLETE_MORE

  // Close the sheet after navigating from it.
  useEffect(() => { setMoreOpen(false) }, [pathname])

  const moreActive = !tabs.some(t => isActive(pathname, t.href)) && more.some(m => isActive(pathname, m.href))

  return (
    <>
      <nav aria-label="Navegación principal"
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-p/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_var(--ln)]">
        <div className="grid grid-cols-5 h-[62px] px-1.5">
          {tabs.map(item => (
            <TabLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen}
            className="relative flex flex-col items-center justify-center gap-1 text-center">
            <TabIcon Icon={MoreHorizontal} active={moreActive || moreOpen} label="Más" />
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Más" subtitle={profile.full_name}>
        <nav className="flex flex-col gap-1.5 stagger" aria-label="Más secciones">
          {more.map(item => {
            const Icon = item.icon
            const active = isActive(pathname, item.href)
            return (
              <Link key={item.href} href={item.href}
                className={cn('flex items-center gap-3.5 p-3 rounded-2xl transition-colors', active ? 'bg-p3' : 'bg-p2 hover:bg-p3')}>
                <span className={cn('size-10 rounded-xl grid place-items-center flex-shrink-0', active ? 'bg-ac text-onac' : 'bg-p3 text-t')}>
                  <Icon size={19} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-sm">{item.label}</span>
                  {item.desc && <span className="block text-mu text-xs truncate">{item.desc}</span>}
                </span>
                <ChevronRight size={16} className="text-fa" aria-hidden />
              </Link>
            )
          })}

          {canSwitchMode && (
            <button type="button" onClick={() => { setViewMode(coach ? 'athlete' : 'coach'); setMoreOpen(false) }}
              className="flex items-center gap-3.5 p-3 rounded-2xl bg-p2 hover:bg-p3 transition-colors text-left">
              <span className="size-10 rounded-xl grid place-items-center flex-shrink-0 bg-bl/15 text-bl">
                <ArrowLeftRight size={19} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-sm">Cambiar a modo {coach ? 'atleta' : 'coach'}</span>
                <span className="block text-mu text-xs">{coach ? 'Tus RMs, WOD y timer personal' : 'Publicar WODs y ver tu box'}</span>
              </span>
            </button>
          )}
        </nav>

      </Modal>
    </>
  )
}

function TabLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined}
      className="relative flex flex-col items-center justify-center gap-1 text-center">
      <TabIcon Icon={item.icon} active={active} label={item.label} />
    </Link>
  )
}

function TabIcon({ Icon, active, label }: { Icon: typeof Flame; active: boolean; label: string }) {
  return (
    <>
      <span className={cn(
        'relative isolate h-8 w-14 rounded-full grid place-items-center transition-colors duration-300',
        active ? 'text-ac' : 'text-mu',
      )}>
        {active && <motion.span layoutId="tab-pill" transition={SPRING} className="absolute inset-0 -z-10 rounded-full bg-ac/15" aria-hidden />}
        <motion.span animate={{ scale: active ? 1 : 0.92, y: active ? -1 : 0 }} transition={SPRING} className="grid place-items-center">
          <Icon size={24} weight={active ? 'fill' : 'regular'} aria-hidden />
        </motion.span>
      </span>
      <span className={cn('text-[10px] font-bold leading-none transition-colors', active ? 'text-t' : 'text-mu')}>{label}</span>
    </>
  )
}
