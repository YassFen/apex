'use client'
import { useEffect } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps } from 'motion/react'
import { cn } from '@/lib/utils/cn'

/** Shared curves: a heavy ease-out for entrances and a soft spring for things that respond to touch. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const
export const SPRING = { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 } as const
export const SPRING_SOFT = { type: 'spring', stiffness: 170, damping: 24 } as const

/**
 * Fades and lifts its content in the first time it scrolls into view.
 * Transform + opacity only: a filter would make it a containing block for fixed children.
 */
export function Reveal({ delay = 0, y = 12, className, children, ...props }: HTMLMotionProps<'div'> & { delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.32, ease: EASE_OUT, delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/** A number that glides to each new value instead of jumping. */
export function AnimatedNumber({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(value)
  const text = useTransform(mv, v => v.toFixed(decimals))

  useEffect(() => {
    if (reduce) { mv.set(value); return }
    const controls = animate(mv, value, SPRING_SOFT)
    return () => controls.stop()
  }, [value, reduce, mv])

  return <motion.span className={cn('tabular-nums', className)}>{text}</motion.span>
}

/**
 * Animated pill that slides between options (pair with a shared layoutId).
 * `className` replaces the default look entirely (cn() can't override conflicting classes).
 */
export function ActivePill({ layoutId, className = 'rounded-xl bg-p3' }: { layoutId: string; className?: string }) {
  return (
    <motion.span
      layoutId={layoutId}
      transition={SPRING}
      className={cn('absolute inset-0 -z-10', className)}
      aria-hidden
    />
  )
}

/** Segmented control with a sliding indicator. */
export function Segmented<T extends string>({ value, onChange, options, id, className, size = 'md' }: {
  value: T
  onChange: (v: T) => void
  options: readonly (readonly [T, string])[]
  id: string
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="tablist" className={cn('grid gap-1 p-1 rounded-2xl bg-p2', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([k, label]) => {
        const active = k === value
        return (
          <button key={k} type="button" role="tab" aria-selected={active} onClick={() => onChange(k)}
            className={cn('relative isolate rounded-xl font-bold transition-colors', size === 'sm' ? 'min-h-8 text-xs' : 'min-h-10 text-sm', active ? 'text-t' : 'text-mu hover:text-t')}>
            {active && <ActivePill layoutId={`seg-${id}`} />}
            {label}
          </button>
        )
      })}
    </div>
  )
}
