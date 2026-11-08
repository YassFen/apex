// Exercises you can build a box challenge around, grouped category → subcategory.
// A suffix sets the unit: "(cal)" calories, "(m)" meters, "(min)" minutes; otherwise reps.
export interface ExerciseGroup { label: string; items: string[] }
export interface ExerciseCategory { id: string; label: string; subs: ExerciseGroup[] }

export const CHALLENGE_EXERCISES: ExerciseCategory[] = [
  { id: 'gim', label: 'Gimnásticos', subs: [
    { label: 'Tirón', items: ['Pull-up', 'Chest-to-Bar', 'Muscle-up', 'Rope Climb', 'Ring Row'] },
    { label: 'Empuje', items: ['Push-up', 'Handstand Push-up', 'Ring Dip', 'Bench Dip'] },
    { label: 'Core', items: ['Toes-to-Bar', 'Sit-up', 'V-up', 'Hollow Rock', 'Plank (min)'] },
    { label: 'Piernas', items: ['Air Squat', 'Lunge', 'Pistol', 'Box Jump', 'Jumping Squat'] },
  ] },
  { id: 'motor', label: 'Motor', subs: [
    { label: 'Remo y ski', items: ['Row (cal)', 'Row (m)', 'Ski (cal)'] },
    { label: 'Bici', items: ['Assault Bike (cal)', 'Echo Bike (cal)'] },
    { label: 'Correr', items: ['Run (m)', 'Sprint (m)'] },
    { label: 'Cuerda', items: ['Double-Under', 'Single-Under'] },
  ] },
  { id: 'peso', label: 'Con peso', subs: [
    { label: 'Kettlebell', items: ['Kettlebell Swing', 'Goblet Squat', 'KB Snatch'] },
    { label: 'Balón', items: ['Wall Ball', 'Ball Slam'] },
    { label: 'Barra', items: ['Thruster', 'Deadlift', 'Power Clean', 'Snatch'] },
    { label: 'Mancuerna', items: ['DB Snatch', 'Devil Press', 'DB Thruster'] },
  ] },
  { id: 'full', label: 'Cuerpo completo', subs: [
    { label: 'Burpees', items: ['Burpee', 'Burpee Box Jump', 'Bar-facing Burpee'] },
    { label: 'Complejos', items: ['Man Maker', 'Turkish Get-up'] },
  ] },
]

export const unitOfExercise = (m: string) =>
  /\(cal\)/i.test(m) ? 'cal' : /\(m\)/i.test(m) ? 'm' : /\(min\)/i.test(m) ? 'min' : 'reps'
export const cleanExercise = (m: string) => m.replace(/\s*\((cal|m|min)\)/i, '')

/** Sensible targets per unit. */
export const TARGETS: Record<string, number[]> = {
  reps: [50, 100, 300, 500, 1000],
  cal: [100, 250, 500, 1000],
  m: [1000, 5000, 10000, 21000],
  min: [10, 30, 60, 120],
}
