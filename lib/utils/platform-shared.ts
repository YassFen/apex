// Types and pure helpers of the application panel, safe to import from client components.
type KV = { k: string; n: number; users?: number; path?: string; mode?: string }
export interface Usage {
  days: number
  totals: { users: number; boxes: number; coaches: number; athletes: number; new_7d: number; dau: number; wau: number; mau: number; sessions: number; open_errors: number; period_users?: number }
  retention: { before: number; kept: number }
  daily: { d: string; users: number; events: number }[]
  signups: { d: string; n: number }[]
  modes: { k: string; users: number; events: number }[]
  screens: KV[]; clicks: KV[]; rage: KV[]
  devices: { k: string; users: number; installed: number }[]
  hours: { h: number; n: number }[]
  weekdays: { d: number; n: number }[]
  ages: { k: string; n: number }[]
  sex: { k: string; n: number }[]
  versions: { k: string; users: number }[]
}

export interface ErrorGroup {
  fingerprint: string; message: string; stack: string | null; kind: string; count: number; users: number
  first_seen: string; last_seen: string; paths: (string | null)[] | null; versions: (string | null)[] | null; devices: (string | null)[] | null
  status: 'open' | 'resolved' | 'ignored'; note: string | null; status_at: string | null
  trail?: { t: string; kind: string; label: string }[] | null
}

/** A resolved error that showed up again after it was closed counts as open. */
export const isOpenError = (g: ErrorGroup) => g.status === 'open' || (g.status === 'resolved' && !!g.status_at && g.last_seen > g.status_at)

/** Friendly names for the screens people open. */
const SCREENS: [RegExp, string][] = [
  [/^\/dashboard$/, 'Inicio'], [/^\/wod$/, 'WOD del día'], [/^\/wod\/history/, 'Historial de WODs'], [/^\/prs/, 'Récords (RM)'], [/^\/calc/, 'Calculadora RM'],
  [/^\/timer/, 'Timer'], [/^\/calendar\/event/, 'Evento / competencia'], [/^\/calendar/, 'Calendario'], [/^\/benchmarks/, 'Benchmarks'], [/^\/competitions/, 'Competencias'],
  [/^\/challenges/, 'Retos'], [/^\/movements/, 'Ejercicios'], [/^\/classes/, 'Clases y reservas'], [/^\/announcements/, 'Avisos'], [/^\/analytics/, 'Analytics del coach'],
  [/^\/coach\/publish-wod/, 'Publicar WOD'], [/^\/coach\/wod-live/, 'Seguimiento en vivo'], [/^\/coach\/athletes/, 'Atletas (coach)'], [/^\/coach\/create-box/, 'Crear box'],
  [/^\/manage$/, 'Admin · Resumen'], [/^\/manage\/members\/:id/, 'Admin · Ficha'], [/^\/manage\/members/, 'Admin · Personas'], [/^\/manage\/plans/, 'Admin · Planes'],
  [/^\/manage\/schedule/, 'Admin · Horarios'], [/^\/manage\/coaches/, 'Admin · Coaches'], [/^\/settings\/(\w+)/, 'Configuración'], [/^\/settings/, 'Configuración'],
]
export function screenName(path: string): string {
  const hit = SCREENS.find(([re]) => re.test(path))
  if (!hit) return path
  const sub = /^\/settings\/(\w+)/.exec(path)?.[1]
  return sub ? `${hit[1]} · ${sub}` : hit[1]
}
