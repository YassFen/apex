// How ready an athlete is for an event: each prescribed movement is compared
// with the athlete's own records (1RM, nRM, max reps) to say how heavy it is
// for them and how to break it up.
import { repsAtWeight } from '@/lib/utils/rm-calculator'

export type EventKind = 'competencia' | 'open' | 'throwdown' | 'evento' | 'otro'
export type EventCategory = 'm' | 'f'

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  competencia: 'Competencia',
  open:        'CrossFit Open',
  throwdown:   'Throwdown',
  evento:      'Evento del box',
  otro:        'Otro',
}

export interface EventMovement {
  name: string
  reps: string
  load_lb?: number | null    // men's prescription
  load_lb_f?: number | null  // women's prescription
}

export interface EventWorkout {
  id?: string
  position: number
  title: string
  type: 'fortime' | 'amrap' | 'emom' | 'tabata' | 'strength'
  time_cap_mins: number | null
  description: string
  movements: EventMovement[]
}

export interface PrLite { movement: string; metric: string; valueLb: number }
export interface BenchmarkLite { name: string; result: string }

export type Zone = 'easy' | 'moderate' | 'hard' | 'heavy' | 'over' | 'skill' | 'unknown'

export const ZONE_META: Record<Zone, { label: string; text: string; bg: string; score: number | null }> = {
  easy:     { label: 'Cómodo',          text: 'text-gr', bg: 'bg-gr', score: 100 },
  moderate: { label: 'Exigente',        text: 'text-bl', bg: 'bg-bl', score: 85 },
  hard:     { label: 'Al límite',       text: 'text-or', bg: 'bg-or', score: 60 },
  heavy:    { label: 'Muy pesado',      text: 'text-rd', bg: 'bg-rd', score: 30 },
  over:     { label: 'Sobre tu 1RM',    text: 'text-rd', bg: 'bg-rd', score: 5 },
  skill:    { label: 'Según tus reps',  text: 'text-pu', bg: 'bg-pu', score: null },
  unknown:  { label: 'Sin datos',       text: 'text-fa', bg: 'bg-fa', score: null },
}

export interface MovementAssessment {
  movement: EventMovement
  loadLb: number | null
  matched: string | null       // name of the record used
  oneRmLb: number | null
  estimated: boolean           // 1RM came from a 2RM/3RM
  maxReps: number | null
  pct: number | null           // load as % of 1RM
  zone: Zone
  repsPossible: number | null  // unbroken reps at that load (or max reps for bodyweight)
  prescribedReps: number | null
  advice: string
}

export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Loose name match: "Power Clean" matches a "Clean" record only when no closer one exists. */
export function matchRecordName(name: string, records: string[]): string | null {
  const n = norm(name)
  if (!n) return null
  const exact = records.find(r => norm(r) === n)
  if (exact) return exact
  // Longest record name contained in the movement (or vice versa) wins.
  const candidates = records
    .filter(r => { const x = norm(r); return x && (n.includes(x) || x.includes(n)) })
    .sort((a, b) => norm(b).length - norm(a).length)
  return candidates[0] ?? null
}

/** First number in a reps scheme: "21-15-9" → 21, "10 cal" → 10, "max" → null. */
export function firstReps(reps: string): number | null {
  const m = /\d+/.exec(reps ?? '')
  return m ? Number(m[0]) : null
}

export function loadFor(m: EventMovement, category: EventCategory): number | null {
  const v = category === 'f' ? (m.load_lb_f ?? m.load_lb) : (m.load_lb ?? m.load_lb_f)
  return v && v > 0 ? Number(v) : null
}

export function bestOneRm(prs: PrLite[], movement: string): { valueLb: number; estimated: boolean } | null {
  const own = prs.filter(p => p.movement === movement)
  const exact = own.find(p => p.metric === '1rm')
  if (exact) return { valueLb: exact.valueLb, estimated: false }
  const est = own
    .filter(p => /^[23]rm$/.test(p.metric))
    .map(p => p.valueLb * (1 + Number(p.metric[0]) / 30))
    .sort((a, b) => b - a)[0]
  return est ? { valueLb: Math.round(est), estimated: true } : null
}

