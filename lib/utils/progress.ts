// Leagues, XP rules and streaks. The database (migration 014) awards the XP; this file names it.

export interface League { key: string; name: string; min: number; tone: string; ring: string }

// Tones use the app's tokens only.
export const LEAGUES: League[] = [
  { key: 'bronce',   name: 'Bronce',   min: 0,     tone: 'text-or',  ring: 'bg-or/15' },
  { key: 'plata',    name: 'Plata',    min: 600,   tone: 'text-mu',  ring: 'bg-mu/15' },
  { key: 'oro',      name: 'Oro',      min: 1800,  tone: 'text-ac',  ring: 'bg-ac/15' },
  { key: 'platino',  name: 'Platino',  min: 4000,  tone: 'text-bl',  ring: 'bg-bl/15' },
  { key: 'diamante', name: 'Diamante', min: 8000,  tone: 'text-pu',  ring: 'bg-pu/15' },
  { key: 'elite',    name: 'Élite',    min: 15000, tone: 'text-rd',  ring: 'bg-rd/15' },
]

export function leagueFor(total: number): { league: League; next: League | null; pct: number; toNext: number } {
  let i = 0
  while (i + 1 < LEAGUES.length && total >= LEAGUES[i + 1].min) i++
  const league = LEAGUES[i], next = LEAGUES[i + 1] ?? null
  const pct = next ? Math.min(100, Math.round(((total - league.min) / (next.min - league.min)) * 100)) : 100
  return { league, next, pct, toNext: next ? next.min - total : 0 }
}

export const XP_RULES: { kind: string; label: string; points: string }[] = [
  { kind: 'wod',         label: 'Registrar el WOD del día',            points: '+25' },
  { kind: 'pr',          label: 'Nuevo récord personal (RM)',          points: '+40' },
  { kind: 'class',       label: 'Asistir a una clase',                 points: '+15' },
  { kind: 'benchmark',   label: 'Registrar un benchmark',              points: '+20' },
  { kind: 'lift',        label: 'Registrar otro levantamiento',        points: '+10' },
  { kind: 'log',         label: 'Anotar un entreno propio',            points: '+5' },
  { kind: 'squad',       label: 'Tu dupla o cuarteto entrenó completo', points: '+15' },
  { kind: 'streak',      label: 'Rachas de 3, 7, 14, 30… días',        points: '+30 a +2000' },
  { kind: 'competition', label: 'Competencia del box: participar (el podio lo confirma tu coach: 1°, 2°, 3°)', points: '+40 / 200 / 120 / 80' },
  { kind: 'challenge',   label: 'Completar un reto de la app',         points: 'según el reto' },
]

export const KIND_LABEL: Record<string, string> = {
  wod: 'WOD del día', class: 'Clase', pr: 'Nuevo récord', lift: 'Levantamiento', benchmark: 'Benchmark', log: 'Entreno propio',
  streak: 'Bonus de racha', squad: 'Entreno en equipo', competition: 'Competencia', challenge: 'Reto completado',
}

export const METRIC_LABEL: Record<string, (n: number) => string> = {
  days: n => `${n} ${n === 1 ? 'día' : 'días'} entrenando`,
  wods: n => `${n} ${n === 1 ? 'WOD' : 'WODs'}`,
  classes: n => `${n} ${n === 1 ? 'clase' : 'clases'}`,
  prs: n => `${n} ${n === 1 ? 'récord' : 'récords'}`,
  xp: n => `${n} XP`,
}

export interface SquadInfo {
  id: string; name: string; size: number; code: string; streak: number; best: number
  members: { id: string; name: string; avatar: string | null; trained_today: boolean }[]
}
export interface ChallengeInfo {
  id: string; title: string; description: string | null; metric: string; target: number; reward: number
  starts_on: string; ends_on: string; progress: number; done: boolean
}
export interface Progress {
  total: number; week: number; today: number; trained_today: boolean; streak: number; best_streak: number
  last_day: string | null; public: boolean; recent: { kind: string; points: number; day: string; created_at: string }[]
  days: string[]; squads: SquadInfo[]; challenges: ChallengeInfo[]
}
export interface RankRow { user_id: string; full_name: string; avatar_url: string | null; xp: number; total: number }

/** Current and best streak of a set of training days: one rest day in between is fine, two break it. */
export function streakOf(days: string[], today: string): { current: number; best: number; start: string | null } {
  const sorted = [...new Set(days)].sort()
  const diff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
  let run = 0, best = 0, start: string | null = null, prev: string | null = null
  for (const d of sorted) {
    if (!prev || diff(prev, d) > 2) { run = 1; start = d } else run++
    best = Math.max(best, run); prev = d
  }
  if (!prev || diff(prev, today) > 2) return { current: 0, best, start: null }
  return { current: run, best, start }
}

export const SQUAD_REASON: Record<string, string> = {
  bad_size: 'Elige dupla (2) o cuarteto (4).', bad_name: 'Ponle un nombre de hasta 40 letras.',
  too_many: 'Puedes estar en 3 equipos como máximo.', no_squad: 'No encontramos un equipo con ese código.',
  full: 'Ese equipo ya está completo.',
}
