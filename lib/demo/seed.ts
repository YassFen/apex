// DEMO MODE — realistic fake data: a box in Santiago with ~3 months of programming,
// classes at different times, 21 athletes with results, the demo coach's own records,
// competitions (past with results, upcoming with workouts), goals and home training.
// Everything is generated relative to today, with a fixed seed, so it always looks current.
import { addDaysISO } from '@/lib/utils/dates'
import type { Row, Store } from './engine'
import { DEMO_EMAIL, DEMO_USER_ID } from './client'

const KG = (kg: number) => Math.round((kg / 0.453592) * 10) / 10

function rng(seed: number) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}

const BOX = 'demo-box-cordillera'
const BOX2 = 'demo-box-vina'

const ATHLETES = [
  'Valentina Muñoz', 'Benjamín Soto', 'Antonia Pérez', 'Matías González', 'Catalina Díaz', 'Joaquín Herrera',
  'Fernanda Castro', 'Tomás Vargas', 'Josefa Morales', 'Vicente Reyes', 'Isidora Silva', 'Agustín Torres',
  'Florencia Rojas', 'Diego Contreras', 'Martina Fuentes', 'Cristóbal Araya', 'Sofía Espinoza', 'Lucas Sepúlveda',
  'Javiera Tapia', 'Maximiliano Núñez', 'Emilia Carrasco',
]

