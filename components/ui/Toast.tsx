'use client'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils/cn'

interface ToastProps {
  message: string
  type?: 'pr' | 'ok' | 'error'
  show: boolean
}

export function Toast({ message, type = 'ok', show }: ToastProps) {
  return (
    <div className={cn(
      'fixed bottom-24 right-4 z-[99] px-4 py-3 rounded-2xl font-bold text-sm transition-all duration-200 pointer-events-none',
      show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
      type === 'pr'    && 'bg-ac text-bg shadow-[0_8px_32px_rgba(200,245,62,.3)]',
      type === 'ok'    && 'bg-p3 border border-[var(--ln2)] text-t',
      type === 'error' && 'bg-rd/20 border border-rd/30 text-rd',
    )}>
      {message}
    </div>
  )
}

// Convenience hook
export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'pr' | 'ok' | 'error' } | null>(null)
  const [show, setShow] = useState(false)

  function fire(message: string, type: 'pr' | 'ok' | 'error' = 'ok') {
    setToast({ message, type })
    setShow(true)
    setTimeout(() => setShow(false), 2800)
  }

  const element = toast ? <Toast message={toast.message} type={toast.type} show={show} /> : null
  return { fire, element }
}
