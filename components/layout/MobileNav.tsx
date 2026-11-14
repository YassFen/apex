'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Reorder, motion } from 'motion/react'
import {
  LayoutGrid, Flame, Timer, TrendingUp, Activity, Users, ArrowLeftRight, MoreHorizontal,
  Trophy, Calculator, BarChart3, Gear, History, ChevronRight, CalendarDays, Medal, BookOpenText, Flag,
  SlidersHorizontal, ArrowCounterClockwise,
} from '@/components/ui/icons'
import { cn } from '@/lib/utils/cn'
import { SPRING } from '@/components/ui/motion'
import { useShell, type ViewMode } from '@/lib/hooks/useShell'
import { Modal } from '@/components/ui/Modal'
import { MorphIcon } from '@/components/ui/MorphIcon'
import { playSound } from '@/lib/utils/sound'
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
        className="fixed z-40 lg:hidden inset-x-0 bottom-[calc(10px+env(safe-area-inset-bottom))] px-3 pointer-events-none">
        <div className="glass-bar pointer-events-auto mx-auto max-w-[460px] h-[64px] p-1.5 rounded-full flex items-stretch gap-0.5">
          {tabs.map(item => (
            <TabLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
          <button type="button" onClick={() => { playSound('tap'); setMoreOpen(true) }} aria-haspopup="dialog" aria-expanded={moreOpen} aria-label="Más"
            className={cn('relative isolate flex-1 min-w-0 rounded-full flex flex-col items-center justify-center gap-0.5 transition-colors',
              moreActive || moreOpen ? 'text-onac' : 'text-t/70')}>
            {(moreActive || moreOpen) && <motion.span layoutId="tab-pill" transition={SPRING} className="absolute inset-0 -z-10 rounded-full bg-ac shadow-e1" aria-hidden />}
            <MorphIcon icon={moreOpen ? 'cross' : 'more'} size={22} strokeWidth={moreOpen ? 1.6 : 2.4} />
            <span className="text-[10px] font-semibold leading-none">Más</span>
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
      subtitle="Toca un espacio y luego lo que quieres ahí.">
      {/* Live preview of the bar: tap a slot to fill it, drag a slot to move it */}
      <div className="rounded-full bg-p2 p-1.5 flex gap-1">
        <Reorder.Group axis="x" values={pinned} onReorder={next => { onChange(next as string[]) }} className="flex flex-[4] gap-1 min-w-0">
          {pinned.map((href, k) => {
            const it = byHref.get(href)
            if (!it) return null
            const on = k === slot
            return (
              <Reorder.Item key={href} value={href} onTap={() => setSlot(k)} whileDrag={{ scale: 1.08, zIndex: 5 }}
                onDragStart={() => playSound('tick')} onDragEnd={() => playSound('tap')}
                className={cn('relative isolate flex-1 min-w-0 h-[56px] rounded-full flex flex-col items-center justify-center gap-0.5 cursor-grab active:cursor-grabbing select-none touch-none transition-colors',
                  on ? 'text-onac' : 'text-t')}>
                {on && <motion.span layoutId="slot-pill" transition={SPRING} className="absolute inset-0 -z-10 rounded-full bg-ac" />}
                <it.icon size={22} weight={on ? 'fill' : 'regular'} />
                <span className="text-[10px] font-semibold leading-none whitespace-nowrap">{it.short}</span>
              </Reorder.Item>
            )
          })}
        </Reorder.Group>
        <span className="flex-1 h-[56px] rounded-full flex flex-col items-center justify-center gap-0.5 text-mu opacity-60">
          <MoreHorizontal size={22} /><span className="text-[10px] font-semibold leading-none">Más</span>
        </span>
      </div>
      <p className="text-center text-xs text-mu mt-2">Mantén y arrastra para cambiar el orden</p>

      <div className="grid grid-cols-2 gap-2 mt-5">
        {items.map(it => {
          const at = pinned.indexOf(it.href)
          return (
            <motion.button key={it.href} type="button" onClick={() => place(it.href)} whileTap={{ scale: 0.95 }}
              className={cn('relative h-14 px-3 rounded-[18px] flex items-center gap-2.5 text-left transition-colors min-w-0',
                at >= 0 ? 'bg-ac/15 ring-1 ring-inset ring-ac/50' : 'bg-p2 hover:bg-p3')}>
              <it.icon size={22} weight="duotone" className={cn('flex-shrink-0', at >= 0 ? 'text-ac' : 'text-t')} />
              <span className="text-[13px] font-semibold whitespace-nowrap overflow-hidden">{it.label}</span>
              {at >= 0 && <span className="ml-auto flex-shrink-0 size-5 rounded-full bg-ac text-onac text-[10px] font-bold grid place-items-center">{at + 1}</span>}
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
  const Icon = item.icon
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} onClick={() => { if (!active) playSound('tap') }}
      className={cn('relative isolate flex-1 min-w-0 rounded-full flex flex-col items-center justify-center gap-0.5 transition-colors',
        active ? 'text-onac' : 'text-t/70')}>
      {active && <motion.span layoutId="tab-pill" transition={SPRING} className="absolute inset-0 -z-10 rounded-full bg-ac shadow-e1" aria-hidden />}
      <motion.span animate={{ scale: active ? 1.06 : 1, y: active ? -0.5 : 0 }} transition={SPRING} className="grid place-items-center">
        <Icon size={22} weight={active ? 'fill' : 'regular'} aria-hidden />
      </motion.span>
      <span className="text-[10px] font-semibold leading-none whitespace-nowrap">{item.short}</span>
    </Link>
  )
}
