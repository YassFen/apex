import type { Unit } from '@/lib/types/database'

// Epley formula: 1RM = weight × (1 + reps/30)
export function calcOneRM(weight: number, reps: number): number {
  if (reps <= 1) return weight
  return Math.round(weight * (1 + reps / 30))
}

/** Inverse Epley: how many reps you can do at `weight` with a given 1RM (0 when it's above the 1RM). */
export function repsAtWeight(oneRM: number, weight: number): number {
  if (weight <= 0 || weight > oneRM) return 0
  if (weight === oneRM) return 1
  return Math.max(1, Math.floor(30 * (oneRM / weight - 1)))
}

export const RM_PERCENTAGES = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50] as const

export function approxRepsAt(pct: number): number {
  return pct >= 95 ? 1 : pct >= 90 ? 2 : pct >= 85 ? 3 : pct >= 80 ? 5 : pct >= 75 ? 6 : pct >= 70 ? 8 : pct >= 65 ? 10 : pct >= 60 ? 12 : 15
}

export function getRmTable(oneRM: number) {
  return RM_PERCENTAGES.map(pct => ({
    pct,
    weight: Math.round(oneRM * (pct / 100)),
    approxReps: approxRepsAt(pct),
  }))
}

/* ── Barbell loading ─────────────────────────────────────────────────────── */

/** Plates per unit, heaviest first. lb are CrossFit bumpers, kg the IWF set with change plates. */
export const PLATES: Record<Unit, number[]> = {
  lb: [55, 45, 35, 25, 15, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
}

export const BARS: Record<Unit, { weight: number; label: string }[]> = {
  lb: [{ weight: 45, label: 'Hombre' }, { weight: 35, label: 'Mujer' }, { weight: 15, label: 'Técnica' }],
  kg: [{ weight: 20, label: 'Hombre' }, { weight: 15, label: 'Mujer' }, { weight: 10, label: 'Técnica' }],
}

export const BAR_WEIGHT_LB = 45

/** Smallest jump you can make with the plate set: two of the smallest plate. */
export const loadStep = (unit: Unit) => PLATES[unit][PLATES[unit].length - 1] * 2

/** Rounds to the nearest weight you can actually build on a bar. */
export function roundToLoadable(weight: number, unit: Unit): number {
  const step = loadStep(unit)
  return Math.round(weight / step) * step
}

/** Plates for ONE side, heaviest first, plus whatever couldn't be loaded. */
export function platesPerSide(total: number, bar: number, unit: Unit): { plates: number[]; leftover: number } {
  let remaining = (total - bar) / 2
  const plates: number[] = []
  if (remaining <= 0) return { plates, leftover: 0 }
  for (const plate of PLATES[unit]) {
    while (remaining >= plate - 1e-9) {
      plates.push(plate)
      remaining -= plate
    }
  }
  return { plates, leftover: Math.round(remaining * 2 * 100) / 100 }
}

/** @deprecated kept for older callers; prefer platesPerSide. */
export function calcPlates(totalLb: number, barWeight = BAR_WEIGHT_LB): number[][] {
  return [platesPerSide(totalLb, barWeight, 'lb').plates]
}

/** A standard ramp to a working weight: empty bar, then 40/60/75/85/95 % with fewer reps each time. */
export function warmupSets(target: number, bar: number, unit: Unit): { weight: number; reps: number; pct: number }[] {
  const ramp: [number, number][] = [[0.4, 5], [0.6, 3], [0.75, 2], [0.85, 1], [0.95, 1]]
  const sets = [{ weight: bar, reps: 10, pct: Math.round((bar / target) * 100) }]
  for (const [p, reps] of ramp) {
    const w = roundToLoadable(target * p, unit)
    if (w <= sets[sets.length - 1].weight || w >= target) continue
    sets.push({ weight: w, reps, pct: Math.round(p * 100) })
  }
  return target > bar ? sets : []
}

export const toUnit = (lb: number, unit: Unit) => unit === 'kg' ? lb * 0.453592 : lb
export const fromUnit = (v: number, unit: Unit) => unit === 'kg' ? v / 0.453592 : v
