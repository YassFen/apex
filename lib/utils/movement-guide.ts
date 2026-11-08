// What each movement works and how to do it. Used by the exercise library, the
// muscle-recovery ring on Inicio and the WOD generator. Matching is by keywords in
// the normalized name, so "Power Clean", "Hang Clean" and "Clean & Jerk" all resolve.
import { norm } from '@/lib/utils/readiness'

export type MuscleGroup = 'piernas' | 'espalda' | 'pecho' | 'hombros' | 'brazos' | 'core' | 'motor'

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  piernas: 'Piernas', espalda: 'Espalda', pecho: 'Pecho', hombros: 'Hombros', brazos: 'Brazos', core: 'Core', motor: 'Motor',
}

/** Hours a group needs after a hard session before it's fully fresh. */
export const RECOVERY_HOURS: Record<MuscleGroup, number> = {
  piernas: 72, espalda: 72, pecho: 48, hombros: 48, brazos: 48, core: 36, motor: 24,
}

interface Guide { keys: string[]; muscles: MuscleGroup[]; cues: string[]; desc: string }

// Order matters: more specific keys first ("front squat" before "squat").
const GUIDES: Guide[] = [
  { keys: ['thruster'], muscles: ['piernas', 'hombros', 'core'], desc: 'Front squat que termina en press, en un solo movimiento.',
    cues: ['Barra en rack frontal, codos altos', 'Baja a sentadilla completa', 'Sube explosivo y usa ese impulso para empujar la barra', 'Termina con brazos bloqueados sobre la cabeza'] },
  { keys: ['wall ball'], muscles: ['piernas', 'hombros'], desc: 'Sentadilla con balón medicinal y lanzamiento a un objetivo.',
    cues: ['Balón a la altura del pecho', 'Sentadilla bajo la paralela', 'Lanza aprovechando el empuje de las piernas', 'Recibe el balón y baja en el mismo movimiento'] },
  { keys: ['front squat'], muscles: ['piernas', 'core'], desc: 'Sentadilla con la barra apoyada adelante, sobre los hombros.',
    cues: ['Codos altos todo el recorrido', 'Torso vertical', 'Rodillas hacia afuera', 'Cadera bajo la línea de las rodillas'] },
  { keys: ['overhead squat'], muscles: ['piernas', 'hombros', 'core'], desc: 'Sentadilla con la barra bloqueada sobre la cabeza.',
    cues: ['Agarre ancho, brazos bloqueados', 'Empuja la barra hacia el techo', 'Barra sobre la mitad del pie', 'Baja controlado'] },
  { keys: ['squat', 'sentadilla'], muscles: ['piernas', 'core'], desc: 'Sentadilla trasera con barra.',
    cues: ['Pies al ancho de hombros', 'Pecho arriba y espalda neutra', 'Rodillas siguen la línea de los pies', 'Empuja el piso con todo el pie'] },
  { keys: ['deadlift', 'peso muerto'], muscles: ['piernas', 'espalda', 'core'], desc: 'Levantar la barra desde el suelo hasta la cadera.',
    cues: ['Barra pegada a las canillas', 'Espalda neutra, dorsales activos', 'Empuja el piso con las piernas', 'Termina con cadera extendida, sin hiperextender'] },
  { keys: ['clean', 'cargada'], muscles: ['piernas', 'espalda', 'hombros'], desc: 'Llevar la barra del suelo al rack frontal en un tirón.',
    cues: ['Primer tirón lento y controlado', 'Extensión completa de cadera', 'Codos rápidos al frente', 'Recibe con rodillas flexionadas'] },
  { keys: ['snatch', 'arranque'], muscles: ['piernas', 'espalda', 'hombros'], desc: 'Llevar la barra del suelo a sobre la cabeza en un solo movimiento.',
    cues: ['Agarre ancho', 'Barra cerca del cuerpo todo el tirón', 'Extensión completa y métete bajo la barra', 'Bloquea arriba con hombros activos'] },
  { keys: ['bench'], muscles: ['pecho', 'brazos'], desc: 'Press de banca con barra.',
    cues: ['Escápulas juntas y abajo', 'Pies firmes en el suelo', 'Barra al esternón', 'Empuja en línea recta'] },
  { keys: ['jerk', 'push press', 'press', 'shoulder'], muscles: ['hombros', 'brazos', 'core'], desc: 'Empujar la barra desde los hombros hasta sobre la cabeza.',
    cues: ['Abdomen apretado', 'Dip corto y vertical', 'Saca la cabeza para que pase la barra', 'Termina con orejas delante de los brazos'] },
  { keys: ['muscle up', 'muscle-up'], muscles: ['espalda', 'brazos', 'pecho', 'core'], desc: 'Pasar de colgado a apoyo sobre la barra o anillas.',
    cues: ['Kip potente desde la cadera', 'Tira la barra hacia la cadera', 'Pasa el pecho rápido sobre la barra', 'Termina con brazos bloqueados'] },
  { keys: ['pull up', 'pull-up', 'chin', 'dominada', 'chest to bar', 'chest-to-bar'], muscles: ['espalda', 'brazos'], desc: 'Subir colgado de la barra hasta pasar el mentón.',
    cues: ['Agarre al ancho de hombros', 'Hombros activos antes de tirar', 'Mentón sobre la barra en cada rep', 'Baja hasta brazos estirados'] },
  { keys: ['rope', 'cuerda'], muscles: ['espalda', 'brazos', 'core'], desc: 'Trepar la cuerda.',
    cues: ['Usa los pies para frenar la cuerda', 'Sube con las piernas, no solo con los brazos', 'Baja controlado, mano bajo mano'] },
  { keys: ['handstand', 'hspu', 'parada de manos'], muscles: ['hombros', 'brazos', 'core'], desc: 'Flexiones en parada de manos.',
    cues: ['Manos algo más anchas que los hombros', 'Cabeza forma un triángulo con las manos', 'Core apretado, cuerpo en línea', 'Empuja hasta bloquear'] },
  { keys: ['push up', 'push-up', 'flexion', 'dip', 'fondo'], muscles: ['pecho', 'brazos'], desc: 'Empuje con el peso del cuerpo.',
    cues: ['Cuerpo en línea recta', 'Codos a 45°', 'Pecho al suelo en cada rep', 'Bloquea arriba'] },
  { keys: ['toes to bar', 'toes-to-bar', 't2b', 'knees to elbow', 'sit up', 'sit-up', 'ghd', 'v up', 'plank', 'l sit', 'abdominal'], muscles: ['core'], desc: 'Trabajo de zona media.',
    cues: ['Abdomen activo todo el tiempo', 'Controla la bajada', 'Usa el kip con ritmo, no a tirones'] },
  { keys: ['kettlebell', 'kb swing', 'swing'], muscles: ['piernas', 'espalda', 'core'], desc: 'Balanceo de kettlebell con extensión de cadera.',
    cues: ['Bisagra de cadera, no sentadilla', 'La cadera impulsa la kettlebell', 'Glúteos apretados arriba', 'Brazos solo guían'] },
  { keys: ['lunge', 'zancada', 'step up', 'box jump', 'salto', 'pistol'], muscles: ['piernas'], desc: 'Trabajo unilateral o pliométrico de piernas.',
    cues: ['Rodilla alineada con el pie', 'Torso estable', 'Aterriza suave y extiende completo arriba'] },
  { keys: ['burpee'], muscles: ['motor', 'pecho', 'piernas'], desc: 'Pecho al suelo, de pie y salto.',
    cues: ['Pecho y muslos tocan el suelo', 'Pies juntos al volver', 'Salta y aplaude sobre la cabeza', 'Ritmo constante, respira'] },
  { keys: ['double under', 'double-under', 'single under', 'cuerda de saltar', 'jump rope'], muscles: ['motor'], desc: 'La cuerda pasa dos veces bajo los pies por salto.',
    cues: ['Salto bajo y rápido', 'Gira con las muñecas', 'Codos cerca del cuerpo', 'Mira al frente'] },
  { keys: ['row', 'remo', 'bike', 'assault', 'echo', 'ski', 'run', 'carrera', 'swim'], muscles: ['motor'], desc: 'Trabajo de motor (monoestructural).',
    cues: ['Encuentra un ritmo que puedas sostener', 'Respira desde el principio', 'Acelera solo al final'] },
]

