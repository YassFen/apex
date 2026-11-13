import { cn } from '@/lib/utils/cn'

/** The APEX mark: a bumper plate seen from the front with the summit cut out of it. */
const MARK = 'M32 5a27 27 0 1 0 0 54a27 27 0 1 0 0-54ZM32 15 48 47H39.5L32 31 24.5 47H16Z'

/** Mark only. Takes the current text color, so `text-ac`, `text-white`, etc. set it. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill="currentColor" className={cn('flex-shrink-0', className)} aria-hidden>
      <path fillRule="evenodd" d={MARK} />
    </svg>
  )
}

/** Mark + wordmark. The mark is the accent color; the word follows the text color around it. */
export function Logo({ size = 28, className, markClassName = 'text-ac' }: { size?: number; className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center font-display font-bold tracking-[-0.03em] leading-none', className)}
      style={{ gap: Math.round(size * 0.3), fontSize: Math.round(size * 0.86) }} aria-label="APEX" role="img">
      <LogoMark size={size} className={markClassName} />
      <span aria-hidden>APEX</span>
    </span>
  )
}
