'use client'
import Link from 'next/link'
import { motion } from 'motion/react'
import { Trophy, ChevronRight, CalendarDays } from '@/components/ui/icons'
import { EASE_OUT } from '@/components/ui/motion'
import { cn } from '@/lib/utils/cn'
import { formatDateOnly } from '@/lib/utils/dates'
import { EVENT_KIND_LABEL, type EventKind } from '@/lib/utils/readiness'

export interface NextEvent { id: string; name: string; kind: EventKind; startsOn: string; days: number; readiness: number | null; going: boolean }

/** Countdown to the athlete's next competition, with their readiness. Links to the calendar when there's none. */
export function NextEventCard({ event }: { event: NextEvent | null }) {
  if (!event) {
    return (
      <Link href="/calendar" className="tap-card flex items-center gap-3 p-4 rounded-[20px] bg-p">
        <span className="size-11 rounded-2xl bg-p2 grid place-items-center text-mu flex-shrink-0"><CalendarDays size={20} aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-sm">Tu calendario</span>
          <span className="block text-mu text-xs">Próximos WODs y competencias. Agrega la tuya y mide tu preparación.</span>
        </span>
        <ChevronRight size={18} className="text-mu" aria-hidden />
      </Link>
    )
  }
  const r = event.readiness
  const tone = r === null ? 'bg-fa' : r >= 85 ? 'bg-gr' : r >= 65 ? 'bg-bl' : r >= 45 ? 'bg-or' : 'bg-rd'
  return (
    <Link href={`/calendar/event/${event.id}`} className="block group">
      <motion.div whileTap={{ scale: 0.985 }} className="relative overflow-hidden rounded-[20px] bg-p p-4 flex items-center gap-4">
        <div className="absolute -left-10 -bottom-12 size-36 rounded-full bg-[radial-gradient(closest-side,rgb(var(--c-rd)/0.25),transparent)]" aria-hidden />
        <div className="relative w-16 text-center flex-shrink-0">
          <div className="font-display text-5xl font-bold leading-none tabular-nums tracking-tight">{event.days <= 0 ? '¡Ya!' : event.days}</div>
          <div className="text-xs text-mu font-semibold mt-0.5">{event.days <= 0 ? 'hoy' : event.days === 1 ? 'día' : 'días'}</div>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-rd text-xs font-semibold ">
            <Trophy size={12} aria-hidden />{EVENT_KIND_LABEL[event.kind] ?? 'Evento'}
          </div>
          <div className="font-display text-lg font-bold leading-tight tracking-tight text-balance break-words">{event.name}</div>
          <div className="text-mu text-xs first-letter:uppercase">{formatDateOnly(event.startsOn, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          {r !== null && (
            <div className="flex items-center gap-2 mt-2">
              <div className="h-1.5 flex-1 rounded-full bg-t/[.08] overflow-hidden">
                <motion.div className={cn('h-full rounded-full', tone)} initial={{ width: 0 }} animate={{ width: `${r}%` }} transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 }} />
              </div>
              <span className="text-xs font-bold tabular-nums">{r}%</span>
            </div>
          )}
        </div>
        <ChevronRight size={18} className="relative text-mu transition-transform group-hover:translate-x-0.5" aria-hidden />
      </motion.div>
    </Link>
  )
}
