'use client'
import { useEffect, useState } from 'react'
import { ActivePill } from '@/components/ui/motion'
import { cn } from '@/lib/utils/cn'

const KEY = 'apex.boxFilter'

/** "all" or a box id, remembered between visits. Falls back to "all" when the box is gone. */
export function useBoxFilter(boxIds: string[]) {
  const [value, setValue] = useState<string>('all')
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY)
      if (v && boxIds.includes(v)) setValue(v)
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function set(v: string) {
    setValue(v)
    try { localStorage.setItem(KEY, v) } catch {}
  }
  return [boxIds.includes(value) ? value : 'all', set] as const
}

/** Chips to switch between "Todos" and each of the athlete's boxes. Hidden with a single box. */
export function BoxFilter({ boxes, value, onChange, id = 'box-filter' }: {
  boxes: { id: string; name: string }[]
  value: string
  onChange: (v: string) => void
  id?: string
}) {
  if (boxes.length < 2) return null
  const options = [{ id: 'all', name: 'Todos' }, ...boxes]
  return (
    <div role="tablist" aria-label="Filtrar por box" className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-1.5 overflow-x-auto scrollbar-none">
      {options.map(b => {
        const active = b.id === value
        return (
          <button key={b.id} type="button" role="tab" aria-selected={active} onClick={() => onChange(b.id)}
            className={cn('relative isolate flex-shrink-0 h-9 px-4 rounded-full text-sm font-bold transition-colors max-w-[200px] truncate',
              active ? 'text-onac' : 'bg-p text-mu hover:text-t')}>
            {active && <ActivePill layoutId={id} className="rounded-full bg-ac" />}
            {b.name}
          </button>
        )
      })}
    </div>
  )
}

/** Small color tag per box, stable across renders (by position in the list). */
const BOX_TONES = ['bg-ac', 'bg-bl', 'bg-pu', 'bg-or', 'bg-gr', 'bg-rd']
export function boxTone(boxes: { id: string }[], id: string | null): string {
  const i = boxes.findIndex(b => b.id === id)
  return BOX_TONES[(i < 0 ? 0 : i) % BOX_TONES.length]
}
