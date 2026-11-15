'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { Chips, Stat } from '@/components/manage/ui'
import { PageTitle } from '@/components/admin/AdminChrome'
import { MorphIcon } from '@/components/ui/MorphIcon'
import { CheckCircle } from '@/components/ui/icons'
import { createClient } from '@/lib/supabase/client'
import { isOpenError, screenName, type ErrorGroup } from '@/lib/utils/platform-shared'
import { friendlyError } from '@/lib/utils/errors'
import { cn } from '@/lib/utils/cn'

const KIND: Record<string, string> = { error: 'Error de código', promise: 'Operación fallida', render: 'Pantalla rota', api: 'Servidor' }
type Tab = 'open' | 'resolved' | 'ignored'

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 60) return `hace ${m} min`
  if (m < 60 * 24) return `hace ${Math.round(m / 60)} h`
  return `hace ${Math.round(m / 1440)} días`
}

export function ErrorsView({ groups, me }: { groups: ErrorGroup[]; me: string }) {
  const router = useRouter()
  const { fire } = useToast()
  const [tab, setTab] = useState<Tab>('open')
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const inTab = (g: ErrorGroup) => (tab === 'open' ? isOpenError(g) : tab === 'resolved' ? g.status === 'resolved' && !isOpenError(g) : g.status === 'ignored')
  const shown = groups.filter(inTab)
  const openOnes = groups.filter(isOpenError)
  const affected = openOnes.reduce((a, g) => a + g.users, 0)

  async function setStatus(g: ErrorGroup, status: Tab) {
    setBusy(g.fingerprint)
    const supabase = createClient()
    const { error } = await supabase.from('app_error_status').upsert({ fingerprint: g.fingerprint, status, updated_by: me, updated_at: new Date().toISOString() }, { onConflict: 'fingerprint' })
    if (!error) await supabase.from('admin_audit_log').insert({ admin_id: me, action: `error_${status}`, target: g.fingerprint, detail: { message: g.message.slice(0, 120) } })
    setBusy(null)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire(status === 'resolved' ? 'Marcado como resuelto' : status === 'ignored' ? 'Ignorado' : 'Reabierto', 'ok'); router.refresh()
  }

  return (
    <>
      <PageTitle title="Errores" sub="Fallas que ocurrieron en el teléfono o computador de alguien, aunque esa persona no haya avisado. Se agrupan las que son la misma falla. Si una resuelta vuelve a aparecer, se reabre sola." />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Sin resolver" value={openOnes.length} tone={openOnes.length ? 'text-rd' : 'text-gr'} />
        <Stat label="Personas afectadas" value={affected} />
        <Stat label="Veces en 14 días" value={groups.reduce((a, g) => a + g.count, 0)} />
      </div>
      <Chips label="Estado" value={tab} onChange={setTab} options={[
        { key: 'open', label: 'Sin resolver', count: openOnes.length, tone: 'text-rd' },
        { key: 'resolved', label: 'Resueltos', count: groups.filter(g => g.status === 'resolved' && !isOpenError(g)).length },
        { key: 'ignored', label: 'Ignorados', count: groups.filter(g => g.status === 'ignored').length },
      ]} />

      <ul className="flex flex-col gap-3 mt-4">
        {shown.length === 0 && (
          <li className="flex items-center gap-2.5 p-4 rounded-2xl bg-p text-sm text-mu"><CheckCircle size={18} className="text-gr" weight="fill" /> {tab === 'open' ? 'Nada pendiente. La app está funcionando sin fallas registradas.' : 'Nada aquí.'}</li>
        )}
        {shown.map(g => {
          const expanded = open === g.fingerprint
          const regressed = g.status === 'resolved' && isOpenError(g)
          return (
            <li key={g.fingerprint} className="p-4 rounded-[20px] bg-p flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge color={g.kind === 'render' ? 'red' : g.kind === 'api' ? 'orange' : 'neutral'}>{KIND[g.kind] ?? g.kind}</Badge>
                {regressed && <Badge color="red">Volvió a aparecer</Badge>}
                <span className="ml-auto text-xs text-fa">{ago(g.last_seen)}</span>
              </div>
              <p className="font-mono text-[13px] leading-snug break-words">{g.message}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[[g.count, 'veces'], [g.users, g.users === 1 ? 'persona' : 'personas'], [ago(g.first_seen).replace('hace ', ''), 'desde la primera']].map(([v, l]) => (
                  <div key={String(l)} className="p-2.5 rounded-xl bg-p2"><div className="font-display text-lg font-bold tabular-nums leading-none">{v}</div><div className="text-[11px] text-mu mt-1">{l}</div></div>
                ))}
              </div>
              <div className="text-xs text-mu">
                En: {(g.paths ?? []).filter(Boolean).map(p => screenName(p as string)).join(', ') || 'sin pantalla'}
                {' · '}{(g.devices ?? []).filter(Boolean).map(d => (d === 'mobile' ? 'teléfono' : d === 'tablet' ? 'tablet' : 'computador')).join(', ')}
                {' · '}{(g.versions ?? []).filter(Boolean).map(v => `v${v}`).join(', ')}
              </div>
              {(g.stack || g.trail?.length) && (
                <>
                  <button type="button" onClick={() => setOpen(expanded ? null : g.fingerprint)} aria-expanded={expanded} className="self-start h-9 text-xs font-semibold text-mu flex items-center gap-1.5">
                    <MorphIcon icon={expanded ? 'chevron-up' : 'chevron-down'} size={12} /> Qué hizo la persona y detalle técnico
                  </button>
                  {expanded && !!g.trail?.length && (
                    <ol className="rounded-xl bg-p2 p-3 flex flex-col gap-0.5 text-[12px]" aria-label="Pasos antes del error">
                      {g.trail.map((s, i) => (
                        <li key={i} className="flex gap-2"><span className="text-fa tabular-nums">{s.t}</span>
                          <span className={s.kind === 'error' ? 'text-rd' : s.kind === 'view' ? 'text-t' : 'text-mu'}>{s.kind === 'view' ? `Abrió ${screenName(s.label)}` : s.kind === 'error' ? `Error: ${s.label}` : s.kind === 'rage' ? `Tocó varias veces: ${s.label}` : `Tocó ${s.label}`}</span></li>
                      ))}
                    </ol>
                  )}
                  {expanded && g.stack && <pre className="text-[11px] leading-relaxed text-mu bg-p2 rounded-xl p-3 overflow-x-auto max-h-60 whitespace-pre-wrap break-words">{g.stack}</pre>}
                </>
              )}
              <div className="flex gap-2 flex-wrap">
                {isOpenError(g) ? (
                  <>
                    <Button size="sm" disabled={busy === g.fingerprint} onClick={() => setStatus(g, 'resolved')}>Marcar resuelto</Button>
                    <Button size="sm" variant="ghost" disabled={busy === g.fingerprint} onClick={() => setStatus(g, 'ignored')}>Ignorar</Button>
                  </>
                ) : <Button size="sm" variant="secondary" disabled={busy === g.fingerprint} onClick={() => setStatus(g, 'open')}>Reabrir</Button>}
              </div>
            </li>
          )
        })}
      </ul>
      <p className={cn('text-xs text-mu mt-6 text-pretty')}>Los avisos se ven en este panel (número rojo en Errores). Para recibirlos también por correo o WhatsApp hace falta conectar un servicio de envío; se puede agregar después.</p>
    </>
  )
}
