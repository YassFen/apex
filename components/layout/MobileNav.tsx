'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import {
  LayoutGrid, Flame, Timer, TrendingUp, Activity, Users, ArrowLeftRight, MoreHorizontal,
  Trophy, Calculator, BarChart3, Gear, History, ChevronRight, CalendarDays, Medal, BookOpenText, Flag,
  SlidersHorizontal, ArrowCounterClockwise,
} from '@/components/ui/icons'
import { cn } from '@/lib/utils/cn'
import { SPRING } from '@/components/ui/motion'
import { useShell, type ViewMode } from '@/lib/hooks/useShell'
import { Modal } from '@/components/ui/Modal'
import type { Profile } from '@/lib/types/database'

type Item = { href: string; label: string; short: string; icon: typeof Flame; desc: string }

// Every destination a person can pin to the tab bar. `short` is the 1-word tab label.
const ATHLETE_ITEMS: Item[] = [
  { href: '/dashboard',    label: 'Inicio',            short: 'Inicio',    icon: LayoutGrid,  desc: 'Tu estado y tus widgets' },
  { href: '/wod',          label: 'WOD del día',       short: 'WOD',       icon: Flame,       desc: 'El WOD de tu box y el ranking' },
  { href: '/calendar',     label: 'Calendario',        short: 'Agenda',    icon: CalendarDays, desc: 'WODs programados y competencias' },
  { href: '/prs',          label: 'Récords',           short: 'RMs',       icon: TrendingUp,  desc: 'Tus RMs y su evolución' },
  { href: '/timer',        label: 'Timer',             short: 'Timer',     icon: Timer,       desc: 'For Time, AMRAP, EMOM, Tabata' },
  { href: '/calc',         label: 'Calculadora RM',    short: 'Calcular',  icon: Calculator,  desc: 'Porcentajes y discos' },
  { href: '/challenges',   label: 'Retos',             short: 'Retos',     icon: Flag,        desc: 'Desafíos con tu box' },
  { href: '/competitions', label: 'Competencias',      short: 'Torneos',   icon: Medal,       desc: 'Resultados y tu progreso' },
  { href: '/movements',    label: 'Ejercicios',        short: 'Ejercicios', icon: BookOpenText, desc: 'Cómo se hace cada uno' },
  { href: '/wod/history',  label: 'Historial de WODs', short: 'Historial', icon: History,     desc: 'Tus resultados día a día' },
  { href: '/benchmarks',   label: 'Benchmarks',        short: 'Bench',     icon: Trophy,      desc: 'Fran, Grace, Murph…' },
  { href: '/settings',     label: 'Configuración',     short: 'Ajustes',   icon: Gear,        desc: 'Perfil, box, avisos y apariencia' },
]
const COACH_ITEMS: Item[] = [
  { href: '/dashboard',         label: 'Inicio',              short: 'Inicio',    icon: LayoutGrid,   desc: 'Clases, actividad y tu box' },
  { href: '/coach/publish-wod', label: 'Publicar WOD',        short: 'WOD',       icon: Flame,        desc: 'Programa por día y por clase' },
  { href: '/calendar',          label: 'Calendario',          short: 'Agenda',    icon: CalendarDays, desc: 'WODs programados y eventos' },
  { href: '/coach/athletes',    label: 'Atletas',             short: 'Atletas',   icon: Users,        desc: 'Tu roster e inactivos' },
  { href: '/coach/wod-live',    label: 'Seguimiento en vivo', short: 'En vivo',   icon: Activity,     desc: 'Quién ya registró el WOD' },
  { href: '/analytics',         label: 'Analytics',           short: 'Datos',     icon: BarChart3,    desc: 'Progreso del box' },
  { href: '/challenges',        label: 'Retos',               short: 'Retos',     icon: Flag,         desc: 'Desafíos del box' },
  { href: '/movements',         label: 'Ejercicios',          short: 'Ejercicios', icon: BookOpenText, desc: 'Crea los de tu box' },
  { href: '/timer',             label: 'Timer',               short: 'Timer',     icon: Timer,        desc: 'For Time, AMRAP, EMOM, Tabata' },
  { href: '/calc',              label: 'Calculadora RM',      short: 'Calcular',  icon: Calculator,   desc: 'Porcentajes y discos' },
  { href: '/settings',          label: 'Configuración',       short: 'Ajustes',   icon: Gear,         desc: 'Perfil, box, avisos y apariencia' },
]
const DEFAULT_TABS: Record<ViewMode, string[]> = {
  athlete: ['/dashboard', '/wod', '/calendar', '/prs'],
  coach: ['/dashboard', '/coach/publish-wod', '/calendar', '/coach/athletes'],
}
const tabsKey = (m: ViewMode) => `apex.tabs.${m}`

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'))
}

