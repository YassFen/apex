import { cn } from '@/lib/utils/cn'
import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Button primitive — minimal, high-contrast.
 * Primary: lime accent on black. Secondary: subtle dark surface.
 * Heights keep a 40px+ hit area (44px+ at md and lg) for gym-floor thumbs.
 */
export function Button({ variant = 'primary', size = 'md', className, children, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-bold rounded-full select-none',
        'transition-[transform,background-color,color,opacity] duration-150 active:scale-[0.96]',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        size === 'sm' && 'h-10 px-4 text-xs',
        size === 'md' && 'h-11 px-5 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
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
