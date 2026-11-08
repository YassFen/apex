'use client'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

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
      <div className="flex flex-col items-center text-center pt-2">
        <div className={`size-14 rounded-full grid place-items-center mb-4 animate-pop ${danger ? 'bg-rd/15 text-rd' : 'bg-ac/15 text-ac'}`}>
          <AlertTriangle size={26} aria-hidden />
        </div>
        <h2 className="font-barlow text-2xl font-black tracking-wide uppercase text-balance">{title}</h2>
        {body && <p className="text-mu text-sm mt-2 max-w-xs text-pretty">{body}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 mt-6">
        <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant={danger ? 'danger' : 'primary'} size="lg" onClick={onConfirm} disabled={busy}>
          {busy ? 'Un momento…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
