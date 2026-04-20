// Epley formula: 1RM = weight × (1 + reps/30)
export function calcOneRM(weight: number, reps: number): number {
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30))
}

export const RM_PERCENTAGES = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50] as const

export function getRmTable(oneRM: number) {
  return RM_PERCENTAGES.map(pct => ({
    pct,
    weight: Math.round(oneRM * (pct / 100)),
    approxReps: pct >= 95 ? 1 : pct >= 90 ? 2 : pct >= 85 ? 3 : pct >= 80 ? 5 : pct >= 75 ? 6 : pct >= 70 ? 8 : pct >= 65 ? 10 : pct >= 60 ? 12 : 15,
  }))
}

export const PLATE_WEIGHTS_LB = [45, 35, 25, 15, 10, 5, 2.5] as const
export const BAR_WEIGHT_LB = 45

export function calcPlates(totalLb: number, barWeight = BAR_WEIGHT_LB): number[][] {
  let remaining = (totalLb - barWeight) / 2
  const plates: number[] = []
  for (const plate of PLATE_WEIGHTS_LB) {
    while (remaining >= plate) {
      plates.push(plate)
      remaining -= plate
    }
  }
  return [plates]
}
