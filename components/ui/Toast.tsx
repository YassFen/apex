'use client'
import { useRef, useState } from 'react'
import { cn } from '@/lib/utils/cn'

interface ToastProps {
  message: string
  type?: 'pr' | 'ok' | 'error'
  show: boolean
}

export function Toast({ message, type = 'ok', show }: ToastProps) {
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'fixed left-4 right-4 sm:left-auto sm:right-6 bottom-[calc(88px+env(safe-area-inset-bottom))] lg:bottom-6 z-[99]',
        'px-4 py-3 rounded-2xl font-semibold text-sm transition-[opacity,transform] duration-200 pointer-events-none sm:max-w-sm',
        show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
        type === 'pr'    && 'bg-ac text-bg',
        type === 'ok'    && 'bg-p3 text-t',
        type === 'error' && 'bg-p3 text-rd ring-1 ring-inset ring-rd/30',
      )}
    >
      {message}
    </div>
  )
}

// Convenience hook
export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'pr' | 'ok' | 'error' } | null>(null)
  const [show, setShow] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function fire(message: string, type: 'pr' | 'ok' | 'error' = 'ok') {
    setToast({ message, type })
    setShow(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setShow(false), type === 'error' ? 5000 : 2800)
  }

  const element = toast ? <Toast message={toast.message} type={toast.type} show={show} /> : null
  return { fire, element }
}
