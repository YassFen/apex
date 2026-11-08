// In-app notices, computed from data on each page load (no table): event countdowns,
// tomorrow's WOD with its class time, today's WOD still to log, new box events.
// Ids change at each threshold (7/3/1/0 days) so the same event can notify again.
import { addDaysISO, daysBetween } from '@/lib/utils/dates'

export type NoticeKind = 'event' | 'wod' | 'log' | 'box_event'

export interface Notice {
  id: string
  kind: NoticeKind
  title: string
  body: string
  href: string
  /** YYYY-MM-DD the notice is about, for sorting. */
  date: string
}

export const formatClassTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : null)

export interface NoticeInput {
  today: string
  myEvents: { id: string; name: string; startsOn: string }[]
  newBoxEvents: { id: string; name: string; startsOn: string; createdAt: string; boxName: string }[]
  wods: { id: string; date: string; title: string; classTime: string | null; boxName: string; visible: boolean; myResult: boolean }[]
}

export function buildNotices({ today, myEvents, newBoxEvents, wods }: NoticeInput): Notice[] {
  const out: Notice[] = []

  for (const e of myEvents) {
    const days = daysBetween(today, e.startsOn)
    if (days < 0 || days > 7) continue
    const bucket = days === 0 ? 0 : days === 1 ? 1 : days <= 3 ? 3 : 7
    out.push({
      id: `ev-${e.id}-${bucket}`, kind: 'event', date: e.startsOn, href: `/calendar/event/${e.id}`,
      title: days === 0 ? `Hoy compites: ${e.name}` : days === 1 ? `Mañana es ${e.name}` : `Faltan ${days} días para ${e.name}`,
      body: days === 0 ? 'Calienta bien y revisa tu plan de series.' : 'Revisa tu preparación y cómo partir las series.',
    })
  }

  for (const e of newBoxEvents) {
    out.push({
      id: `boxev-${e.id}`, kind: 'box_event', date: e.createdAt.slice(0, 10), href: `/calendar/event/${e.id}`,
      title: `Nuevo evento en ${e.boxName}`, body: `${e.name} · ${e.startsOn.split('-').reverse().slice(0, 2).join('/')}. ¿Te inscribes?`,
    })
  }

  const tomorrow = addDaysISO(today, 1)
  for (const w of wods.filter(w => w.date === tomorrow)) {
    const time = formatClassTime(w.classTime)
    out.push({
      id: `wod-${w.id}`, kind: 'wod', date: w.date, href: '/calendar',
      title: `Mañana hay WOD${time ? ` a las ${time}` : ''}`,
      body: w.visible ? `${w.title} · ${w.boxName}` : `${w.boxName} lo revela mañana.`,
    })
  }

  for (const w of wods.filter(w => w.date === today && w.visible && !w.myResult)) {
    const time = formatClassTime(w.classTime)
    out.push({
      id: `log-${w.id}`, kind: 'log', date: w.date, href: '/wod',
      title: `WOD de hoy${time ? ` · ${time}` : ''}: ${w.title}`,
      body: 'Cuando termines, registra tu resultado y mira el ranking.',
    })
  }

  return out.sort((a, b) => a.date.localeCompare(b.date))
}
