'use client'
import { motion } from 'motion/react'
import { addDaysISO, formatDateOnly, todayISO } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'

const WEEKS = 18
const LEVEL = ['bg-t/[.07]', 'bg-ac/35', 'bg-ac/60', 'bg-ac']

/** Training days over the last ~4 months, one square per day (darker = more logged that day). */
export function ActivityHeatmap({ counts }: { counts: Map<string, number> }) {
  const today = todayISO()
  const [y, m, d] = today.split('-').map(Number)
  const offset = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
  const start = addDaysISO(today, -offset - (WEEKS - 1) * 7)
  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, k) => addDaysISO(start, w * 7 + k)))
  const total = [...counts.entries()].filter(([k]) => k >= start).reduce((s, [, v]) => s + (v > 0 ? 1 : 0), 0)

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-mu text-sm">{total} días entrenados en {WEEKS} semanas</span>
      </div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-rows-7 gap-[3px]">
            {week.map((day, di) => {
              const n = day > today ? -1 : counts.get(day) ?? 0
              return (
                <motion.span key={day}
                  initial={{ opacity: 0, scale: 0.4 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
                  transition={{ delay: (wi * 7 + di) * 0.003, duration: 0.25 }}
                  title={`${formatDateOnly(day, { day: 'numeric', month: 'short' })}${n > 0 ? ` · ${n} registro${n > 1 ? 's' : ''}` : ''}`}
                  className={cn('aspect-square rounded-[3px]', n < 0 ? 'bg-transparent' : LEVEL[Math.min(3, n)], day === today && 'ring-1 ring-t/60')} />
              )
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-fa">
        Menos {LEVEL.map(c => <span key={c} className={cn('size-2.5 rounded-[2px]', c)} />)} Más
      </div>
    </div>
  )
}
