'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Animates a number from 0 to `value` once, on mount. Non-numeric values
 * (e.g. "3:45") render as-is. Respects prefers-reduced-motion.
 */
export function CountUp({ value, duration = 700 }: { value: string | number; duration?: number }) {
  const target = typeof value === 'number' ? value : Number(value)
  const animatable = Number.isFinite(target) && String(value).trim() !== ''
  const [shown, setShown] = useState(animatable ? 0 : value)
  const done = useRef(false)

  useEffect(() => {
    if (!animatable) { setShown(value); return }
    if (done.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(target); return }
    done.current = true
    const decimals = String(value).split('.')[1]?.length ?? 0
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown((target * eased).toFixed(decimals))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, target, animatable, duration])

  return <span className="tabular-nums">{shown}</span>
}
