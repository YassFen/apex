'use client'
import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}

/** Bottom sheet on phones, centered dialog from sm: up. */
export function Modal({ open, onClose, title, subtitle, children, className }: ModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const prevFocus = document.activeElement as HTMLElement | null
    // Focus the panel unless a field inside asked for autofocus
    requestAnimationFrame(() => {
      if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus()
    })
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = prevOverflow
      prevFocus?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm animate-fade-in flex items-end sm:items-center justify-center sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full sm:max-w-[520px] bg-p rounded-t-[24px] sm:rounded-[24px] p-5 sm:p-6 ring-1 ring-t/[0.07]',
          'max-h-[92dvh] overflow-y-auto overscroll-contain outline-none animate-sheet shadow-2xl',
          'pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6',
          className,
        )}
      >
        <div className="sm:hidden mx-auto -mt-1 mb-4 h-1 w-10 rounded-full bg-p3" aria-hidden />
        <button
          type="button" onClick={onClose} aria-label="Cerrar"
          className="absolute top-3 right-3 size-10 rounded-full grid place-items-center text-mu hover:text-t hover:bg-p2"
        >
          <X size={18} aria-hidden />
        </button>
        {(title || subtitle) && (
          <div className="mb-5 pr-10">
            {title && <h2 id={titleId} className="font-barlow text-2xl font-black tracking-wide uppercase">{title}</h2>}
            {subtitle && <p className="text-mu text-sm mt-1 truncate">{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
