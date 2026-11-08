'use client'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils/cn'

/** iOS-style switch. Put it inside a <label> with the text, or pass `label` for screen readers. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={e => { e.preventDefault(); onChange(!checked) }}
      className={cn('relative flex-shrink-0 w-[51px] h-[31px] rounded-full p-[2px] transition-colors duration-200 disabled:opacity-50',
        checked ? 'bg-gr' : 'bg-t/20')}>
      <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        className={cn('block size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.18)]', checked ? 'ml-auto' : '')} />
    </button>
  )
}
