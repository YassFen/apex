'use client'
// A screen crashed while rendering: tell the person plainly, offer a retry, and log it for the panel.
import { useEffect } from 'react'
import Link from 'next/link'
import { Warning } from '@/components/ui/icons'
import { cleanPath, reportError } from '@/lib/utils/telemetry'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError('render', `${error.message}${error.digest ? ` (${error.digest})` : ''}`, error.stack) }, [error])
  return (
    <div className="flex-1 grid place-items-center p-6">
      <div className="max-w-sm text-center flex flex-col items-center gap-3">
        <div className="size-14 rounded-2xl bg-rd/15 text-rd grid place-items-center animate-pop"><Warning size={28} weight="duotone" aria-hidden /></div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-balance">Esta pantalla falló</h1>
        <p className="text-mu text-sm text-pretty">Ya quedó registrado para revisarlo. Tus datos están a salvo: prueba de nuevo o vuelve al inicio.</p>
        <div className="grid grid-cols-2 gap-3 w-full mt-2">
          <Link href="/dashboard" className="h-12 rounded-full ring-1 ring-inset ring-t/30 font-semibold grid place-items-center">Ir al inicio</Link>
          <button type="button" onClick={reset} className="h-12 rounded-full bg-ac text-onac font-semibold">Reintentar</button>
        </div>
        <Link href={`/support?new=1&from=${encodeURIComponent(cleanPath(typeof window !== 'undefined' ? location.pathname : ''))}`} className="text-sm font-semibold text-mu underline underline-offset-4 h-11 grid place-items-center">Contarnos qué estabas haciendo</Link>
      </div>
    </div>
  )
}
