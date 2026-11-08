'use client'
import Link from 'next/link'
import { motion } from 'motion/react'
import { CaretRight, Flag, Plus } from '@/components/ui/icons'
import { Card } from '@/components/ui/Card'
import { daysBetween, todayISO } from '@/lib/utils/dates'
import { UNIT_WORD, isActive, type ChallengeSummary } from '@/lib/utils/challenges'

export type { ChallengeSummary }

/** Home widget: the box challenges you're in, with your progress and place. */
export function ChallengesWidget({ challenges }: { challenges: ChallengeSummary[] | null }) {
  if (challenges === null) return null
  const today = todayISO()
  const mine = challenges.filter(c => c.joined && isActive(c, today)).slice(0, 3)
  const open = challenges.filter(c => !c.joined && isActive(c, today)).length
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Retos del box</h3>
        <Link href="/challenges" className="text-ac text-sm font-semibold flex items-center gap-0.5">Ver todos<CaretRight size={14} /></Link>
      </div>
      {mine.length === 0 ? (
        <Link href="/challenges" className="flex items-center gap-3 p-3 rounded-2xl bg-p2">
          <span className="size-10 rounded-xl bg-or/15 text-or grid place-items-center"><Flag size={20} weight="duotone" /></span>
          <span className="flex-1 text-sm text-mu">{open ? `Hay ${open} reto${open > 1 ? 's' : ''} abierto${open > 1 ? 's' : ''} en tu box. Súmate.` : 'Crea un reto para tu box: “100 burpees esta semana”.'}</span>
          <Plus size={18} className="text-mu" />
        </Link>
      ) : (
        <ul className="flex flex-col gap-3">
          {mine.map(c => {
            const pct = Math.min(100, Math.round((c.myTotal / c.target) * 100))
            const place = c.ranking.findIndex(r => r.total === c.myTotal) + 1
            const left = daysBetween(today, c.endsOn)
            return (
              <li key={c.id}>
                <Link href={`/challenges?open=${c.id}`} className="block">
                  <div className="flex items-baseline justify-between gap-x-3 gap-y-0.5 flex-wrap text-sm mb-1.5">
                    <span className="font-medium min-w-0 break-words">{c.title}</span>
                    <span className="text-mu text-xs flex-shrink-0">#{place} de {c.ranking.length} · {left === 0 ? 'último día' : `${left} d`}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-t/[.08] overflow-hidden">
                    <motion.div className="h-full rounded-full bg-or" initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} />
                  </div>
                  <div className="text-[11px] text-mu mt-1 tabular-nums">{c.myTotal}/{c.target} {UNIT_WORD[c.unit] ?? c.unit} de {c.movement}</div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
