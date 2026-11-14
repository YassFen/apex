'use client'
// Small shared pieces of the administrator screens.
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils/cn'
import { Warning } from '@/components/ui/icons'
import type { Box } from '@/lib/types/database'

export function Avatar({ name, src, size = 44 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return src
    ? <img src={src} alt="" style={{ width: size, height: size }} className="rounded-full object-cover flex-shrink-0" />
    : <span style={{ width: size, height: size, fontSize: size * 0.32 }} className="rounded-full bg-p3 grid place-items-center font-bold text-mu flex-shrink-0">{initials}</span>
}

export function Stat({ label, value, tone, hint }: { label: string; value: React.ReactNode; tone?: string; hint?: React.ReactNode }) {
  return (
    <Card padding={false} className="p-4 min-w-0">
      <div className={cn('font-display text-3xl font-bold tabular-nums leading-none tracking-tight', tone)}>{value}</div>
      <div className="text-xs text-mu mt-1.5 leading-tight">{label}</div>
      {hint && <div className="text-[11px] text-fa mt-1 leading-tight">{hint}</div>}
    </Card>
  )
}

/** Horizontal filter chips. `count` shows next to the label. */
export function Chips<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; label: string
  options: { key: T; label: string; count?: number; tone?: string }[]
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-2 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 pb-1 [scrollbar-width:none]">
      {options.map(o => (
        <button key={o.key} type="button" role="tab" aria-selected={value === o.key} onClick={() => onChange(o.key)}
          className={cn('flex-shrink-0 h-10 px-4 rounded-full text-sm font-semibold transition-colors flex items-center gap-1.5',
            value === o.key ? 'bg-t text-bg' : 'bg-p text-mu hover:text-t')}>
          {o.label}
          {o.count !== undefined && o.count > 0 && <span className={cn('tabular-nums text-xs', value === o.key ? 'opacity-70' : o.tone ?? 'text-fa')}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mt-2">
      <h2 className="font-display text-lg font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  )
}

/** Shown when the 010 migration hasn't been run in Supabase yet. */
export function MigrationNotice({ n = '010' }: { n?: string }) {
  return (
    <div className="flex gap-2.5 p-3.5 rounded-2xl bg-or/10 text-or text-sm">
      <Warning size={18} className="flex-shrink-0 mt-px" aria-hidden />
      <span className="text-pretty">Esta parte necesita la migración {n} en Supabase. Hasta que se aplique, aquí no se puede guardar.</span>
    </div>
  )
}

/** When the person administers several boxes. */
export function BoxTabs({ boxes, current, base }: { boxes: Box[]; current: string; base: string }) {
  if (boxes.length < 2) return null
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {boxes.map(b => (
        <Link key={b.id} href={`${base}?box=${b.id}`}
          className={cn('flex-shrink-0 h-9 px-3.5 rounded-full text-xs font-semibold grid place-items-center', b.id === current ? 'bg-ac text-onac' : 'bg-p text-mu')}>
          {b.name}
        </Link>
      ))}
    </div>
  )
}

export function Empty({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <Card className="text-center py-10 flex flex-col items-center gap-3">
      <div className="size-14 rounded-2xl bg-ac/15 text-ac grid place-items-center animate-pop">{icon}</div>
      <h2 className="font-display text-xl font-bold tracking-tight text-balance">{title}</h2>
      <p className="text-mu text-sm max-w-xs text-pretty">{body}</p>
      {action}
    </Card>
  )
}

export const selectCls = 'w-full h-12 px-4 rounded-xl bg-p2 text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 appearance-none'
