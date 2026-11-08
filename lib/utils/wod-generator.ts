// "Generar WOD": a quick workout built around the muscle groups that are most recovered,
// with loads taken from the athlete's own 1RMs. Deterministic per seed so "Otra opción"
// gives a new one and re-renders don't reshuffle.
import type { GroupRecovery, MuscleGroup } from '@/lib/utils/movement-guide'

export interface GenMovement { name: string; reps: string; load?: string; group: MuscleGroup }
export interface GeneratedWod { title: string; type: 'amrap' | 'fortime' | 'emom'; minutes: number; movements: GenMovement[]; focus: MuscleGroup[]; note: string }

interface Pool { name: string; group: MuscleGroup; reps: [number, number]; pct?: number; lift?: string }

const POOL: Pool[] = [
  { name: 'Thruster', group: 'piernas', reps: [9, 15], pct: 45, lift: 'Front Squat' },
  { name: 'Front Squat', group: 'piernas', reps: [6, 10], pct: 55, lift: 'Front Squat' },
  { name: 'Wall Ball', group: 'piernas', reps: [15, 20] },
  { name: 'Box Jump', group: 'piernas', reps: [10, 15] },
  { name: 'Walking Lunge', group: 'piernas', reps: [12, 20] },
  { name: 'Deadlift', group: 'espalda', reps: [6, 12], pct: 50, lift: 'Deadlift' },
  { name: 'Kettlebell Swing', group: 'espalda', reps: [15, 21] },
  { name: 'Pull-up', group: 'espalda', reps: [8, 12] },
  { name: 'Power Clean', group: 'espalda', reps: [5, 9], pct: 55, lift: 'Clean' },
  { name: 'Push-up', group: 'pecho', reps: [10, 20] },
  { name: 'Ring Dip', group: 'pecho', reps: [6, 12] },
  { name: 'Push Press', group: 'hombros', reps: [8, 12], pct: 50, lift: 'Push Press' },
  { name: 'Handstand Push-up', group: 'hombros', reps: [5, 10] },
  { name: 'Dumbbell Snatch', group: 'hombros', reps: [10, 16] },
  { name: 'Toes-to-Bar', group: 'core', reps: [8, 15] },
  { name: 'GHD Sit-up', group: 'core', reps: [10, 15] },
  { name: 'V-up', group: 'core', reps: [12, 20] },
  { name: 'Row (cal)', group: 'motor', reps: [12, 20] },
  { name: 'Double-Under', group: 'motor', reps: [30, 60] },
  { name: 'Burpee', group: 'motor', reps: [8, 15] },
  { name: 'Assault Bike (cal)', group: 'motor', reps: [10, 15] },
]

function rng(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

export function generateWod(recovery: GroupRecovery[], maxesLb: Map<string, number>, unit: 'kg' | 'lb', seed: number): GeneratedWod {
  const r = rng(seed)
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  // The three freshest non-motor groups + always some motor work.
  const fresh = recovery.filter(g => g.group !== 'motor').sort((a, b) => b.pct - a.pct).slice(0, 3).map(g => g.group)
  const focus: MuscleGroup[] = [...fresh.slice(0, 2), 'motor']
  const type = pick(['amrap', 'fortime', 'emom'] as const)
  const minutes = type === 'emom' ? pick([12, 15, 16]) : type === 'amrap' ? pick([12, 15, 18, 20]) : pick([10, 12, 15])

  const movements: GenMovement[] = focus.map(group => {
    const p = pick(POOL.filter(x => x.group === group))
    const reps = Math.round(p.reps[0] + r() * (p.reps[1] - p.reps[0]))
    let load: string | undefined
    if (p.pct && p.lift) {
      const max = [...maxesLb.entries()].find(([k]) => k.toLowerCase().includes((p.lift as string).toLowerCase()))?.[1]
      if (max) {
        const lb = (max * p.pct) / 100
        load = unit === 'kg' ? `${Math.round((lb * 0.453592) / 2.5) * 2.5} kg` : `${Math.round(lb / 5) * 5} lb`
      } else load = `${p.pct}% 1RM`
    }
    return { name: p.name, reps: String(reps), load, group }
  })

  const title = type === 'amrap' ? `AMRAP ${minutes}` : type === 'emom' ? `EMOM ${minutes}` : `${pick([3, 4, 5])} rondas por tiempo`
  const note = type === 'emom'
    ? 'Cada minuto un movimiento, en orden. Descansa lo que sobre del minuto.'
    : type === 'amrap' ? 'Máximas rondas en el tiempo, a un ritmo que puedas sostener.' : `Time cap ${minutes} minutos.`
  return { title, type, minutes, movements, focus: focus.filter(g => g !== 'motor'), note }
}
