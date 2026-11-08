'use client'
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, Trophy, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export type ToastType = 'ok' | 'pr' | 'error' | 'info'

interface ToastItem { id: number; message: string; type: ToastType }

const ICONS = { ok: CheckCircle2, pr: Trophy, error: AlertCircle, info: Info }
const TONES: Record<ToastType, string> = {
  ok:    'text-gr bg-gr/15',
  pr:    'text-ac bg-ac/15',
  error: 'text-rd bg-rd/15',
  info:  'text-bl bg-bl/15',
}

const Ctx = createContext<((message: string, type?: ToastType) => void) | null>(null)

/**
 * App-wide toasts: small, stacked, auto-dismissed, tap to close.
 * Sits above the mobile tab bar; top-right on desktop.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), [])

  const fire = useCallback((message: string, type: ToastType = 'ok') => {
    const id = ++nextId.current
    // Keep at most 3 on screen so they never pile up.
    setToasts(t => [...t.slice(-2), { id, message, type }])
    setTimeout(() => dismiss(id), type === 'error' ? 5000 : 3000)
    try { navigator.vibrate?.(type === 'pr' ? [18, 40, 28] : type === 'error' ? [40, 30, 40] : 12) } catch {}
  }, [dismiss])

  return (
    <Ctx.Provider value={fire}>
      {children}
      <div
        aria-live="polite"
        className="fixed z-[99] inset-x-4 bottom-[calc(76px+env(safe-area-inset-bottom))] lg:inset-x-auto lg:right-6 lg:bottom-auto lg:top-6 flex flex-col gap-2 items-stretch lg:items-end pointer-events-none"
      >
        {toasts.map(t => {
          const Icon = ICONS[t.type]
          return (
            <button
              key={t.id}
              type="button"
              role={t.type === 'error' ? 'alert' : 'status'}
              onClick={() => dismiss(t.id)}
              className="pointer-events-auto animate-toast-in flex items-center gap-3 w-full lg:w-auto lg:max-w-sm pl-3.5 pr-3 py-3 rounded-2xl bg-p3/95 backdrop-blur-xl text-t text-sm font-semibold text-left shadow-[0_12px_40px_-12px_rgb(0_0_0/.5)] ring-1 ring-inset ring-t/[0.06]"
            >
              <span className={cn('size-8 rounded-full grid place-items-center flex-shrink-0', TONES[t.type])}>
                <Icon size={18} strokeWidth={2.4} aria-hidden className={t.type === 'pr' ? 'animate-pop' : ''} />
              </span>
              <span className="flex-1 text-pretty leading-snug">{t.message}</span>
              <X size={16} className="text-fa flex-shrink-0" aria-hidden />
            </button>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

/** `const { fire } = useToast(); fire('Guardado')` — works anywhere inside the dashboard. */
export function useToast() {
  const fire = useContext(Ctx)
  return { fire: fire ?? (() => {}) }
}
