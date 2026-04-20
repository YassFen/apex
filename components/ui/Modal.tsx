'use client'
import { useEffect } from 'react'
import { cn } from '@/lib/utils/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}

export function Modal({ open, onClose, title, subtitle, children, className }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/72 backdrop-blur-[12px] flex items-center justify-center z-60 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className={cn(
        'w-full max-w-[520px] bg-gradient-to-b from-p2 to-p border border-[var(--ln2)] rounded-[22px] p-6 max-h-[92vh] overflow-y-auto animate-fade-up',
        className
      )}>
        {(title || subtitle) && (
          <div className="mb-5">
            {title && <h2 className="font-barlow text-2xl font-black tracking-wide">{title}</h2>}
            {subtitle && <p className="text-mu text-sm mt-1">{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
