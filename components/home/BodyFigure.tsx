import { cn } from '@/lib/utils/cn'
import type { MuscleGroup } from '@/lib/utils/movement-guide'

/**
 * A small front-view figure with one muscle group lit up (Fitbod-style).
 * The lit part uses currentColor, so the parent's text color sets the tone.
 */
export function BodyFigure({ group, className }: { group: MuscleGroup; className?: string }) {
  const on = (g: MuscleGroup | MuscleGroup[]) => ([] as MuscleGroup[]).concat(g).includes(group)
  const part = (g: MuscleGroup | MuscleGroup[]) => cn('transition-colors duration-500', on(g) ? 'fill-current animate-glow' : 'fill-t/15')
  return (
    <svg viewBox="0 0 60 100" className={className} aria-hidden>
      <circle cx="30" cy="9" r="7" className="fill-t/15" />
      {/* shoulders */}
      <ellipse cx="17" cy="24" rx="6" ry="5" className={part('hombros')} />
      <ellipse cx="43" cy="24" rx="6" ry="5" className={part('hombros')} />
      {/* back: lats peeking out behind the chest */}
      <path d="M18 27 L22 27 L24 46 L20 44 Z" className={part('espalda')} />
      <path d="M42 27 L38 27 L36 46 L40 44 Z" className={part('espalda')} />
      {/* chest */}
      <rect x="21" y="19" width="18" height="13" rx="5" className={part('pecho')} />
      {/* core */}
      <rect x="23" y="33" width="14" height="17" rx="4" className={part('core')} />
      {/* arms */}
      <rect x="8" y="28" width="6" height="25" rx="3" className={part('brazos')} />
      <rect x="46" y="28" width="6" height="25" rx="3" className={part('brazos')} />
      {/* legs */}
      <rect x="21" y="52" width="8" height="44" rx="4" className={part('piernas')} />
      <rect x="31" y="52" width="8" height="44" rx="4" className={part('piernas')} />
      {/* engine: heart */}
      {group === 'motor' && <path d="M30 31 C26 27 21 30 24 34 L30 39 L36 34 C39 30 34 27 30 31 Z" className="fill-current animate-glow" />}
    </svg>
  )
}
