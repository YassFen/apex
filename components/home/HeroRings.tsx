'use client'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Sparkle, Plus, PencilSimple, CalendarCheck, Trophy, Fire, Barbell, Target, Flag, Heartbeat, X, Check,
} from '@/components/ui/icons'
import { Modal } from '@/components/ui/Modal'
import { AnimatedNumber, EASE_OUT } from '@/components/ui/motion'
import { BodyFigure } from '@/components/home/BodyFigure'
import { MUSCLE_LABEL, lastHitLabel, recoveryByGroup, type Hit, type MuscleGroup } from '@/lib/utils/movement-guide'
import { cn } from '@/lib/utils/cn'

/* ── What can go in the ring ──────────────────────────────────────────────── */

export interface HeroData {
  hits: Hit[]
  weekDays: number
  streak: number
  readiness: { name: string; score: number; days: number } | null
  maxes: { name: string; valueLb: number }[]
  goals: { id: string; movement: string; target: number; done: number; period: string }[]
  challenges: { id: string; title: string; target: number; myTotal: number; joined: boolean }[]
  unit: 'kg' | 'lb'
}

interface Tile {
  id: string
  kind: 'recovery' | 'week' | 'streak' | 'event' | 'pr' | 'goal' | 'challenge'
  title: string
  value: number          // 0-100, how full the ring is
  number: number         // the big number
  suffix: string
  sub: string
  subTone: string
  foot: string
  tone: string           // text-* class for the ring and icon
  glow: string           // rgb var for the background wash
  group?: MuscleGroup
}

const STORE = 'apex.heroTiles'
const DEFAULT_TILES = ['recovery', 'week', 'event', 'streak']
const MUSCLES = (Object.keys(MUSCLE_LABEL) as MuscleGroup[])

const toneFor = (v: number) => (v < 40 ? ['text-rd', '--c-rd'] : v < 75 ? ['text-or', '--c-or'] : ['text-gr', '--c-gr'])
const kgOrLb = (lb: number, unit: 'kg' | 'lb') => (unit === 'kg' ? Math.round(lb * 0.453592 * 2) / 2 : Math.round(lb))

/** Every tile the athlete could pick, with live values. */
function allTiles(d: HeroData): Tile[] {
  const rec = recoveryByGroup(d.hits)
  const recTile = (g: MuscleGroup, id: string, auto = false): Tile => {
    const r = rec.find(x => x.group === g) ?? { pct: 100, daysToFull: 0, lastAt: null }
    const [tone, glow] = toneFor(r.pct)
    return {
      id, kind: 'recovery', group: g, title: auto ? `${MUSCLE_LABEL[g]}` : MUSCLE_LABEL[g], value: r.pct, number: r.pct, suffix: '%',
      sub: r.daysToFull > 0 ? `${r.daysToFull} ${r.daysToFull === 1 ? 'día' : 'días'} para recuperar` : 'Listo para entrenar',
      subTone: r.daysToFull > 0 ? 'text-rd' : 'text-gr', foot: lastHitLabel(r.lastAt), tone, glow,
    }
  }
  const worst = rec.filter(r => r.group !== 'motor')[0]?.group ?? 'piernas'
  const tiles: Tile[] = [
    recTile(worst, 'recovery', true),
    ...MUSCLES.map(g => recTile(g, `recovery:${g}`)),
    {
      id: 'week', kind: 'week', title: 'Esta semana', value: Math.min(100, (d.weekDays / 4) * 100), number: d.weekDays, suffix: '/4',
      sub: d.weekDays >= 4 ? 'Meta semanal cumplida' : `Te faltan ${4 - d.weekDays} días`, subTone: d.weekDays >= 4 ? 'text-gr' : 'text-mu',
      foot: 'Días entrenados', tone: 'text-ac', glow: '--c-ac',
    },
    {
      id: 'streak', kind: 'streak', title: 'Racha', value: Math.min(100, (d.streak / 14) * 100), number: d.streak, suffix: d.streak === 1 ? ' día' : ' días',
      sub: d.streak >= 7 ? 'Imparable' : d.streak > 0 ? 'Sigue así mañana' : 'Entrena hoy para empezar', subTone: d.streak > 0 ? 'text-or' : 'text-mu',
      foot: 'Días seguidos entrenando', tone: 'text-or', glow: '--c-or',
    },
  ]
  if (d.readiness) {
    const [tone, glow] = toneFor(d.readiness.score)
    tiles.push({ id: 'event', kind: 'event', title: d.readiness.name, value: d.readiness.score, number: d.readiness.score, suffix: '%',
      sub: d.readiness.days > 0 ? `Faltan ${d.readiness.days} días` : 'Es hoy', subTone: 'text-rd', foot: 'Preparación para la competencia', tone, glow })
  }
  for (const m of d.maxes) {
    const v = kgOrLb(m.valueLb, d.unit)
    const step = d.unit === 'kg' ? 10 : 25
    const next = Math.ceil((v + 0.01) / step) * step
    tiles.push({ id: `pr:${m.name}`, kind: 'pr', title: m.name, value: Math.round((v / next) * 100), number: v, suffix: ` ${d.unit}`,
      sub: `${Math.round((next - v) * 10) / 10} ${d.unit} para ${next}`, subTone: 'text-ac', foot: 'Tu 1RM', tone: 'text-ac', glow: '--c-ac' })
  }
  for (const g of d.goals) {
    const pct = Math.min(100, Math.round((g.done / g.target) * 100))
    tiles.push({ id: `goal:${g.id}`, kind: 'goal', title: g.movement, value: pct, number: g.done, suffix: `/${g.target}`,
      sub: pct >= 100 ? 'Meta cumplida' : `Te faltan ${g.target - g.done}`, subTone: pct >= 100 ? 'text-gr' : 'text-bl',
      foot: g.period === 'today' || g.period === 'daily' ? 'Meta de hoy' : 'Meta de la semana', tone: 'text-bl', glow: '--c-bl' })
  }
  for (const c of d.challenges.filter(c => c.joined)) {
    const pct = Math.min(100, Math.round((c.myTotal / c.target) * 100))
    tiles.push({ id: `challenge:${c.id}`, kind: 'challenge', title: c.title, value: pct, number: c.myTotal, suffix: `/${c.target}`,
      sub: pct >= 100 ? 'Reto completado' : `${pct}% del reto`, subTone: 'text-or', foot: 'Reto del box', tone: 'text-or', glow: '--c-or' })
  }
  return tiles
}

