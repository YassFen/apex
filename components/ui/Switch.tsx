'use client'
import { playSound } from '@/lib/utils/sound'
import { cn } from '@/lib/utils/cn'

/** iOS-style switch. Put it inside a <label> with the text, or pass `label` for screen readers. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={e => { e.preventDefault(); playSound(checked ? 'toggleOff' : 'toggleOn'); onChange(!checked) }}
      className={cn('relative flex-shrink-0 w-[51px] h-[31px] rounded-full p-[2px] transition-colors duration-200 disabled:opacity-50',
        checked ? 'bg-gr' : 'bg-t/20')}>
      <span className={cn('block size-[27px] rounded-full bg-white shadow-e1 transition-transform duration-200 ease-[cubic-bezier(.32,.72,0,1)]', checked ? 'translate-x-5' : 'translate-x-0')} />
    </button>
  )
}
