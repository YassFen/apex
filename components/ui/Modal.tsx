'use client'
import { MorphIcon } from '@/components/ui/MorphIcon'
import { playSound } from '@/lib/utils/sound'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { X } from '@/components/ui/icons'
import { cn } from '@/lib/utils/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  subtitle?: string
  /** Small label above the title. */
  eyebrow?: string
  children: React.ReactNode
  className?: string
}

const SHEET_EASE = [0.32, 0.72, 0, 1] as const

/**
 * Bottom sheet on phones (drag the handle down to close), centered card from sm: up.
 * Big bold headline, round close button. Portaled to <body> so transformed ancestors can't trap it.
 */
export function Modal({ open, onClose, title, subtitle, eyebrow, children, className }: ModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const drag = useDragControls()

  useEffect(() => {
    if (!open) return
    playSound('open')
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

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: 0.18, ease: 'easeIn' } }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-0 z-[60] bg-black/55 flex items-end sm:items-center justify-center sm:p-4"
          onClick={e => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={panelRef}
            role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.6, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
            transition={{ duration: 0.3, ease: SHEET_EASE }}
            drag="y" dragListener={false} dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose() }}
            className={cn(
              'glass-sheet relative w-full sm:max-w-[520px] bg-p rounded-t-[32px] sm:rounded-[32px] px-5 pt-3 sm:p-7 ring-1 ring-t/[0.08]',
              'max-h-[92dvh] overflow-y-auto overscroll-contain outline-none shadow-e3',
              'pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-7',
              className,
            )}
          >
            {/* Grab handle: drag down to close (phones) */}
            <div onPointerDown={e => drag.start(e)} className="sm:hidden -mx-5 pt-1 pb-4 cursor-grab touch-none" aria-hidden>
              <div className="mx-auto h-1.5 w-11 rounded-full bg-t/20" />
            </div>
            <button
              type="button" onClick={onClose} aria-label="Cerrar"
              className="absolute top-4 right-4 sm:top-5 sm:right-5 size-9 rounded-full grid place-items-center text-t ring-1 ring-t/25 hover:bg-p2 active:scale-90 transition"
            >
              <CloseGlyph />
            </button>
            {(title || subtitle || eyebrow) && (
              <div className="mb-5 pr-12">
                {eyebrow && <div className="text-[11px] font-semibold text-mu mb-1">{eyebrow}</div>}
                {title && <h2 id={titleId} className="font-display text-[28px] leading-[1.1] font-bold tracking-tight text-balance">{title}</h2>}
                {subtitle && <p className="text-mu text-sm mt-1.5">{subtitle}</p>}
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** The sheet's button pair: outlined secondary + filled primary, both pills. */
export function ModalActions({ secondary, primary, onSecondary, onPrimary, primaryType = 'button', busy, danger, disabled }: {
  secondary: string
  primary: string
  onSecondary: () => void
  onPrimary?: () => void
  primaryType?: 'button' | 'submit'
  busy?: boolean
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-3 mt-6">
      <button type="button" onClick={onSecondary} disabled={busy}
        className="h-[52px] rounded-full ring-1 ring-inset ring-t/30 font-semibold text-[15px] hover:bg-p2 active:scale-[0.97] transition disabled:opacity-50">
        {secondary}
      </button>
      <button type={primaryType} onClick={onPrimary} disabled={busy || disabled}
        className={cn('h-[52px] rounded-full font-semibold text-[15px] active:scale-[0.97] transition disabled:opacity-50',
          danger ? 'bg-rd text-white' : 'bg-ac text-onac hover:bg-ac/90')}>
        {busy ? 'Un momento…' : primary}
      </button>
    </div>
  )
}

/** The close cross turns in from a plus as the sheet arrives (secondary action backing the main one). */
function CloseGlyph() {
  const [icon, setIcon] = useState<'plus' | 'cross'>('plus')
  useEffect(() => { const id = setTimeout(() => setIcon('cross'), 90); return () => clearTimeout(id) }, [])
  return <MorphIcon icon={icon} size={16} strokeWidth={2} />
}