export function MobileNav({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const { viewMode, setViewMode, canSwitchMode } = useShell()
  const [moreOpen, setMoreOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const coach = viewMode === 'coach'
  const items = coach ? COACH_ITEMS : ATHLETE_ITEMS
  const [pinned, setPinned] = useState<string[]>(DEFAULT_TABS[viewMode])

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(tabsKey(viewMode)) ?? 'null')
      setPinned(Array.isArray(v) && v.length === 4 && v.every((h: string) => items.some(i => i.href === h)) ? v : DEFAULT_TABS[viewMode])
    } catch { setPinned(DEFAULT_TABS[viewMode]) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])
  function savePinned(next: string[]) {
    setPinned(next)
    try { localStorage.setItem(tabsKey(viewMode), JSON.stringify(next)) } catch {}
  }

  // Close the sheet after navigating from it.
  useEffect(() => { setMoreOpen(false) }, [pathname])

  const tabs = pinned.map(h => items.find(i => i.href === h)).filter((i): i is Item => !!i)
  const more = items.filter(i => !pinned.includes(i.href))
  const moreActive = !tabs.some(t => isActive(pathname, t.href)) && more.some(m => isActive(pathname, m.href))

  return (
    <>
      <nav aria-label="Navegación principal"
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-p pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_var(--ln)]">
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
                  <Icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-sm">{item.label}</span>
                  <span className="block text-mu text-xs leading-snug">{item.desc}</span>
                </span>
                <ChevronRight size={16} className="text-fa" aria-hidden />
              </Link>
            )
          })}

          <button type="button" onClick={() => { setMoreOpen(false); setEditing(true) }}
            className="flex items-center gap-3.5 p-3 rounded-2xl bg-p2 hover:bg-p3 transition-colors text-left">
            <span className="size-10 rounded-xl grid place-items-center flex-shrink-0 bg-ac/15 text-ac"><SlidersHorizontal size={20} aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-sm">Personalizar barra</span>
              <span className="block text-mu text-xs">Elige qué va abajo</span>
            </span>
          </button>

          {canSwitchMode && (
            <button type="button" onClick={() => { setViewMode(coach ? 'athlete' : 'coach'); setMoreOpen(false) }}
              className="flex items-center gap-3.5 p-3 rounded-2xl bg-p2 hover:bg-p3 transition-colors text-left">
              <span className="size-10 rounded-xl grid place-items-center flex-shrink-0 bg-bl/15 text-bl">
                <ArrowLeftRight size={20} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-sm">Cambiar a modo {coach ? 'atleta' : 'coach'}</span>
                <span className="block text-mu text-xs">{coach ? 'Tus RMs, WOD y timer personal' : 'Publicar WODs y ver tu box'}</span>
              </span>
            </button>
          )}
        </nav>
      </Modal>

      <TabBarEditor open={editing} onClose={() => setEditing(false)} items={items} pinned={pinned}
        onChange={savePinned} onReset={() => savePinned(DEFAULT_TABS[viewMode])} />
    </>
  )
}