function TileIcon({ tile, className }: { tile: Tile; className?: string }) {
  if (tile.kind === 'recovery' && tile.group) {
    return tile.group === 'motor'
      ? <Heartbeat weight="duotone" className={cn(tile.tone, className)} />
      : <BodyFigure group={tile.group} className={cn(tile.tone, className)} />
  }
  const Icon = { week: CalendarCheck, streak: Fire, event: Trophy, pr: Barbell, goal: Target, challenge: Flag, recovery: Heartbeat }[tile.kind]
  return <Icon weight="duotone" className={cn(tile.tone, className)} />
}

/* ── The hero ─────────────────────────────────────────────────────────────── */

export function HeroRings({ data, onLog, onGenerate }: { data: HeroData; onLog: () => void; onGenerate: () => void }) {
  const tiles = useMemo(() => allTiles(data), [data])
  const [chosen, setChosen] = useState<string[]>(DEFAULT_TILES)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(STORE) ?? 'null'); if (Array.isArray(v) && v.length) setChosen(v) } catch {}
  }, [])
  function save(next: string[]) {
    setChosen(next)
    try { localStorage.setItem(STORE, JSON.stringify(next)) } catch {}
  }

  const pages = chosen.map(id => tiles.find(t => t.id === id)).filter((t): t is Tile => !!t)
  const shown = pages.length ? pages : tiles.filter(t => DEFAULT_TILES.includes(t.id))
  const [i, setI] = useState(0)
  const [dir, setDir] = useState(1)
  const page = shown[Math.min(i, shown.length - 1)]
  const go = (n: number) => { const next = (i + n + shown.length) % shown.length; setDir(n); setI(next) }

  const R = 92, C = 2 * Math.PI * R, ARC = 0.78
  if (!page) return null
  const fill = Math.max(0.03, page.value / 100)
  // Where the arc ends, for the glowing head dot (the svg is rotated 130°).
  const ang = ((130 + 360 * ARC * fill) * Math.PI) / 180
  const head = { x: 110 + R * Math.cos(ang), y: 110 + R * Math.sin(ang) }

  return (
    <section data-tour="hero" className="relative -mx-4 lg:mx-0 px-4 pt-2 pb-5 lg:rounded-[32px] overflow-hidden" aria-label="Tu estado">
      {/* Background wash follows the tile's tone */}
      <AnimatePresence initial={false}>
        <motion.div key={page.glow} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
          className="absolute inset-0 -z-10" aria-hidden
          style={{ background: `radial-gradient(110% 75% at 50% 15%, rgb(var(${page.glow}) / 0.20), transparent 65%)` }} />
      </AnimatePresence>

      <button type="button" onClick={() => setEditing(true)} aria-label="Elegir qué mostrar"
        className="absolute top-2 right-4 z-10 h-9 px-3 rounded-full bg-p/80 text-sm font-medium flex items-center gap-1.5 active:scale-95 transition">
        <PencilSimple size={15} /> Editar
      </button>

      <motion.div className="relative mx-auto w-[260px] h-[250px] touch-pan-y cursor-grab active:cursor-grabbing"
        drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.25}
        onDragEnd={(_, info) => { if (info.offset.x < -50) go(1); else if (info.offset.x > 50) go(-1) }}>
        <svg viewBox="0 0 220 220" className="absolute inset-0 w-full h-full" aria-hidden>
          <g transform="rotate(130 110 110)">
            <circle cx="110" cy="110" r={R} fill="none" strokeWidth="16" strokeLinecap="round" className="stroke-t/10" strokeDasharray={`${C * ARC} ${C}`} />
            {/* tick marks */}
            {Array.from({ length: 21 }, (_, k) => {
              const a = (k / 20) * 2 * Math.PI * ARC
              return <line key={k} x1={110 + (R - 14) * Math.cos(a)} y1={110 + (R - 14) * Math.sin(a)} x2={110 + (R - 18) * Math.cos(a)} y2={110 + (R - 18) * Math.sin(a)} className="stroke-t/15" strokeWidth="1.5" strokeLinecap="round" />
            })}
            <motion.circle key={page.id} cx="110" cy="110" r={R} fill="none" strokeWidth="16" strokeLinecap="round"
              className={cn('stroke-current', page.tone)} strokeDasharray={`${C * ARC} ${C}`}
              initial={{ strokeDashoffset: C * ARC }} animate={{ strokeDashoffset: C * ARC * (1 - fill) }}
              transition={{ duration: 1, ease: EASE_OUT }} />
          </g>
          <motion.g key={`h-${page.id}`} initial={{ x: 110 + R * Math.cos((130 * Math.PI) / 180), y: 110 + R * Math.sin((130 * Math.PI) / 180), opacity: 0 }}
            animate={{ x: head.x, y: head.y, opacity: 1 }} transition={{ duration: 1, ease: EASE_OUT }}>
            <circle r="13" className={cn('fill-current animate-glow', page.tone)} opacity={0.22} />
            <circle r="4.5" className="fill-white" />
          </motion.g>
        </svg>

        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.div key={page.id} custom={dir}
            initial={{ opacity: 0, x: dir * 36, scale: 0.94 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: dir * -36, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="absolute inset-0">
            <div className="absolute left-1/2 top-[47%] -translate-x-1/2 -translate-y-1/2 w-[164px] flex flex-col items-center text-center">
              <motion.span initial={{ scale: 0.5, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.05 }}
                className="h-11 grid place-items-center animate-floaty">
                <TileIcon tile={page} className={page.kind === 'recovery' && page.group !== 'motor' ? 'h-12 w-8' : 'size-10'} />
              </motion.span>
              <div className={cn('font-bold tracking-tight max-w-full mt-1.5 leading-tight line-clamp-2 text-balance break-words', page.title.length > 18 ? 'text-[13px]' : 'text-base')}>{page.title}</div>
              <div className={cn('font-display leading-none font-bold tracking-tight tabular-nums mt-1 whitespace-nowrap',
                `${page.number}${page.suffix}`.length > 7 ? 'text-[32px]' : `${page.number}${page.suffix}`.length > 5 ? 'text-[38px]' : 'text-[44px]')}>
                <AnimatedNumber value={page.number} decimals={page.number % 1 ? 1 : 0} />
                <span className="text-xl text-mu font-semibold">{page.suffix}</span>
              </div>
              <div className={cn('text-[12px] font-semibold mt-1.5 leading-tight max-w-full text-balance', page.subTone)}>{page.sub}</div>
            </div>
            {/* footnote in the opening at the bottom of the ring */}
            <div className="absolute inset-x-12 -bottom-1 text-center text-mu text-[11px] leading-tight text-balance">{page.foot}</div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <div className="flex justify-center gap-1.5 mt-6 mb-5" role="tablist" aria-label="Indicadores">
        {shown.map((p, k) => (
          <button key={p.id} type="button" role="tab" aria-selected={k === i} aria-label={p.title}
            onClick={() => { setDir(k > i ? 1 : -1); setI(k) }}
            className={cn('h-1.5 rounded-full transition-all duration-300', k === i ? 'w-5 bg-t' : 'w-1.5 bg-t/25')} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
        <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={onLog}
          className="h-[52px] rounded-2xl bg-t text-bg font-semibold flex items-center justify-center gap-2">
          <Plus size={18} weight="bold" aria-hidden /> Registrar
        </motion.button>
        <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={onGenerate}
          className="h-[52px] rounded-2xl bg-ac text-onac font-semibold flex items-center justify-center gap-2 shadow-[0_10px_30px_-10px_rgb(var(--c-ac)/0.7)]">
          <Sparkle size={18} weight="fill" aria-hidden /> Generar WOD
        </motion.button>
      </div>

      <TilePicker open={editing} onClose={() => setEditing(false)} tiles={tiles} chosen={chosen}
        onChange={next => { save(next); setI(0) }} />
    </section>
  )
}

/* ── Visual editor: your ring tiles on top, a gallery of everything else ───── */

const GROUPS: { label: string; match: (t: Tile) => boolean }[] = [
  { label: 'Tu cuerpo', match: t => t.kind === 'recovery' },
  { label: 'Constancia', match: t => t.kind === 'week' || t.kind === 'streak' },
  { label: 'Tus récords', match: t => t.kind === 'pr' },
  { label: 'Metas, retos y competencias', match: t => t.kind === 'goal' || t.kind === 'challenge' || t.kind === 'event' },
]

function MiniRing({ tile }: { tile: Tile }) {
  const r = 26, C = 2 * Math.PI * r
  return (
    <span className="relative size-[68px] grid place-items-center">
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" className="stroke-t/10" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className={cn('stroke-current', tile.tone)}
          strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0.04, tile.value / 100))} />
      </svg>
      <TileIcon tile={tile} className="size-7" />
    </span>
  )
}