const MOVEMENTS: [string, string][] = [
  ['Back Squat', 'weightlifting'], ['Front Squat', 'weightlifting'], ['Overhead Squat', 'weightlifting'], ['Deadlift', 'weightlifting'],
  ['Bench Press', 'weightlifting'], ['Strict Press', 'weightlifting'], ['Push Press', 'weightlifting'], ['Thruster', 'weightlifting'],
  ['Clean', 'olympic'], ['Power Clean', 'olympic'], ['Clean & Jerk', 'olympic'], ['Snatch', 'olympic'], ['Power Snatch', 'olympic'], ['Push Jerk', 'olympic'],
  ['Pull-up', 'gymnastics'], ['Chest-to-Bar', 'gymnastics'], ['Muscle-up', 'gymnastics'], ['Handstand Push-up', 'gymnastics'],
  ['Toes-to-Bar', 'gymnastics'], ['Push-up', 'gymnastics'], ['Ring Dip', 'gymnastics'], ['Rope Climb', 'gymnastics'], ['Box Jump', 'gymnastics'],
  ['Double-Under', 'cardio'], ['Row', 'cardio'], ['Assault Bike', 'cardio'], ['Run', 'cardio'], ['Burpee', 'cardio'],
  ['Wall Ball', 'weightlifting'], ['Kettlebell Swing', 'weightlifting'],
]
const daysSince = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)
const mvId = (name: string) => `mv-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

type M = { name: string; reps: string; weight?: string }
interface Tpl { title: string; type: 'fortime' | 'amrap' | 'emom' | 'tabata' | 'strength'; mins: number | null; desc: string; movs: M[]; base: number }
// base: typical result — seconds (for time), rounds (amrap), kg (strength), reps (emom/tabata)
const PROGRAM: Tpl[] = [
  { title: 'Fran', type: 'fortime', mins: 10, base: 330, desc: '21-15-9 por tiempo', movs: [{ name: 'Thruster', reps: '21-15-9', weight: '43/30 kg' }, { name: 'Pull-up', reps: '21-15-9' }] },
  { title: 'Grace', type: 'fortime', mins: 8, base: 260, desc: '30 Clean & Jerks por tiempo', movs: [{ name: 'Clean & Jerk', reps: '30', weight: '61/43 kg' }] },
  { title: 'Helen', type: 'fortime', mins: 15, base: 640, desc: '3 rondas por tiempo', movs: [{ name: 'Run', reps: '400 m' }, { name: 'Kettlebell Swing', reps: '21', weight: '24/16 kg' }, { name: 'Pull-up', reps: '12' }] },
  { title: 'Cindy', type: 'amrap', mins: 20, base: 17, desc: 'AMRAP 20 minutos', movs: [{ name: 'Pull-up', reps: '5' }, { name: 'Push-up', reps: '10' }, { name: 'Air Squat', reps: '15' }] },
  { title: 'Diane', type: 'fortime', mins: 12, base: 480, desc: '21-15-9 por tiempo', movs: [{ name: 'Deadlift', reps: '21-15-9', weight: '102/70 kg' }, { name: 'Handstand Push-up', reps: '21-15-9' }] },
  { title: 'Karen', type: 'fortime', mins: 12, base: 560, desc: '150 Wall Balls por tiempo', movs: [{ name: 'Wall Ball', reps: '150', weight: '9/6 kg' }] },
  { title: 'Jackie', type: 'fortime', mins: 15, base: 600, desc: 'Por tiempo', movs: [{ name: 'Row', reps: '1000 m' }, { name: 'Thruster', reps: '50', weight: '20/15 kg' }, { name: 'Pull-up', reps: '30' }] },
  { title: 'DT', type: 'fortime', mins: 15, base: 620, desc: '5 rondas por tiempo', movs: [{ name: 'Deadlift', reps: '12', weight: '70/47 kg' }, { name: 'Power Clean', reps: '9', weight: '70/47 kg' }, { name: 'Push Jerk', reps: '6', weight: '70/47 kg' }] },
  { title: 'Isabel', type: 'fortime', mins: 8, base: 290, desc: '30 Snatches por tiempo', movs: [{ name: 'Snatch', reps: '30', weight: '61/43 kg' }] },
  { title: 'Kelly', type: 'fortime', mins: 30, base: 1500, desc: '5 rondas por tiempo', movs: [{ name: 'Run', reps: '400 m' }, { name: 'Box Jump', reps: '30', weight: '60/50 cm' }, { name: 'Wall Ball', reps: '30', weight: '9/6 kg' }] },
  { title: 'Martes de Motor', type: 'amrap', mins: 18, base: 7, desc: 'AMRAP 18 minutos', movs: [{ name: 'Row', reps: '12 cal' }, { name: 'Box Jump', reps: '10' }, { name: 'Toes-to-Bar', reps: '8' }] },
  { title: 'Chipper del Viernes', type: 'fortime', mins: 25, base: 1260, desc: 'Por tiempo, cap 25 min', movs: [{ name: 'Double-Under', reps: '50' }, { name: 'Wall Ball', reps: '40' }, { name: 'Kettlebell Swing', reps: '30', weight: '24/16 kg' }, { name: 'Burpee', reps: '20' }, { name: 'Chest-to-Bar', reps: '10' }] },
  { title: 'EMOM Gimnástico', type: 'emom', mins: 16, base: 180, desc: 'Cada minuto, 4 estaciones', movs: [{ name: 'Toes-to-Bar', reps: '12' }, { name: 'Handstand Push-up', reps: '8' }, { name: 'Box Jump', reps: '12' }, { name: 'Assault Bike', reps: '12 cal' }] },
  { title: 'Tabata Mix', type: 'tabata', mins: 16, base: 260, desc: '4 Tabatas, 1 min descanso entre cada una', movs: [{ name: 'Burpee', reps: 'máx' }, { name: 'Air Squat', reps: 'máx' }, { name: 'Push-up', reps: 'máx' }, { name: 'Row', reps: 'máx cal' }] },
  { title: 'Back Squat 5x5', type: 'strength', mins: null, base: 105, desc: '5 series de 5 al 80%, descanso 2:30', movs: [{ name: 'Back Squat', reps: '5x5', weight: '80%' }] },
  { title: 'Deadlift 5-3-1', type: 'strength', mins: null, base: 150, desc: 'Sube a un 1RM del día', movs: [{ name: 'Deadlift', reps: '5-3-1', weight: 'pesado' }] },
  { title: 'Snatch: 3RM', type: 'strength', mins: null, base: 62, desc: 'Encuentra tu 3RM en 15 minutos', movs: [{ name: 'Snatch', reps: '3', weight: '3RM' }] },
  { title: 'Clean & Jerk pesado', type: 'strength', mins: null, base: 88, desc: 'Complejo: 1 Clean + 2 Jerks, sube cada serie', movs: [{ name: 'Clean & Jerk', reps: '1+2', weight: 'pesado' }] },
  { title: 'Push Press 5x3', type: 'strength', mins: null, base: 72, desc: '5 series de 3 al 85%', movs: [{ name: 'Push Press', reps: '5x3', weight: '85%' }] },
  { title: 'Partner WOD Sábado', type: 'amrap', mins: 30, base: 9, desc: 'AMRAP 30 en parejas, uno trabaja y otro descansa', movs: [{ name: 'Assault Bike', reps: '20 cal' }, { name: 'Wall Ball', reps: '30' }, { name: 'Burpee', reps: '20' }, { name: 'Kettlebell Swing', reps: '30', weight: '24/16 kg' }] },
]

const resultTypeOf = (t: Tpl['type']) => (t === 'fortime' ? 'time' : t === 'amrap' ? 'rounds' : t === 'strength' ? 'weight' : 'reps')

function formatResult(t: Tpl, skill: number, r: () => number): string {
  const noise = 0.92 + r() * 0.16
  if (t.type === 'fortime') {
    const secs = Math.round(t.base * skill * noise)
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  }
  if (t.type === 'amrap') {
    const total = (t.base / skill) * noise
    const rounds = Math.floor(total)
    return `${rounds}+${Math.round((total - rounds) * 25)}`
  }
  if (t.type === 'strength') return String(Math.round(((t.base / skill) * noise) / 2.5) * 2.5)
  return String(Math.round((t.base / skill) * noise))
}

export function buildSeed(today: string): Store {
  const r = rng(20261108)
  const iso = (d: string, hm = '19:40') => new Date(`${d}T${hm}:00-03:00`).toISOString()

  const profiles: Row[] = [{
    id: DEMO_USER_ID, email: DEMO_EMAIL, full_name: 'Martín Fuentes', avatar_url: null, role: 'coach', preferred_unit: 'kg',
    tracking_since: addDaysISO(today, -420), bio: 'Head coach de CrossFit Cordillera. CF-L2. Me encanta el levantamiento olímpico.',
    city: 'Santiago', favorite_movement: 'Clean & Jerk', profile_public: true, show_prs_public: true, sex: 'm', dashboard_layout: null,
    created_at: iso(addDaysISO(today, -420)), updated_at: iso(today),
  }]
  const athletes = ATHLETES.map((name, i) => ({
    id: `demo-ath-${i}`, email: `${name.split(' ')[0].toLowerCase()}@correo.cl`, full_name: name, avatar_url: null, role: 'athlete',
    preferred_unit: 'kg', city: 'Santiago', bio: null, favorite_movement: null, profile_public: false, show_prs_public: false,
    sex: i % 2 === 0 ? 'f' : 'm', skill: 0.78 + r() * 0.55, attendance: 0.35 + r() * 0.55,
    created_at: iso(addDaysISO(today, -300)), updated_at: iso(today),
  }))
  profiles.push(...athletes.map(({ skill: _s, attendance: _a, ...p }) => p))
  profiles.push({ id: 'demo-coach-vina', email: 'coach@roccabox.cl', full_name: 'Paula Rocca', role: 'coach', preferred_unit: 'kg', avatar_url: null, created_at: iso(today), updated_at: iso(today) })

  const boxes: Row[] = [
    { id: BOX, name: 'CrossFit Cordillera', slug: 'crossfit-cordillera', logo_url: null, city: 'Providencia', country: 'Chile', owner_id: DEMO_USER_ID,
      affiliate_code: null, invite_code: 'CORD2026', plan: 'pro', created_at: iso(addDaysISO(today, -420)),
      description: 'Box de CrossFit en Providencia. Clases todos los días, comunidad de 80 atletas.', instagram: 'crossfitcordillera',
      whatsapp: '+56 9 5555 0101', schedule: 'Lun-Vie 07:00, 08:00, 13:00, 19:00, 20:00 · Sáb 10:00', disciplines: ['CrossFit', 'Weightlifting', 'Gymnastics'] },
    { id: BOX2, name: 'Rocca Box Viña', slug: 'rocca-box', logo_url: null, city: 'Viña del Mar', country: 'Chile', owner_id: 'demo-coach-vina',
      invite_code: 'ROCCA777', plan: 'free', created_at: iso(addDaysISO(today, -200)) },
  ]

  const box_members: Row[] = [
    { id: 'bm-me', box_id: BOX, user_id: DEMO_USER_ID, role: 'coach', joined_at: iso(addDaysISO(today, -420)), is_active: true },
    { id: 'bm-me-2', box_id: BOX2, user_id: DEMO_USER_ID, role: 'athlete', joined_at: iso(addDaysISO(today, -120)), is_active: true },
    ...athletes.map((a, i) => ({ id: `bm-${i}`, box_id: BOX, user_id: a.id, role: 'athlete', joined_at: iso(addDaysISO(today, -20 - Math.round(r() * 280))), is_active: true })),
  ]

  const movements: Row[] = MOVEMENTS.map(([name, category]) => ({ id: mvId(name), name, category, description: null, video_url: null, box_id: null }))
  movements.push(
    { id: 'mv-air-squat', name: 'Air Squat', category: 'gymnastics', description: null, video_url: null, box_id: null },
    { id: 'mv-devil-press', name: 'Devil Press', category: 'weightlifting', box_id: BOX, created_by: DEMO_USER_ID,
      description: 'Burpee con mancuernas que termina en un snatch doble sobre la cabeza.',
      cues: 'Pecho al suelo con las manos en las mancuernas\nSalta los pies hacia las manos\nBalancea las mancuernas entre las piernas\nTermina con ambas sobre la cabeza, brazos bloqueados',
      muscles: ['piernas', 'hombros', 'motor'], video_url: null, image_url: null },
  )

  /* ── Programming: last ~80 days, two classes on Tue/Thu, Saturday partner WOD ── */
  const daily_wods: Row[] = []
  const wod_results: Row[] = []
  const bumps: Row[] = []
  let p = 0
  for (let d = -80; d <= 10; d++) {
    const day = addDaysISO(today, d)
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay() // 0 Sunday
    if (dow === 0 && d !== 0) continue // Sundays off, except today so the demo always has classes
    const sessions: { tpl: Tpl; time: string }[] = dow === 6 && d !== 0
      ? [{ tpl: PROGRAM[19], time: '10:00' }]
      : dow === 2 || dow === 4 || d === 0
        ? [{ tpl: PROGRAM[14 + (p % 5)], time: '07:00' }, { tpl: PROGRAM[p % 14], time: '19:00' }]
        : [{ tpl: PROGRAM[p % 14], time: '19:00' }]
    p++
    sessions.forEach((s, k) => {
      const id = `wod-${day}-${k}`
      daily_wods.push({
        id, box_id: BOX, coach_id: DEMO_USER_ID, wod_template_id: null, published_at: iso(addDaysISO(day, d > 0 ? -2 : 0), '06:00'),
        scheduled_for: day, title: s.tpl.title, description: s.tpl.desc, movements: s.tpl.movs, is_live: true, type: s.tpl.type,
        duration_mins: s.tpl.mins, class_time: `${s.time}:00`, show_early: d > 0 ? d <= 3 : false,
      })
      if (d > 0 || (d === 0 && k === 1)) return
      const rt = resultTypeOf(s.tpl.type)
      for (const a of athletes) {
        if (r() > a.attendance * (k === 0 ? 0.45 : 1)) continue
        // Three athletes stopped coming ~10 days ago, so the coach sees who to reach out to.
        if (['demo-ath-18', 'demo-ath-19', 'demo-ath-20'].includes(a.id) && d > -10) continue
        const rx = a.skill > 1.18 ? (r() < 0.7 ? 'scaled' : 'rx') : a.skill < 0.88 && r() < 0.2 ? 'rx+' : 'rx'
        const resId = `res-${id}-${a.id}`
        wod_results.push({ id: resId, daily_wod_id: id, user_id: a.id, result_type: rt, result_value: formatResult(s.tpl, a.skill, r), rx_level: rx, notes: null, recorded_at: iso(day, s.time === '07:00' ? '08:10' : '20:10'), edit_count: 0 })
        if (r() < 0.25) bumps.push({ result_id: resId, user_id: athletes[Math.floor(r() * athletes.length)].id, created_at: iso(day, '21:00') })
      }
      // The demo coach trains most days (PM class, or the AM one today).
      if ((d === 0 && k === 0) || (d < 0 && k === sessions.length - 1 && r() < 0.72)) {
        const resId = `res-${id}-me`
        wod_results.push({ id: resId, daily_wod_id: id, user_id: DEMO_USER_ID, result_type: rt, result_value: formatResult(s.tpl, 0.86, r), rx_level: 'rx', notes: null, recorded_at: iso(day, s.time === '07:00' ? '08:05' : '20:05'), edit_count: 0 })
        for (let b = 0; b < 3; b++) if (r() < 0.6) bumps.push({ result_id: resId, user_id: athletes[Math.floor(r() * athletes.length)].id, created_at: iso(day, '21:00') })
      }
    })
  }
  // A WOD today at the second box too (multi-box).
  daily_wods.push({ id: `wod-${today}-vina`, box_id: BOX2, coach_id: 'demo-coach-vina', published_at: iso(today, '06:00'), scheduled_for: today,
    title: 'Viña Beach Run', description: '3 rondas por tiempo', movements: [{ name: 'Run', reps: '800 m' }, { name: 'Burpee', reps: '20' }, { name: 'Air Squat', reps: '30' }],
    is_live: true, type: 'fortime', duration_mins: 30, class_time: '09:00:00', show_early: false })

  /* ── The demo coach's own records (12 months of progress) ── */
  const pr_records: Row[] = []
  const lift = (name: string, kgs: number[], metric = '1rm') => kgs.forEach((kg, i) => pr_records.push({
    id: `pr-${mvId(name)}-${metric}-${i}`, user_id: DEMO_USER_ID, movement_id: mvId(name), metric,
    value_lb: metric === 'max_reps' || metric === 'time' ? kg : KG(kg), recorded_at: iso(addDaysISO(today, -360 + Math.round((i / Math.max(1, kgs.length - 1)) * 350) - (name.length % 9)), '20:30'),
    notes: null, is_pr: false,
  }))
  lift('Back Squat', [115, 120, 125, 127.5, 132.5, 135, 140])
  lift('Front Squat', [95, 100, 102.5, 107.5, 112.5, 117.5])
  lift('Deadlift', [150, 157.5, 165, 170, 175, 182.5])
  lift('Clean', [85, 90, 92.5, 97.5, 102.5])
  lift('Clean & Jerk', [82.5, 85, 90, 95, 100])
  lift('Snatch', [65, 67.5, 72.5, 75, 80])
  lift('Push Press', [70, 72.5, 77.5, 82.5])
  lift('Bench Press', [85, 90, 92.5, 97.5])
  lift('Strict Press', [50, 52.5, 57.5, 60])
  lift('Thruster', [72.5, 77.5, 85])
  lift('Back Squat', [120, 127.5], '3rm')
  lift('Pull-up', [18, 22, 25], 'max_reps')
  lift('Toes-to-Bar', [15, 22], 'max_reps')
  lift('Handstand Push-up', [9, 14], 'max_reps')
  lift('Muscle-up', [3, 6], 'max_reps')
  lift('Double-Under', [60, 85, 112], 'max_reps')
  // mark bests
  const bestKey = new Map<string, Row>()
  for (const pr of pr_records) {
    const k = `${pr.movement_id}|${pr.metric}`
    const b = bestKey.get(k)
    if (!b || pr.value_lb > b.value_lb) bestKey.set(k, pr)
  }
  bestKey.forEach(pr => { pr.is_pr = true })
  // one fresh PR this week, for the "new record" feeling
  const sq = pr_records.filter(x => x.movement_id === mvId('Back Squat') && x.metric === '1rm').pop()
  if (sq) sq.recorded_at = iso(addDaysISO(today, -2), '20:30')

  const benchmarks: Row[] = [
    ['Fran', '3:58', -40], ['Fran', '4:31', -200], ['Grace', '2:47', -60], ['Helen', '9:12', -25], ['Cindy', '21+4', -90],
    ['Diane', '6:40', -130], ['Murph', '41:35', -165], ['Karen', '7:55', -18], ['Isabel', '3:05', -70],
  ].map(([name, result, ago], i) => ({ id: `bm-res-${i}`, user_id: DEMO_USER_ID, name, result, recorded_at: iso(addDaysISO(today, ago as number)), notes: null, level: 'rx' }))

  /* ── Competitions ── */
  const events: Row[] = []
  const event_workouts: Row[] = []
  const event_participants: Row[] = []
  const event_results: Row[] = []
  const ev = (id: string, o: Row, workouts: Row[], me?: { place?: number; field?: number; res?: [string, number][] }, crowd = 0) => {
    events.push({ id, created_by: DEMO_USER_ID, created_at: iso(addDaysISO(today, -3)), ends_on: null, location: null, url: null, notes: null, box_id: null, ...o })
    workouts.forEach((w, i) => event_workouts.push({ id: `${id}-w${i}`, event_id: id, position: i, time_cap_mins: null, description: '', created_at: iso(today), ...w }))
    if (me) {
      event_participants.push({ event_id: id, user_id: DEMO_USER_ID, category: 'm', division: 'rx', final_place: me.place ?? null, field_size: me.field ?? null, created_at: iso(today) })
      me.res?.forEach(([value, place], i) => event_results.push({ workout_id: `${id}-w${i}`, event_id: id, user_id: DEMO_USER_ID, result_value: value, place, notes: null, recorded_at: iso(o.starts_on) }))
    }
    athletes.slice(0, crowd).forEach((a, k) => {
      event_participants.push({ event_id: id, user_id: a.id, category: a.sex, division: a.skill > 1.15 ? 'scaled' : 'rx', created_at: iso(today) })
      if (me?.res) me.res.forEach((_, i) => event_results.push({ workout_id: `${id}-w${i}`, event_id: id, user_id: a.id, result_value: formatResult(PROGRAM[0], a.skill, r), place: 3 + k * 2 + i, recorded_at: iso(o.starts_on) }))
    })
  }
  ev('ev-throwdown', { name: 'Santiago Throwdown 2026', kind: 'competencia', starts_on: addDaysISO(today, 23), ends_on: addDaysISO(today, 24), location: 'Movistar Arena, Santiago', url: 'https://competitioncorner.net', box_id: BOX,
    notes: 'Llegar 7:30 para el check-in. Categoría Rx. Llevar cuerda propia.' }, [
    { title: 'Evento 1 · Sprint Couplet', type: 'fortime', time_cap_mins: 8, description: '21-15-9', movements: [{ name: 'Thruster', reps: '21-15-9', load_lb: 95, load_lb_f: 65 }, { name: 'Chest-to-Bar', reps: '21-15-9' }] },
    { title: 'Evento 2 · Ladder de Clean', type: 'strength', time_cap_mins: 10, description: 'Una rep por barra, cada 30 segundos sube', movements: [{ name: 'Clean', reps: '1', load_lb: 205, load_lb_f: 145 }, { name: 'Clean', reps: '1', load_lb: 225, load_lb_f: 155 }] },
    { title: 'Evento 3 · Chipper Final', type: 'fortime', time_cap_mins: 15, description: 'Por tiempo', movements: [{ name: 'Row', reps: '40 cal' }, { name: 'Wall Ball', reps: '40', load_lb: 20, load_lb_f: 14 }, { name: 'Toes-to-Bar', reps: '30' }, { name: 'Deadlift', reps: '20', load_lb: 225, load_lb_f: 155 }, { name: 'Muscle-up', reps: '10' }] },
  ], {}, 6)
  ev('ev-open', { name: 'CrossFit Open 26.1', kind: 'open', starts_on: addDaysISO(today, 104), location: 'En el box', box_id: BOX }, [], undefined, 4)
  ev('ev-copa', { name: 'Copa Cordillera 2026', kind: 'throwdown', starts_on: addDaysISO(today, -96), location: 'CrossFit Cordillera' }, [
    { title: 'WOD 1', type: 'fortime', movements: [{ name: 'Snatch', reps: '30', load_lb: 95 }] },
    { title: 'WOD 2', type: 'amrap', time_cap_mins: 12, movements: [{ name: 'Burpee', reps: '10' }, { name: 'Pull-up', reps: '10' }] },
  ], { place: 7, field: 42, res: [['3:41', 9], ['8+4', 6]] }, 5)
  ev('ev-vina', { name: 'Viña Fitness Challenge', kind: 'competencia', starts_on: addDaysISO(today, -185), location: 'Viña del Mar' }, [
    { title: 'Beach Sprint', type: 'fortime', movements: [{ name: 'Run', reps: '800 m' }] },
  ], { place: 12, field: 55, res: [['4:02', 14]] })
  ev('ev-andino', { name: 'Desafío Andino', kind: 'competencia', starts_on: addDaysISO(today, -270), location: 'Las Condes' }, [
    { title: 'Evento único', type: 'fortime', movements: [{ name: 'Thruster', reps: '50', load_lb: 95 }] },
  ], { place: 19, field: 60, res: [['6:15', 21]] })

  /* ── Training on my own + goals ── */
  const personal_logs: Row[] = [
    [-1, 'Pull-up', 5, 10], [-1, 'Push-up', 4, 20], [-3, 'Run', 1, 5000], [-4, 'Double-Under', 5, 50], [-6, 'Handstand Push-up', 5, 6],
    [0, 'Pull-up', 3, 12], [-8, 'Burpee', 1, 100], [-10, 'Toes-to-Bar', 5, 10], [-2, 'Air Squat', 4, 25],
  ].map(([ago, movement, sets, reps], i) => ({
    id: `log-${i}`, user_id: DEMO_USER_ID, logged_on: addDaysISO(today, ago as number), movement, sets,
    reps: movement === 'Run' ? null : reps, distance_m: movement === 'Run' ? reps : null, load_lb: null, duration_sec: null, notes: null, created_at: iso(addDaysISO(today, ago as number), '09:00'),
  }))
  const goals: Row[] = [
    { id: 'goal-1', user_id: DEMO_USER_ID, movement: 'Pull-up', target: 100, unit: 'reps', period: 'week', starts_on: addDaysISO(today, -6), archived: false, created_at: iso(today) },
    { id: 'goal-2', user_id: DEMO_USER_ID, movement: 'Push-up', target: 50, unit: 'reps', period: 'daily', starts_on: addDaysISO(today, -10), archived: false, created_at: iso(today) },
  ]

  /* ── Box challenges ── */
  const challenges: Row[] = [
    { id: 'ch-burpees', box_id: BOX, created_by: 'demo-ath-0', title: '500 burpees en noviembre', movement: 'Burpee', target: 500, unit: 'reps', starts_on: addDaysISO(today, -7), ends_on: addDaysISO(today, 22), created_at: iso(addDaysISO(today, -7)) },
    { id: 'ch-pullups', box_id: BOX, created_by: DEMO_USER_ID, title: '100 dominadas esta semana', movement: 'Pull-up', target: 100, unit: 'reps', starts_on: addDaysISO(today, -4), ends_on: addDaysISO(today, 2), created_at: iso(addDaysISO(today, -4)) },
    { id: 'ch-abs', box_id: BOX, created_by: 'demo-ath-5', title: '30 días de abdominales', movement: 'Sit-up', target: 1500, unit: 'reps', starts_on: addDaysISO(today, -12), ends_on: addDaysISO(today, 17), created_at: iso(addDaysISO(today, -12)) },
    { id: 'ch-row', box_id: BOX, created_by: 'demo-ath-2', title: '10 km de remo', movement: 'Row', target: 10000, unit: 'm', starts_on: addDaysISO(today, -40), ends_on: addDaysISO(today, -10), created_at: iso(addDaysISO(today, -40)) },
  ]
  const challenge_participants: Row[] = []
  const challenge_entries: Row[] = []
  let ce = 0
  for (const c of challenges) {
    const crew = [DEMO_USER_ID, ...athletes.filter(() => r() < 0.45).map(a => a.id)]
    for (const uid of crew) {
      if (c.id === 'ch-abs' && uid === DEMO_USER_ID) continue // one open challenge to join
      challenge_participants.push({ challenge_id: c.id, user_id: uid, joined_at: iso(c.starts_on) })
      const span = Math.max(1, Math.min(daysSince(c.starts_on, today), 30))
      const pace = (c.target / Math.max(7, span + 5)) * (0.5 + r())
      for (let k = 0; k < span; k += 1 + Math.floor(r() * 2)) {
        const amount = Math.max(1, Math.round(pace * (0.6 + r() * 0.8) / (c.unit === 'm' ? 100 : 1)) * (c.unit === 'm' ? 100 : 1))
        challenge_entries.push({ id: `ce-${ce++}`, challenge_id: c.id, user_id: uid, amount, logged_on: addDaysISO(c.starts_on, k), created_at: iso(addDaysISO(c.starts_on, k)) })
      }
    }
  }

  return {
    challenges, challenge_participants, challenge_entries,
    profiles, boxes, box_members, movements, daily_wods, wod_results, wod_result_bumps: bumps, pr_records, benchmarks,
    events, event_workouts, event_participants, event_results, personal_logs, goals, wod_templates: [],
    __me: [{ id: DEMO_USER_ID }],
  }
}