/* ── Editor: a live preview of the bar; tap a slot, then pick what goes there ── */

function TabBarEditor({ open, onClose, items, pinned, onChange, onReset }: {
  open: boolean; onClose: () => void; items: Item[]; pinned: string[]; onChange: (next: string[]) => void; onReset: () => void
}) {
  const [slot, setSlot] = useState(0)
  const byHref = new Map(items.map(i => [i.href, i]))

  function place(href: string) {
    const next = [...pinned]
    const existing = next.indexOf(href)
    if (existing >= 0) [next[existing], next[slot]] = [next[slot], next[existing]] // swap
    else next[slot] = href
    onChange(next)
    setSlot(s => (s + 1) % 4)
  }

  return (
    <Modal open={open} onClose={onClose} eyebrow="Barra de abajo" title={<>Elige tus <span className="text-ac">accesos</span></>}
      subtitle="Toca un espacio de la barra y luego lo que quieres ahí.">
      {/* Live preview of the bar */}
      <div className="rounded-[24px] bg-p2 p-1.5 grid grid-cols-5 gap-1">
        {pinned.map((href, k) => {
          const it = byHref.get(href)
          if (!it) return null
          const on = k === slot
          return (
            <motion.button key={k} type="button" onClick={() => setSlot(k)} whileTap={{ scale: 0.92 }}
              className={cn('relative isolate h-[64px] rounded-[18px] flex flex-col items-center justify-center gap-1 transition-colors', on ? 'text-onac' : 'text-t')}>
              {on && <motion.span layoutId="slot-pill" transition={SPRING} className="absolute inset-0 -z-10 rounded-[18px] bg-ac" />}
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={href} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 26 }} className="flex flex-col items-center gap-1">
                  <it.icon size={22} weight={on ? 'fill' : 'regular'} />
                  <span className="text-[10px] font-bold leading-none whitespace-nowrap">{it.short}</span>
                </motion.span>
              </AnimatePresence>
            </motion.button>
          )
        })}
        <span className="h-[64px] rounded-[18px] flex flex-col items-center justify-center gap-1 text-mu opacity-60">
          <MoreHorizontal size={22} /><span className="text-[10px] font-bold leading-none">Más</span>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-5">
        {items.map(it => {
          const at = pinned.indexOf(it.href)
          return (
            <motion.button key={it.href} type="button" onClick={() => place(it.href)} whileTap={{ scale: 0.93 }}
              className={cn('relative p-3 rounded-[20px] flex flex-col items-center gap-1.5 text-center transition-colors',
                at >= 0 ? 'bg-ac/15 ring-1 ring-inset ring-ac/50' : 'bg-p2 hover:bg-p3')}>
              {at >= 0 && <span className="absolute top-1.5 right-2 text-[10px] font-bold text-ac">{at + 1}</span>}
              <it.icon size={24} weight="duotone" className={at >= 0 ? 'text-ac' : 'text-t'} />
              <span className="text-[12px] font-semibold leading-tight">{it.label}</span>
            </motion.button>
          )
        })}
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-3 mt-6">
        <button type="button" onClick={onReset} aria-label="Restablecer barra"
          className="h-[52px] w-[52px] rounded-full ring-1 ring-inset ring-t/30 grid place-items-center"><ArrowCounterClockwise size={18} /></button>
        <button type="button" onClick={onClose} className="h-[52px] rounded-full bg-ac text-onac font-semibold">Listo</button>
      </div>
    </Modal>
  )
}

function TabLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined}
      className="relative flex flex-col items-center justify-center gap-1 text-center min-w-0">
      <TabIcon Icon={item.icon} active={active} label={item.short} />
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
      <span className={cn('text-[10px] font-bold leading-none transition-colors whitespace-nowrap', active ? 'text-t' : 'text-mu')}>{label}</span>
    </>
  )
}
