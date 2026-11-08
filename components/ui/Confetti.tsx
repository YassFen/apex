'use client'
import { useMemo } from 'react'

const COLORS = ['bg-ac', 'bg-bl', 'bg-or', 'bg-pu', 'bg-gr', 'bg-rd']

/** One-shot CSS confetti burst from the center of its (relative) parent. Decorative only. */
export function Confetti({ pieces = 36 }: { pieces?: number }) {
  const bits = useMemo(() => Array.from({ length: pieces }, (_, i) => {
    const angle = (Math.PI * 2 * i) / pieces + Math.random() * 0.4
    const dist = 90 + Math.random() * 110
    return {
      color: COLORS[i % COLORS.length],
      round: i % 3 === 0,
      style: {
        '--dx': `${Math.cos(angle) * dist}px`,
        // Bias downwards so it reads as falling, not exploding.
        '--dy': `${Math.sin(angle) * dist + 60}px`,
        '--rot': `${Math.random() * 720 - 360}deg`,
        animation: `confetti ${0.9 + Math.random() * 0.6}s cubic-bezier(.15,.7,.35,1) ${Math.random() * 0.12}s both`,
      } as React.CSSProperties,
    }
  }), [pieces])

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-visible" aria-hidden>
      {bits.map((b, i) => (
        <span key={i} style={b.style}
          className={`absolute ${b.color} ${b.round ? 'size-2 rounded-full' : 'w-1.5 h-3 rounded-[2px]'}`} />
      ))}
    </div>
  )
}
