'use client'
import { useEffect, useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { Badge } from '@/components/ui/Badge'
import { SupportSheet, TICKET_KINDS } from '@/components/support/SupportSheet'
import { Lifebuoy, ChatCircleText, Plus } from '@/components/ui/icons'
import { useShell } from '@/lib/hooks/useShell'
import { createClient } from '@/lib/supabase/client'
import { formatDateOnly, toDateInput } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'
import type { Profile } from '@/lib/types/database'

export interface MyTicket { id: string; kind: string; message: string; status: 'open' | 'answered' | 'closed'; reply: string | null; replied_at: string | null; seen_reply: boolean; created_at: string }

const STATUS = { open: { label: 'Recibido', color: 'neutral' }, answered: { label: 'Respondido', color: 'green' }, closed: { label: 'Cerrado', color: 'neutral' } } as const

export function SupportView({ profile, tickets, missing, openNew, from }: { profile: Profile; tickets: MyTicket[]; missing: boolean; openNew: boolean; from?: string }) {
  const { activeBoxId } = useShell()
  const [sheet, setSheet] = useState(openNew)

  // Opening this screen marks the answers as read.
  useEffect(() => {
    const unseen = tickets.filter(t => t.reply && !t.seen_reply)
    if (!unseen.length) return
    const supabase = createClient()
    unseen.forEach(t => { void supabase.rpc('ticket_seen', { p_id: t.id }).then(() => {}) })
  }, [tickets])

  return (
    <>
      <Topbar title="Ayuda" profile={profile} />
      <div className="p-4 lg:p-6 grid grid-cols-1 gap-4 max-w-2xl w-full">
        <div className="rounded-[22px] bg-p p-5 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="size-12 rounded-2xl bg-bl/15 text-bl grid place-items-center flex-shrink-0"><Lifebuoy size={26} weight="duotone" aria-hidden /></span>
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight">¿Algo no funciona?</h2>
              <p className="text-sm text-mu text-pretty">Cuéntanos qué pasó. También puedes mandarnos ideas o dudas.</p>
            </div>
          </div>
          <button type="button" onClick={() => setSheet(true)} disabled={missing}
            className="h-12 rounded-full bg-ac text-onac font-bold flex items-center justify-center gap-2 disabled:opacity-40"><Plus size={18} weight="bold" aria-hidden /> Escribir a soporte</button>
          {missing && <p className="text-xs text-or">El envío de mensajes estará disponible muy pronto.</p>}
        </div>

        {tickets.length > 0 && <h2 className="text-xs font-semibold text-mu mt-2">Tus mensajes</h2>}
        <ul className="flex flex-col gap-3">
          {tickets.map(t => {
            const kind = TICKET_KINDS.find(k => k.k === t.kind)
            const fresh = !!t.reply && !t.seen_reply
            return (
              <li key={t.id} className={cn('rounded-[20px] bg-p p-4 flex flex-col gap-3', fresh && 'ring-1 ring-inset ring-gr/60')}>
                <div className="flex items-center gap-2">
                  {kind && <kind.Icon size={16} className="text-mu" aria-hidden />}
                  <span className="text-xs font-semibold text-mu">{kind?.label ?? t.kind}</span>
                  <Badge color={STATUS[t.status].color}>{fresh ? 'Respuesta nueva' : STATUS[t.status].label}</Badge>
                  <span className="ml-auto text-xs text-fa">{formatDateOnly(toDateInput(t.created_at), { day: 'numeric', month: 'short' })}</span>
                </div>
                <p className="text-sm whitespace-pre-line text-pretty">{t.message}</p>
                {t.reply && (
                  <div className="rounded-2xl bg-p2 p-3.5 flex gap-2.5">
                    <ChatCircleText size={18} className="text-ac flex-shrink-0 mt-0.5" weight="fill" aria-hidden />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-ac mb-0.5">Equipo APEX{t.replied_at ? ` · ${formatDateOnly(toDateInput(t.replied_at), { day: 'numeric', month: 'short' })}` : ''}</div>
                      <p className="text-sm whitespace-pre-line text-pretty">{t.reply}</p>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      <SupportSheet open={sheet} onClose={() => setSheet(false)} userId={profile.id} boxId={activeBoxId} from={from} />
    </>
  )
}
