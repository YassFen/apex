// DEMO MODE — sample numbers for the application panel (/admin), so it can be explored
// without real traffic. Shapes match admin_usage / admin_errors / admin_last_seen (011).
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import type { Row, Store } from './engine'

const wave = (i: number, base: number, amp: number) => Math.max(1, Math.round(base + amp * Math.sin(i / 1.7) + ((i * 37) % 7) - 3))

export function demoAdminRpc(store: Store, fn: string, args: Row): { data: any; error: any } | null {
  const today = todayISO()
  const profiles = store.profiles ?? []
  if (fn === 'admin_last_seen') {
    return { data: profiles.slice(0, 20).map((p, i) => ({ user_id: p.id, last_seen: new Date(Date.now() - i * 9 * 3600_000).toISOString(), events_30d: 420 - i * 19 })), error: null }
  }
  if (fn === 'admin_errors') {
    const st = new Map((store.app_error_status ?? []).map(s => [s.fingerprint, s]))
    const at = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
    const groups = [
      { fingerprint: 'e1x9', kind: 'render', message: "TypeError: Cannot read properties of undefined (reading 'movements')", count: 14, users: 6, first_seen: at(70), last_seen: at(2), paths: ['/wod'], versions: ['0.8.0'], devices: ['mobile'],
        stack: "TypeError: Cannot read properties of undefined (reading 'movements')\n    at WodCard (components/wod/WodView.tsx)\n    at renderWithHooks (react-dom)\n    at WodView (components/wod/WodView.tsx)" },
      { fingerprint: 'a7k2', kind: 'api', message: 'HTTP 503 en /rest/v1/wod_results', count: 9, users: 8, first_seen: at(26), last_seen: at(25), paths: ['/wod', '/dashboard'], versions: ['0.8.0', '0.7.0'], devices: ['mobile', 'desktop'], stack: null },
      { fingerprint: 'p3m5', kind: 'promise', message: 'No se pudo guardar el récord: value_lb fuera de rango', count: 3, users: 2, first_seen: at(120), last_seen: at(30), paths: ['/prs'], versions: ['0.8.0'], devices: ['mobile'],
        stack: 'Error: No se pudo guardar el récord\n    at save (components/athlete/PRModal.tsx)' },
      { fingerprint: 'q8w1', kind: 'error', message: 'ReferenceError: Notification is not defined', count: 22, users: 11, first_seen: at(300), last_seen: at(140), paths: ['/settings/:id'], versions: ['0.7.0'], devices: ['mobile'],
        stack: 'ReferenceError: Notification is not defined\n    at NotificationSettings (components/settings/NotificationSettings.tsx)' },
    ].map(g => { const s = st.get(g.fingerprint); return { ...g, status: s?.status ?? (g.fingerprint === 'q8w1' ? 'resolved' : 'open'), note: null, status_at: s?.updated_at ?? (g.fingerprint === 'q8w1' ? at(100) : null) } })
    return { data: groups, error: null }
  }
  if (fn !== 'admin_usage') return null

  const days = Math.min(90, Math.max(1, Number(args.p_days) || 30))
  const members = store.box_members ?? []
  const mult = days / 30
  const screens: [string, string, number, number][] = [
    ['/wod', 'athlete', 1840, 61], ['/dashboard', 'athlete', 1720, 66], ['/classes', 'athlete', 1310, 58], ['/prs', 'athlete', 640, 44], ['/calc', 'athlete', 520, 39],
    ['/calendar', 'athlete', 410, 35], ['/timer', 'athlete', 380, 31], ['/challenges', 'athlete', 290, 27], ['/wod/history', 'athlete', 150, 19], ['/movements', 'athlete', 120, 17],
    ['/benchmarks', 'athlete', 74, 12], ['/competitions', 'athlete', 41, 9], ['/announcements', 'athlete', 96, 30],
    ['/coach/publish-wod', 'coach', 310, 7], ['/dashboard', 'coach', 290, 8], ['/classes', 'coach', 260, 7], ['/coach/wod-live', 'coach', 140, 6], ['/coach/athletes', 'coach', 88, 6], ['/timer', 'coach', 61, 5], ['/analytics', 'coach', 12, 3],
    ['/manage', 'admin', 120, 3], ['/manage/members', 'admin', 96, 3], ['/manage/schedule', 'admin', 84, 3], ['/manage/members/:id', 'admin', 70, 3], ['/manage/coaches', 'admin', 31, 2], ['/manage/plans', 'admin', 14, 2],
  ]
  const clicks: [string, string, number, number][] = [
    ['Reservar', '/classes', 720, 52], ['Registrar resultado', '/wod', 610, 49], ['Registrar', '/dashboard', 330, 38], ['Dar fuego', '/wod', 280, 33], ['Generar WOD', '/dashboard', 190, 24],
    ['Iniciar', '/timer', 170, 26], ['Agregar récord', '/prs', 150, 30], ['Semana', '/calendar', 96, 21], ['Publicar', '/coach/publish-wod', 88, 7], ['Lista', '/classes', 74, 6],
    ['Personalizar', '/dashboard', 41, 15], ['Renovar o cambiar', '/manage/members/:id', 22, 3], ['Compartir invitación', '/coach/athletes', 9, 4],
  ]
  const hoursShape = [1, 0, 0, 0, 0, 3, 14, 26, 18, 9, 7, 6, 11, 13, 6, 5, 8, 16, 31, 38, 27, 14, 7, 3]
  const k = (n: number) => Math.max(1, Math.round(n * mult))
  return {
    error: null,
    data: {
      days,
      totals: { users: profiles.length + 131, boxes: (store.boxes ?? []).length + 5, coaches: members.filter(m => m.role !== 'athlete').length + 11, athletes: members.filter(m => m.role === 'athlete').length + 118,
        new_7d: 9, dau: 47, wau: 96, mau: 128, sessions: k(2140), open_errors: 3 },
      retention: { before: 91, kept: 68 },
      daily: Array.from({ length: days }, (_, i) => ({ d: addDaysISO(today, i - days + 1), users: wave(i, 44, 9), events: wave(i, 610, 140) })),
      signups: Array.from({ length: 12 }, (_, i) => ({ d: addDaysISO(today, (i - 11) * 7), n: wave(i, 7, 4) })),
      modes: [{ k: 'athlete', users: 117, events: k(8900) }, { k: 'coach', users: 12, events: k(1260) }, { k: 'admin', users: 4, events: k(430) }],
      screens: screens.map(([path, mode, n, users]) => ({ k: path, mode, n: k(n), users })),
      clicks: clicks.map(([label, path, n, users]) => ({ k: label, path, n: k(n), users })),
      rage: [{ k: 'Reservar', path: '/classes', n: k(23), users: 11 }, { k: 'Guardar', path: '/prs', n: k(9), users: 5 }, { k: 'svg', path: '/calendar', n: k(6), users: 4 }],
      devices: [{ k: 'mobile', users: 109, installed: 62 }, { k: 'desktop', users: 21, installed: 2 }, { k: 'tablet', users: 4, installed: 1 }],
      hours: hoursShape.map((n, h) => ({ h, n: k(n * 6) })),
      weekdays: [38, 92, 96, 88, 94, 81, 57].map((n, d) => ({ d, n })),
      ages: [{ k: '-18', n: 3 }, { k: '18-24', n: 21 }, { k: '25-34', n: 58 }, { k: '35-44', n: 37 }, { k: '45-54', n: 12 }, { k: '55+', n: 4 }, { k: 'Sin dato', n: 19 }],
      sex: [{ k: 'm', n: 79 }, { k: 'f', n: 64 }, { k: 'Sin dato', n: 11 }],
      versions: [{ k: '0.8.0', users: 84 }, { k: '0.7.0', users: 12 }],
    },
  }
}
