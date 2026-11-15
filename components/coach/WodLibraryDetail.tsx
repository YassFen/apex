'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { WodLeaderboard } from '@/components/wod/WodLeaderboard'
import { WOD_TYPE_META } from '@/lib/utils/wod-types'
import { formatDateOnly } from '@/lib/utils/dates'
import { Copy } from '@/components/ui/icons'
import type { Profile } from '@/lib/types/database'

export function WodLibraryDetail({ profile, wod, results, minDate, maxDate, today }: {
  profile: Profile; wod: any; results: any[]; minDate: string; maxDate: string; today: string
}) {
  const [day, setDay] = useState(today)
  const meta = WOD_TYPE_META[wod.type]
  const movements: any[] = Array.isArray(wod.movements) ? wod.movements : []
  const validDay = day >= minDate && day <= maxDate
  const href = `/coach/publish-wod?box=${wod.box_id}&from=${wod.id}&date=${validDay ? day : today}`

  return (
    <>
      <Topbar title="WOD" profile={profile} backHref="/coach/library" />
      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-2xl w-full mx-auto">
        <Card padding={false}>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {meta && <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${meta.cls}`}>{meta.label}</span>}
              {wod.duration_mins ? <span className="text-mu text-xs tabular-nums">{wod.duration_mins} min</span> : null}
              <span className="text-mu text-xs first-letter:uppercase">{formatDateOnly(wod.scheduled_for, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            <h2 className="font-display text-[30px] leading-tight font-bold text-balance tracking-tight break-words">{wod.title}</h2>
            {wod.description && <p className="text-mu text-sm leading-relaxed whitespace-pre-line mt-2 text-pretty">{wod.description}</p>}
          </div>
          {movements.length > 0 && (
            <ol className="px-5 pb-5 flex flex-col gap-2" aria-label="Movimientos">
              {movements.map((m, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5 px-3.5 bg-p2 rounded-xl">
                  <span className="size-6 rounded-full bg-p3 grid place-items-center text-xs font-bold text-mu tabular-nums flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm break-words">{m.name}</div>
                    {m.weight && <div className="text-xs text-mu">{m.weight}</div>}
                  </div>
                  <span className="font-display text-lg font-bold tabular-nums tracking-tight">{m.sets > 1 ? `${m.sets}×` : ''}{m.reps}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <h3 className="font-display text-lg font-bold tracking-tight">Usar de nuevo</h3>
          <p className="text-mu text-sm mt-1">Elige el día y lo copiamos al editor para que lo ajustes.</p>
          <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
            <input type="date" value={day} min={minDate} max={maxDate} onChange={e => setDay(e.target.value)} aria-label="Día del WOD"
              className="h-12 px-4 rounded-xl bg-p2 text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 min-w-0" />
            <Link href={href}
              className="h-12 px-5 rounded-full bg-ac text-onac font-bold text-sm inline-flex items-center justify-center gap-2 active:scale-[0.96] transition-transform sm:flex-1">
              <Copy size={16} aria-hidden /> Usar de nuevo
            </Link>
          </div>
        </Card>

        <WodLeaderboard results={results} currentUserId={profile.id} />
      </div>
    </>
  )
}
