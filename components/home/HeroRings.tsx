'use client'
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Sparkle, Plus } from '@/components/ui/icons'
import { EASE_OUT } from '@/components/ui/motion'
import { MUSCLE_LABEL, lastHitLabel, recoveryByGroup, type Hit } from '@/lib/utils/movement-guide'
import { cn } from '@/lib/utils/cn'

interface Page { key: string; title: string; value: number; display: string; sub: string; subTone: string; foot: string; tone: string }

const toneFor = (v: number) => (v < 40 ? 'text-rd' : v < 75 ? 'text-or' : 'text-gr')

/**
 * The home hero: a big ring you swipe through — muscle recovery per group, the week,
 * and event readiness — with the two main actions underneath.
 */
export function HeroRings({ hits, weekDays, weekTarget = 4, readiness, onLog, onGenerate }: {
  hits: Hit[]; weekDays: number; weekTarget?: number
  readiness: { name: string; score: number; days: number } | null
  onLog: () => void; onGenerate: () => void
}) {
  const pages = useMemo<Page[]>(() => {
    const rec = recoveryByGroup(hits).filter(r => r.group !== 'motor')
    const out: Page[] = rec.slice(0, 6).map(r => ({
      key: r.group, title: MUSCLE_LABEL[r.group], value: r.pct, display: `${r.pct}%`,
      sub: r.daysToFull > 0 ? `${r.daysToFull} ${r.daysToFull === 1 ? 'día' : 'días'} para recuperar` : 'Listo para entrenar',
      subTone: r.daysToFull > 0 ? 'text-rd' : 'text-gr', foot: lastHitLabel(r.lastAt), tone: toneFor(r.pct),
    }))
    const wk = Math.min(100, Math.round((weekDays / weekTarget) * 100))
    out.push({ key: 'week', title: 'Esta semana', value: wk, display: `${weekDays}/${weekTarget}`,
      sub: weekDays >= weekTarget ? 'Meta semanal cumplida' : `Te faltan ${weekTarget - weekDays} días`, subTone: weekDays >= weekTarget ? 'text-gr' : 'text-mu',
      foot: 'Días entrenados', tone: 'text-ac' })
    if (readiness) out.push({ key: 'event', title: readiness.name, value: readiness.score, display: `${readiness.score}%`,
      sub: readiness.days > 0 ? `Faltan ${readiness.days} días` : 'Es hoy', subTone: 'text-rd', foot: 'Preparación para la competencia', tone: toneFor(readiness.score) })
    return out
  }, [hits, weekDays, weekTarget, readiness])

  const [i, setI] = useState(0)
  const [dir, setDir] = useState(1)
  const page = pages[Math.min(i, pages.length - 1)]
  const go = (n: number) => { const next = Math.max(0, Math.min(pages.length - 1, i + n)); if (next !== i) { setDir(n); setI(next) } }

  const R = 92, C = 2 * Math.PI * R, ARC = 0.78 // open ring, like a gauge
  return (
    <section className="relative -mx-4 lg:mx-0 px-4 pt-2 pb-5 lg:rounded-[32px] overflow-hidden" aria-label="Tu estado">
      {/* Soft ambient wash behind the ring */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_20%_0%,rgb(var(--c-rd)/0.18),transparent_60%),radial-gradient(90%_70%_at_100%_30%,rgb(var(--c-ac)/0.16),transparent_60%)]" aria-hidden />

      <motion.div className="relative mx-auto w-[260px] h-[250px] touch-pan-y cursor-grab active:cursor-grabbing"
        drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.25}
        onDragEnd={(_, info) => { if (info.offset.x < -50) go(1); else if (info.offset.x > 50) go(-1) }}>
        <svg viewBox="0 0 220 220" className="absolute inset-0 w-full h-full rotate-[130deg]" aria-hidden>
          <circle cx="110" cy="110" r={R} fill="none" strokeWidth="16" strokeLinecap="round" className="stroke-t/10"
            strokeDasharray={`${C * ARC} ${C}`} />
          <motion.circle key={page.key} cx="110" cy="110" r={R} fill="none" strokeWidth="16" strokeLinecap="round"
            className={cn('stroke-current', page.tone)}
            strokeDasharray={`${C * ARC} ${C}`}
            initial={{ strokeDashoffset: C * ARC }}
            animate={{ strokeDashoffset: C * ARC * (1 - Math.max(0.03, page.value / 100)) }}
            transition={{ duration: 0.9, ease: EASE_OUT }} />
        </svg>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div key={page.key} custom={dir}
            initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
            <div className="text-xl font-bold tracking-tight truncate max-w-full">{page.title}</div>
            <div className="font-display text-[52px] leading-none font-bold tracking-tight tabular-nums mt-1">{page.display}</div>
            <div className={cn('text-[13px] font-semibold mt-1.5', page.subTone)}>{page.sub}</div>
            <div className="text-mu text-xs mt-3">{page.foot}</div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <div className="flex justify-center gap-1.5 -mt-2 mb-5" role="tablist" aria-label="Indicadores">
        {pages.map((p, k) => (
          <button key={p.key} type="button" role="tab" aria-selected={k === i} aria-label={p.title}
            onClick={() => { setDir(k > i ? 1 : -1); setI(k) }}
            className={cn('h-1.5 rounded-full transition-all duration-300', k === i ? 'w-4 bg-t' : 'w-1.5 bg-t/25')} />
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
    </section>
  )
}
