'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { inputBase } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { Chips, Stat } from '@/components/manage/ui'
import { PageTitle } from '@/components/admin/AdminChrome'
import { MorphIcon } from '@/components/ui/MorphIcon'
import { TICKET_KINDS } from '@/components/support/SupportSheet'
import { createClient } from '@/lib/supabase/client'
import { screenName } from '@/lib/utils/platform-shared'
import { friendlyError } from '@/lib/utils/errors'
import { cn } from '@/lib/utils/cn'

export interface Ticket {
  id: string; user_id: string; name: string; email: string; box: string | null; kind: string; message: string; path: string | null
  context: Record<string, any> | null; status: 'open' | 'answered' | 'closed'; reply: string | null; replied_at: string | null; created_at: string
}
type Tab = 'open' | 'answered' | 'closed'

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 60) return `hace ${m} min`
  if (m < 1440) return `hace ${Math.round(m / 60)} h`
  return `hace ${Math.round(m / 1440)} días`
}

export function SupportInbox({ tickets, me }: { tickets: Ticket[]; me: string }) {
  const [tab, setTab] = useState<Tab>('open')
  const n = (t: Tab) => tickets.filter(x => x.status === t).length
  const bugs = tickets.filter(t => t.status === 'open' && t.kind === 'bug').length
  const shown = tickets.filter(t => t.status === tab)
  return (
    <>
      <PageTitle title="Soporte" sub="Mensajes que las personas envían desde Ayuda o desde una pantalla que falló. Tu respuesta les llega como aviso dentro de la app." />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Por responder" value={n('open')} tone={n('open') ? 'text-or' : 'text-gr'} />
        <Stat label="Reportes de fallas" value={bugs} tone={bugs ? 'text-rd' : undefined} hint="sin responder" />
        <Stat label="Respondidos" value={n('answered')} />
      </div>
      <Chips label="Estado" value={tab} onChange={setTab} options={[
        { key: 'open', label: 'Por responder', count: n('open'), tone: 'text-or' }, { key: 'answered', label: 'Respondidos', count: n('answered') }, { key: 'closed', label: 'Cerrados', count: n('closed') },
      ]} />
      <ul className="flex flex-col gap-3 mt-4">
        {shown.length === 0 && <li className="p-4 rounded-2xl bg-p text-sm text-mu">{tab === 'open' ? 'Nada pendiente.' : 'Nada aquí.'}</li>}
        {shown.map(t => <TicketCard key={t.id} t={t} me={me} />)}
      </ul>
    </>
  )
}

function TicketCard({ t, me }: { t: Ticket; me: string }) {
  const router = useRouter()
  const { fire } = useToast()
  const [reply, setReply] = useState(t.reply ?? '')
  const [details, setDetails] = useState(false)
  const [busy, setBusy] = useState(false)
  const kind = TICKET_KINDS.find(k => k.k === t.kind)
  const ctx = t.context ?? {}

  async function save(status: Ticket['status']) {
    setBusy(true)
    const patch = status === 'answered'
      ? { status, reply: reply.trim(), replied_by: me, replied_at: new Date().toISOString(), seen_reply: false }
      : { status }
    const supabase = createClient()
    const { error } = await supabase.from('support_tickets').update(patch).eq('id', t.id)
    if (!error) await supabase.from('admin_audit_log').insert({ admin_id: me, action: `ticket_${status}`, target: t.name, detail: { ticket: t.id } })
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire(status === 'answered' ? 'Respuesta enviada' : status === 'closed' ? 'Cerrado' : 'Reabierto', 'ok'); router.refresh()
  }

  return (
    <li className="p-4 rounded-[20px] bg-p flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge color={t.kind === 'bug' ? 'red' : t.kind === 'idea' ? 'purple' : 'blue'}>{kind?.label ?? t.kind}</Badge>
        <span className="text-sm font-semibold truncate">{t.name}</span>
        <span className="text-xs text-mu truncate">{t.email}{t.box ? ` · ${t.box}` : ''}</span>
        <span className="ml-auto text-xs text-fa">{ago(t.created_at)}</span>
      </div>
      <p className="text-[15px] whitespace-pre-line text-pretty">{t.message}</p>
      <div className="text-xs text-mu">
        {t.path ? `En ${screenName(t.path)}` : 'Sin pantalla'}{ctx.version ? ` · v${ctx.version}` : ''}{ctx.device ? ` · ${ctx.device === 'mobile' ? 'teléfono' : ctx.device === 'tablet' ? 'tablet' : 'computador'}` : ''}
        {ctx.installed ? ' · app instalada' : ''}{ctx.mode ? ` · modo ${ctx.mode}` : ''}{ctx.online === false ? ' · sin conexión' : ''}
      </div>
      {(ctx.trail?.length || ctx.errors?.length || ctx.user_agent) && (
        <>
          <button type="button" onClick={() => setDetails(d => !d)} aria-expanded={details} className="self-start h-9 text-xs font-semibold text-mu flex items-center gap-1.5">
            <MorphIcon icon={details ? 'chevron-up' : 'chevron-down'} size={12} /> Últimos pasos y errores
          </button>
          {details && (
            <div className="rounded-xl bg-p2 p-3 flex flex-col gap-2 text-[12px]">
              {ctx.errors?.length > 0 && (
                <div><div className="font-semibold text-rd mb-1">Errores recientes</div>{(ctx.errors as string[]).map((e, i) => <div key={i} className="font-mono break-words text-mu">{e}</div>)}</div>
              )}
              {ctx.trail?.length > 0 && (
                <ol className="flex flex-col gap-0.5">
                  {(ctx.trail as { t: string; kind: string; label: string }[]).map((s, i) => (
                    <li key={i} className="flex gap-2"><span className="text-fa tabular-nums">{s.t}</span>
                      <span className={cn(s.kind === 'error' ? 'text-rd' : s.kind === 'view' ? 'text-t' : 'text-mu')}>{s.kind === 'view' ? `Abrió ${screenName(s.label)}` : s.kind === 'error' ? `Error: ${s.label}` : s.kind === 'rage' ? `Tocó varias veces: ${s.label}` : `Tocó ${s.label}`}</span></li>
                  ))}
                </ol>
              )}
              {ctx.user_agent && <div className="text-fa break-words">{ctx.user_agent} · {ctx.screen}</div>}
            </div>
          )}
        </>
      )}
      {t.status === 'open' ? (
        <div className="flex flex-col gap-2">
          <textarea rows={3} maxLength={2000} value={reply} onChange={e => setReply(e.target.value)} placeholder="Escribe la respuesta…" aria-label="Respuesta" className={cn(inputBase, 'py-3 resize-none')} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || reply.trim().length < 2} onClick={() => save('answered')}>Responder</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => save('closed')}>Cerrar sin responder</Button>
          </div>
        </div>
      ) : (
        <>
          {t.reply && <div className="rounded-2xl bg-p2 p-3.5 text-sm whitespace-pre-line"><span className="text-xs font-semibold text-ac block mb-0.5">Tu respuesta</span>{t.reply}</div>}
          <div className="flex gap-2">
            {t.status === 'answered' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => save('closed')}>Cerrar</Button>}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => save('open')}>Reabrir</Button>
          </div>
        </>
      )}
    </li>
  )
}
