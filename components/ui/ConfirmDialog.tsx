'use client'
import { Warning, Question } from '@/components/ui/icons'
import { Modal, ModalActions } from '@/components/ui/Modal'

/** Styled replacement for window.confirm(), for destructive or irreversible actions. */
export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirmar', danger = false, busy = false, onConfirm, onClose }: {
  open: boolean
  title: string
  body?: React.ReactNode
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="pt-1 pr-10">
        <div className={`size-14 rounded-2xl grid place-items-center mb-5 animate-pop ${danger ? 'bg-rd/15 text-rd' : 'bg-ac/15 text-ac'}`}>
          {danger ? <Warning size={28} weight="duotone" aria-hidden /> : <Question size={28} weight="duotone" aria-hidden />}
        </div>
        <h2 className="font-display text-[28px] leading-[1.1] font-bold tracking-tight text-balance">{title}</h2>
        {body && <p className="text-mu text-[15px] mt-2 text-pretty">{body}</p>}
      </div>
      <ModalActions secondary="Cancelar" primary={confirmLabel} onSecondary={onClose} onPrimary={onConfirm} busy={busy} danger={danger} />
    </Modal>
  )
}
