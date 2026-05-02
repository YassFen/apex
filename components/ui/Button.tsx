import { cn } from '@/lib/utils/cn'
import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Button primitive — minimal, high-contrast.
 * Primary: lime accent on black. Secondary: subtle dark surface.
 */
export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-bold rounded-full transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed',
        size === 'sm' && 'px-3.5 py-2 text-xs',
        size === 'md' && 'px-4 py-2.5 text-sm',
        size === 'lg' && 'px-6 py-3.5 text-base',
        variant === 'primary'   && 'bg-ac text-bg hover:bg-[#b8e030]',
        variant === 'secondary' && 'bg-p2 text-t hover:bg-p3',
        variant === 'ghost'     && 'bg-transparent text-mu hover:text-t hover:bg-p2',
        variant === 'danger'    && 'bg-rd/15 text-rd hover:bg-rd/25',
        className
      )}
    >
      {children}
    </button>
  )
}