function TilePicker({ open, onClose, tiles, chosen, onChange }: {
  open: boolean; onClose: () => void; tiles: Tile[]; chosen: string[]; onChange: (ids: string[]) => void
}) {
  const byId = new Map(tiles.map(t => [t.id, t]))
  const mine = chosen.filter(id => byId.has(id))
  const toggle = (id: string) => onChange(mine.includes(id) ? mine.filter(x => x !== id) : [...mine, id])

  return (
    <Modal open={open} onClose={onClose} eyebrow="Tu anillo" title={<>¿Qué quieres <span className="text-ac">ver</span>?</>}>
      {/* Current tiles, in order — tap × to remove */}
      <div className="-mx-5 sm:-mx-7 px-5 sm:px-7 flex gap-2 overflow-x-auto scrollbar-none pb-1">
        <AnimatePresence initial={false}>
          {mine.map((id, k) => {
            const t = byId.get(id) as Tile
            return (
              <motion.button key={id} type="button" onClick={() => toggle(id)} aria-label={`Quitar ${t.title}`}
                initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                className="relative flex-shrink-0 w-[92px] p-2 pt-3 rounded-[20px] bg-p2 flex flex-col items-center gap-1">
                <span className="absolute top-1.5 left-2 text-[10px] font-bold text-mu">{k + 1}</span>
                <span className="absolute -top-1 -right-1 size-6 rounded-full bg-rd text-white grid place-items-center shadow"><X size={12} weight="bold" /></span>
                <MiniRing tile={t} />
                <span className="text-[11px] font-semibold text-center leading-tight line-clamp-2">{t.title}</span>
              </motion.button>
            )
          })}
        </AnimatePresence>
        {mine.length === 0 && <p className="text-mu text-sm py-6">Elige al menos una ficha abajo.</p>}
      </div>

      <div className="flex flex-col gap-5 mt-5">
        {GROUPS.map(g => {
          const items = tiles.filter(g.match)
          if (!items.length) return null
          return (
            <div key={g.label}>
              <div className="text-[13px] text-mu font-medium mb-2 px-1">{g.label}</div>
              <div className="grid grid-cols-3 gap-2">
                {items.map(t => {
                  const on = mine.includes(t.id)
                  return (
                    <motion.button key={t.id} type="button" onClick={() => toggle(t.id)} whileTap={{ scale: 0.93 }}
                      className={cn('relative p-2 pt-3 rounded-[20px] flex flex-col items-center gap-1 transition-colors',
                        on ? 'bg-ac/15 ring-2 ring-inset ring-ac' : 'bg-p2 hover:bg-p3')}>
                      <span className={cn('absolute top-1.5 right-1.5 size-5 rounded-full grid place-items-center transition-colors', on ? 'bg-ac text-onac' : 'bg-t/10 text-mu')}>
                        {on ? <Check size={11} weight="bold" /> : <Plus size={11} weight="bold" />}
                      </span>
                      <MiniRing tile={t} />
                      <span className="text-[11px] font-semibold text-center leading-tight line-clamp-2">{t.title}</span>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <button type="button" onClick={onClose} disabled={mine.length === 0}
        className="w-full h-[52px] mt-6 rounded-full bg-ac text-onac font-semibold disabled:opacity-50">Listo</button>
    </Modal>
  )
}