const FALLBACK_BY_CATEGORY: Record<string, MuscleGroup[]> = {
  weightlifting: ['piernas', 'espalda'], olympic: ['piernas', 'espalda', 'hombros'],
  gymnastics: ['espalda', 'core'], cardio: ['motor'], benchmark: ['motor'],
}

export function guideFor(name: string, category?: string): { muscles: MuscleGroup[]; cues: string[]; desc: string | null } {
  const n = norm(name)
  const g = GUIDES.find(x => x.keys.some(k => n.includes(norm(k))))
  if (g) return { muscles: g.muscles, cues: g.cues, desc: g.desc }
  return { muscles: FALLBACK_BY_CATEGORY[category ?? ''] ?? [], cues: [], desc: null }
}

/* ── Recovery ─────────────────────────────────────────────────────────────── */

export interface Hit { at: string; movement: string }

export interface GroupRecovery { group: MuscleGroup; pct: number; lastAt: string | null; daysToFull: number }

/** 0-100 per group from the last time it was trained. Never trained = fully fresh. */
export function recoveryByGroup(hits: Hit[], now = Date.now()): GroupRecovery[] {
  const last = new Map<MuscleGroup, number>()
  for (const h of hits) {
    const t = new Date(h.at).getTime()
    if (!Number.isFinite(t) || t > now) continue
    for (const g of guideFor(h.movement).muscles) if (t > (last.get(g) ?? 0)) last.set(g, t)
  }
  return (Object.keys(MUSCLE_LABEL) as MuscleGroup[]).map(group => {
    const t = last.get(group)
    if (!t) return { group, pct: 100, lastAt: null, daysToFull: 0 }
    const hours = (now - t) / 3_600_000
    const need = RECOVERY_HOURS[group]
    const pct = Math.max(3, Math.min(100, Math.round((hours / need) * 100)))
    return { group, pct, lastAt: new Date(t).toISOString(), daysToFull: pct >= 100 ? 0 : Math.ceil((need - hours) / 24) }
  }).sort((a, b) => a.pct - b.pct)
}

export function lastHitLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Sin registro reciente'
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? 'Último trabajo hoy' : days === 1 ? 'Último trabajo ayer' : `Último trabajo hace ${days} días`
}

/** A YouTube thumbnail for a YouTube link, else null. */
export function youtubeThumb(url: string | null | undefined): string | null {
  if (!url) return null
  const m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(url)
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null
}
export function youtubeEmbed(url: string | null | undefined): string | null {
  if (!url) return null
  const m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(url)
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null
}
export const youtubeSearch = (name: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} crossfit técnica`)}`
