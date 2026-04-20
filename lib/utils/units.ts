export const lbToKg = (lb: number) => Math.round(lb * 0.453592 * 10) / 10
export const kgToLb = (kg: number) => Math.round(kg * 2.20462)

export function formatWeight(lb: number, unit: 'lb' | 'kg'): string {
  if (unit === 'kg') return `${lbToKg(lb)} kg`
  return `${lb} lbs`
}

export function parseWeightToLb(value: number, unit: 'lb' | 'kg'): number {
  return unit === 'kg' ? kgToLb(value) : value
}
