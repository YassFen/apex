'use client'
import { useEffect, useRef } from 'react'
import { motion, useReducedMotion, useSpring } from 'motion/react'

/**
 * Icons that morph into each other. Every icon is exactly three lines on a 14×14 grid
 * (unused lines collapse to an invisible point in the center), so any icon can turn into
 * any other. Rotational variants share lines and a group, and rotate with a spring.
 */
interface IconLine { x1: number; y1: number; x2: number; y2: number; opacity?: number }
interface IconDefinition { lines: [IconLine, IconLine, IconLine]; rotation?: number; group?: string }

const CENTER = 7
const collapsed: IconLine = { x1: CENTER, y1: CENTER, x2: CENTER, y2: CENTER, opacity: 0 }
const dot = (x: number): IconLine => ({ x1: x, y1: CENTER, x2: x, y2: CENTER })

const chevron: [IconLine, IconLine, IconLine] = [
  { x1: 3, y1: 5, x2: 7, y2: 9 },
  { x1: 7, y1: 9, x2: 11, y2: 5 },
  collapsed,
]
const arrow: [IconLine, IconLine, IconLine] = [
  { x1: 2, y1: 7, x2: 12, y2: 7 },
  { x1: 7.5, y1: 2.5, x2: 12, y2: 7 },
  { x1: 7.5, y1: 11.5, x2: 12, y2: 7 },
]

const ICONS = {
  menu:  { lines: [{ x1: 2, y1: 3.5, x2: 12, y2: 3.5 }, { x1: 2, y1: 7, x2: 12, y2: 7 }, { x1: 2, y1: 10.5, x2: 12, y2: 10.5 }] },
  more:  { lines: [dot(2.5), dot(7), dot(11.5)] },
  cross: { lines: [{ x1: 3, y1: 3, x2: 11, y2: 11 }, { x1: 11, y1: 3, x2: 3, y2: 11 }, collapsed] },
  plus:  { lines: [{ x1: 7, y1: 2.5, x2: 7, y2: 11.5 }, { x1: 2.5, y1: 7, x2: 11.5, y2: 7 }, collapsed] },
  minus: { lines: [{ x1: 2.5, y1: 7, x2: 11.5, y2: 7 }, collapsed, collapsed] },
  check: { lines: [{ x1: 2, y1: 7.5, x2: 5.5, y2: 11 }, { x1: 5.5, y1: 11, x2: 12, y2: 3 }, collapsed] },
  play:  { lines: [{ x1: 4, y1: 2.5, x2: 4, y2: 11.5 }, { x1: 4, y1: 2.5, x2: 11.5, y2: 7 }, { x1: 4, y1: 11.5, x2: 11.5, y2: 7 }] },
  pause: { lines: [{ x1: 4.5, y1: 2.5, x2: 4.5, y2: 11.5 }, { x1: 9.5, y1: 2.5, x2: 9.5, y2: 11.5 }, collapsed] },
  'chevron-down':  { lines: chevron, rotation: 0, group: 'chevron' },
  'chevron-left':  { lines: chevron, rotation: 90, group: 'chevron' },
  'chevron-up':    { lines: chevron, rotation: 180, group: 'chevron' },
  'chevron-right': { lines: chevron, rotation: -90, group: 'chevron' },
  'arrow-right': { lines: arrow, rotation: 0, group: 'arrow' },
  'arrow-down':  { lines: arrow, rotation: 90, group: 'arrow' },
  'arrow-left':  { lines: arrow, rotation: 180, group: 'arrow' },
  'arrow-up':    { lines: arrow, rotation: -90, group: 'arrow' },
} satisfies Record<string, IconDefinition>

export type MorphIconName = keyof typeof ICONS

const SPRING = { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 } as const

export function MorphIcon({ icon, size = 20, strokeWidth = 1.6, className }: {
  icon: MorphIconName; size?: number; strokeWidth?: number; className?: string
}) {
  const reduced = useReducedMotion() ?? false
  const transition = reduced ? { duration: 0 } : SPRING
  const def: IconDefinition = ICONS[icon]
  const prev = useRef<IconDefinition>(def)
  const rotation = useSpring(def.rotation ?? 0, { stiffness: 520, damping: 34, mass: 0.7 })

  useEffect(() => {
    const sameGroup = !!def.group && def.group === prev.current.group
    // Within a group the icon turns; between unrelated icons the rotation jumps and the lines morph.
    if (sameGroup && !reduced) rotation.set(def.rotation ?? 0)
    else rotation.jump(def.rotation ?? 0)
    prev.current = def
  }, [def, reduced, rotation])

  return (
    <svg viewBox="0 0 14 14" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <motion.g style={{ rotate: rotation, transformOrigin: 'center', transformBox: 'fill-box' }}>
        {def.lines.map((l, i) => (
          <motion.line key={i} initial={false}
            animate={{ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, opacity: l.opacity ?? 1 }}
            transition={transition} />
        ))}
      </motion.g>
    </svg>
  )
}
