'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowsClockwise, Timer } from '@/components/ui/icons'
import { Modal } from '@/components/ui/Modal'
import { EASE_OUT } from '@/components/ui/motion'
import { MUSCLE_LABEL, recoveryByGroup, type Hit } from '@/lib/utils/movement-guide'
import { generateWod } from '@/lib/utils/wod-generator'
import { WOD_TYPE_META } from '@/lib/utils/wod-types'
import { cn } from '@/lib/utils/cn'

/** A suggested workout for days without a box WOD, built around the freshest muscles. */
export function GenerateWodSheet({ open, onClose, hits, maxesLb, unit }: {
  open: boolean; onClose: () => void; hits: Hit[]; maxesLb: Map<string, number>; unit: 'kg' | 'lb'
}) {
  const [seed, setSeed] = useState(() => Date.now() % 100000)
  const recovery = useMemo(() => recoveryByGroup(hits), [hits])
  const wod = useMemo(() => generateWod(recovery, maxesLb, unit, seed), [recovery, maxesLb, unit, seed])
  const meta = WOD_TYPE_META[wod.type]

  return (
    <Modal open={open} onClose={onClose} eyebrow="Generado para ti"
      title={<>Hoy toca <span className="text-ac">{wod.focus.map(g => MUSCLE_LABEL[g].toLowerCase()).join(' y ')}</span></>}>
      <AnimatePresence mode="wait">
        <motion.div key={seed} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15, ease: EASE_OUT }}
          className="rounded-[24px] bg-p2 p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn('px-2.5 py-1 rounded-full text-[11px] font-bold uppercase', meta.cls)}>{meta.label}</span>
            <span className="text-mu text-sm">{wod.minutes} min</span>
          </div>
          <div className="font-display text-3xl font-bold tracking-tight">{wod.title}</div>
          <ul className="mt-4 flex flex-col gap-2.5">
            {wod.movements.map((m, i) => (
              <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i, ease: EASE_OUT }}
                className="flex items-baseline gap-3">
                <span className="font-display text-2xl font-bold text-ac tabular-nums min-w-[2.5rem]">{m.reps}</span>
                <span className="flex-1 font-medium">{m.name}</span>
                {m.load && <span className="text-mu text-sm">{m.load}</span>}
              </motion.li>
            ))}
          </ul>
          <p className="text-mu text-sm mt-4">{wod.note} Elegido porque esos grupos son los más recuperados según lo que registraste.</p>
        </motion.div>
      </AnimatePresence>
      <div className="grid grid-cols-2 gap-3 mt-5">
        <button type="button" onClick={() => setSeed(s => s + 7919)}
          className="h-[52px] rounded-full ring-1 ring-inset ring-t/30 font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition">
          <ArrowsClockwise size={18} aria-hidden /> Otra opción
        </button>
        <Link href={`/timer?mode=${wod.type}&mins=${wod.minutes}&wod=${encodeURIComponent(wod.title)}`}
          className="h-[52px] rounded-full bg-ac text-onac font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition">
          <Timer size={18} weight="fill" aria-hidden /> Empezar
        </Link>
      </div>
    </Modal>
  )
}