export function assessMovement(m: EventMovement, category: EventCategory, prs: PrLite[]): MovementAssessment {
  const loadLb = loadFor(m, category)
  const prescribedReps = firstReps(m.reps)
  const names = [...new Set(prs.map(p => p.movement))]
  // Close relatives when there's no record of the exact movement.
  const RELATED: [RegExp, string][] = [[/chest.?to.?bar|c2b/i, 'Pull-up'], [/jumping pull/i, 'Pull-up'], [/bar muscle/i, 'Muscle-up'], [/knees? to elbow/i, 'Toes-to-Bar']]
  const related = RELATED.find(([re]) => re.test(m.name))?.[1]
  const matched = matchRecordName(m.name, names) ?? (related ? matchRecordName(related, names) : null)
  const one = matched ? bestOneRm(prs, matched) : null
  const maxRepsPr = matched ? prs.find(p => p.movement === matched && p.metric === 'max_reps') : undefined
  const maxReps = maxRepsPr ? Math.round(maxRepsPr.valueLb) : null

  const base: MovementAssessment = {
    movement: m, loadLb, matched, oneRmLb: one?.valueLb ?? null, estimated: !!one?.estimated,
    maxReps, pct: null, zone: 'unknown', repsPossible: null, prescribedReps, advice: '',
  }

  // Light implements (wall ball, dumbbells for reps…) are about volume, not strength.
  const light = loadLb !== null && loadLb < 45 && !one
  const motor = /\b(row|remo|bike|ski|run|carrera|cal)\b/i.test(`${m.name} ${m.reps}`)
  if (light) return { ...base, zone: 'skill', advice: 'Carga liviana: el desafío es el volumen. Parte en series cortas desde el inicio.' }
  if (loadLb) {
    if (!one) return { ...base, advice: `Registra tu 1RM de ${m.name} para saber cuánto pesa para ti.` }
    const ratio = (loadLb / one.valueLb) * 100
    const pct = Math.round(ratio)
    const repsPossible = repsAtWeight(one.valueLb, loadLb)
    const zone: Zone = ratio > 100 ? 'over' : ratio > 85 ? 'heavy' : ratio > 70 ? 'hard' : ratio > 55 ? 'moderate' : 'easy'
    return { ...base, pct, zone, repsPossible, advice: loadAdvice(zone, repsPossible, prescribedReps) }
  }

  if (maxReps) {
    // Bodyweight: in a metcon, sets of ~half your max unbroken are sustainable.
    const set = Math.max(1, Math.round(maxReps * 0.5))
    const advice = prescribedReps && prescribedReps <= set
      ? `Hazlas seguidas: tu máximo es ${maxReps}.`
      : `Series de ${set}${prescribedReps ? ` (${Math.ceil(prescribedReps / set)} bloques)` : ''}. Tu máximo es ${maxReps}.`
    return { ...base, zone: 'skill', repsPossible: maxReps, advice }
  }

  if (motor) return { ...base, zone: 'skill', advice: 'Motor: sal a un ritmo que puedas sostener y acelera al final.' }
  return { ...base, advice: loadLb === null && !matched ? 'Registra tu máximo de reps para saber cómo partirlo.' : '' }
}

function loadAdvice(zone: Zone, repsPossible: number, prescribed: number | null): string {
  if (zone === 'over') return 'Hoy está sobre tu 1RM: trabaja la fuerza o compite en Scaled.'
  // Sustainable set in a workout ≈ 40-50 % of your unbroken max at that load.
  const set = Math.max(1, Math.round(repsPossible * (zone === 'heavy' ? 0.6 : 0.45)))
  if (zone === 'heavy') return repsPossible <= 1 ? 'Es prácticamente tu 1RM: un intento limpio y bien calentado.' : `Singles o dobles con descanso. Máximo ~${repsPossible} seguidas.`
  if (prescribed && prescribed <= set) return `Puedes hacerlas seguidas (~${repsPossible} reps posibles).`
  return `Series de ${set}${prescribed ? ` → ${Math.ceil(prescribed / set)} bloques de ${prescribed}` : ''}. Máximo ~${repsPossible} seguidas.`
}

export interface Readiness {
  score: number | null       // 0-100
  known: number
  total: number
  missing: string[]          // movements that need a record
  assessments: MovementAssessment[][] // per workout
}

export function eventReadiness(workouts: EventWorkout[], category: EventCategory, prs: PrLite[]): Readiness {
  const assessments = workouts.map(w => (w.movements ?? []).filter(m => m.name?.trim()).map(m => assessMovement(m, category, prs)))
  const flat = assessments.flat()
  const scored = flat.map(a => ZONE_META[a.zone].score).filter((s): s is number => s !== null)
  const skill = flat.filter(a => a.zone === 'skill' && a.maxReps !== null).length
  const missing = [...new Set(flat.filter(a => a.zone === 'unknown').map(a => a.movement.name))]
  const known = scored.length + skill
  const score = known === 0 ? null : Math.round((scored.reduce((s, v) => s + v, 0) + skill * 85) / known)
  return { score, known, total: flat.length, missing, assessments }
}

/** Athlete's result on a named benchmark that matches the workout title (e.g. "Fran"). */
export function benchmarkFor(title: string, benchmarks: BenchmarkLite[]): BenchmarkLite | null {
  const t = norm(title)
  return benchmarks.find(b => { const n = norm(b.name); return n && (t === n || t.split(' ').includes(n)) }) ?? null
}
