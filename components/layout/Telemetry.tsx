'use client'
// Mounted once in the shell: records screens, presses, angry repeated taps and errors.
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useShell } from '@/lib/hooks/useShell'
import { flush, labelOf, reportError, setTelemetryContext, track } from '@/lib/utils/telemetry'

export function Telemetry() {
  const pathname = usePathname()
  const { profile, viewMode, activeBoxId } = useShell()

  useEffect(() => { setTelemetryContext({ userId: profile.id, mode: viewMode, boxId: activeBoxId }) }, [profile.id, viewMode, activeBoxId])
  useEffect(() => { track('view', null, pathname) }, [pathname])

  useEffect(() => {
    let last: { el: Element; t: number; n: number } | null = null
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null
      if (!el?.closest) return
      const label = labelOf(el)
      // Three quick taps on the same spot usually mean "this isn't responding".
      const now = Date.now()
      if (last && last.el === el && now - last.t < 700) {
        last = { el, t: now, n: last.n + 1 }
        if (last.n === 3) track('rage', label ?? el.tagName.toLowerCase())
        return
      }
      last = { el, t: now, n: 1 }
      if (label) track('click', label)
    }
    const onError = (e: ErrorEvent) => reportError('error', e.message, e.error?.stack)
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason
      reportError('promise', typeof r === 'string' ? r : r?.message ?? 'Promesa rechazada', r?.stack)
    }
    const onHide = () => { if (document.visibilityState === 'hidden') void flush() }

    // Server failures the person never sees as an error message.
    const original = window.fetch
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      try {
        const res = await original(...args)
        if (res.status >= 500) {
          const url = String(typeof args[0] === 'string' ? args[0] : (args[0] as Request).url ?? args[0])
          if (!/app_errors|app_events|support_tickets/.test(url)) reportError('api', `HTTP ${res.status} en ${new URL(url, location.origin).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id')}`)
        }
        return res
      } catch (err) {
        if (navigator.onLine) reportError('api', `Sin respuesta: ${(err as Error)?.message ?? 'fetch'}`)
        throw err
      }
    }

    document.addEventListener('click', onClick, true)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.fetch = original
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  return null
}
