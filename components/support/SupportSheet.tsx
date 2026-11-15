'use client'
// "Reportar un problema": the person tells us what happened; the app attaches what it knows
// (version, device, screen, last steps, recent errors) so we can reproduce it.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal, ModalActions } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { inputBase, labelCls } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { Bug, Lightbulb, Question, UserCircle } from '@/components/ui/icons'
import { createClient } from '@/lib/supabase/client'
import { supportContext } from '@/lib/utils/telemetry'
import { friendlyError } from '@/lib/utils/errors'
import { playSound } from '@/lib/utils/sound'
import { cn } from '@/lib/utils/cn'

export type TicketKind = 'bug' | 'idea' | 'question' | 'account'
export const TICKET_KINDS: { k: TicketKind; label: string; hint: string; Icon: typeof Bug }[] = [
  { k: 'bug', label: 'Algo falla', hint: '¿Qué estabas haciendo y qué pasó?', Icon: Bug },
  { k: 'idea', label: 'Una idea', hint: '¿Qué te gustaría que la app hiciera?', Icon: Lightbulb },
  { k: 'question', label: 'Una duda', hint: '¿Qué quieres saber?', Icon: Question },
  { k: 'account', label: 'Mi cuenta', hint: 'Acceso, correo, box, plan…', Icon: UserCircle },
]

export function SupportSheet({ open, onClose, userId, boxId, initialKind = 'bug', initialMessage = '', from }: {
  open: boolean; onClose: () => void; userId: string; boxId?: string | null; initialKind?: TicketKind; initialMessage?: string; from?: string
}) {
  const router = useRouter()
  const { fire } = useToast()
  const [kind, setKind] = useState<TicketKind>(initialKind)
  const [message, setMessage] = useState(initialMessage)
  const [withContext, setWithContext] = useState(true)
  const [busy, setBusy] = useState(false)
  const meta = TICKET_KINDS.find(t => t.k === kind) ?? TICKET_KINDS[0]
  const tooShort = message.trim().length < 5

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (tooShort) return
    setBusy(true)
    const ctx = supportContext()
    const { error } = await createClient().from('support_tickets').insert({
      user_id: userId, box_id: boxId ?? null, kind, message: message.trim().slice(0, 2000),
      path: from ?? (ctx.path as string | null) ?? null, context: withContext ? ctx : { version: ctx.version },
    })
    setBusy(false)
    if (error) { fire(/support_tickets/.test(error.message) ? 'El soporte aún no está activo en el servidor. Escríbenos por WhatsApp mientras tanto.' : friendlyError(error.message), 'error'); return }
    playSound('success')
    fire('Mensaje enviado. Te avisaremos cuando respondamos.', 'ok')
    setMessage(''); onClose(); router.refresh()
  }

  return (
    <Modal open={open} onClose={onClose} title="Escríbenos" subtitle="Lo lee el equipo de APEX. Te respondemos dentro de la app.">
      <form onSubmit={send} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          {TICKET_KINDS.map(t => (
            <button key={t.k} type="button" onClick={() => setKind(t.k)} aria-pressed={kind === t.k}
              className={cn('h-14 px-3 rounded-2xl flex items-center gap-2.5 text-left text-sm font-semibold ring-1 ring-inset transition-colors',
                kind === t.k ? 'bg-ac/15 ring-ac/60 text-t' : 'bg-p2 ring-transparent text-mu')}>
              <t.Icon size={20} weight={kind === t.k ? 'fill' : 'regular'} className={kind === t.k ? 'text-ac' : ''} aria-hidden /> {t.label}
            </button>
          ))}
        </div>
        <div>
          <label className={labelCls} htmlFor="sup-msg">{meta.hint}</label>
          <textarea id="sup-msg" rows={5} maxLength={2000} required value={message} onChange={e => setMessage(e.target.value)} data-track-off
            placeholder={kind === 'bug' ? 'Ej: al guardar mi resultado del WOD de hoy la pantalla se queda cargando.' : 'Escribe aquí…'}
            className={cn(inputBase, 'py-3 resize-none')} />
          <p className="text-xs text-fa mt-1 text-right tabular-nums">{message.length}/2000</p>
        </div>
        <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-p2">
          <span className="text-sm"><span className="font-semibold block">Adjuntar datos técnicos</span>
            <span className="text-mu text-xs">Versión, teléfono, pantalla y tus últimos pasos en la app. Nunca lo que escribiste en otras pantallas.</span></span>
          <Switch checked={withContext} onChange={setWithContext} label="Adjuntar datos técnicos" />
        </label>
        <ModalActions secondary="Cancelar" primary="Enviar" onSecondary={onClose} primaryType="submit" busy={busy} disabled={tooShort} />
      </form>
    </Modal>
  )
}
