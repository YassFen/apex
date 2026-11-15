// Product analytics and error reporting, first-party (rows in our own Supabase, no third party).
// What is recorded: screens opened, buttons pressed (their visible label), repeated angry taps
// and errors. Never what a person types, never page content. People can turn usage data off in
// Settings → Privacy; errors are always reported so they can be fixed.
import { createClient } from '@/lib/supabase/client'
import { isDemoBrowser } from '@/lib/demo/client'
import { APP_VERSION } from '@/lib/constants/version'

export const TELEMETRY_KEY = 'apex.telemetry'
type Kind = 'view' | 'click' | 'rage' | 'action'
interface Ctx { userId: string; mode: string; boxId: string | null }

let ctx: Ctx | null = null
let events: Record<string, unknown>[] = []
let errors: Record<string, unknown>[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let sessionId = ''
let disabledTables = false
let noTrailColumn = false
// The last steps of this visit (screens and presses), attached to errors and support requests.
const trail: { t: string; kind: string; label: string }[] = []
const recentErrors: string[] = []
const seenErrors = new Map<string, number>()

export function usageEnabled(): boolean {
  try { return localStorage.getItem(TELEMETRY_KEY) !== '0' } catch { return true }
}
export function setUsageEnabled(on: boolean) {
  try { localStorage.setItem(TELEMETRY_KEY, on ? '1' : '0') } catch {}
}

export function setTelemetryContext(next: Ctx) { ctx = next }

function session(): string {
  if (sessionId) return sessionId
  try {
    sessionId = sessionStorage.getItem('apex.sid') ?? ''
    if (!sessionId) { sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; sessionStorage.setItem('apex.sid', sessionId) }
  } catch { sessionId = Math.random().toString(36).slice(2, 12) }
  return sessionId
}

function device(): 'mobile' | 'tablet' | 'desktop' {
  const w = window.innerWidth
  return w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop'
}
const installed = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

/** /manage/members/3f2a… → /manage/members/:id, so screens group together and no id is stored. */
export function cleanPath(path: string): string {
  return path.split('?')[0].split('/').map(p => (/^[0-9a-f-]{16,}$/i.test(p) || /^\d+$/.test(p) || /^(demo|ev|wod)-/.test(p) ? ':id' : p)).join('/').slice(0, 120) || '/'
}

function schedule() {
  if (timer) return
  timer = setTimeout(() => { timer = null; void flush() }, 8000)
}

export async function flush() {
  if (!ctx || disabledTables || isDemoBrowser()) { events = []; errors = []; return }
  const ev = events, er = errors
  events = []; errors = []
  if (!ev.length && !er.length) return
  try {
    const supabase = createClient()
    const [a, b] = await Promise.all([
      ev.length ? supabase.from('app_events').insert(ev) : Promise.resolve({ error: null }),
      er.length ? supabase.from('app_errors').insert(er) : Promise.resolve({ error: null }),
    ])
    // Migration 011 not applied yet: stop trying for this visit.
    const missing = (e: { code?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205')
    // Migration 012 adds the trail column; without it, send the errors again without it.
    if (b.error && (b.error as { code?: string }).code === 'PGRST204' && er.length) {
      noTrailColumn = true
      await supabase.from('app_errors').insert(er.map(({ trail: _t, ...rest }) => rest))
    }
    if (missing(a.error) || missing(b.error)) disabledTables = true
  } catch { /* telemetry must never break the app */ }
}

export function track(kind: Kind, label?: string | null, path: string = location.pathname) {
  remember(kind, kind === 'view' ? cleanPath(path) : label ?? '')
  if (!ctx || disabledTables || !usageEnabled()) return
  events.push({
    user_id: ctx.userId, session_id: session(), kind, path: cleanPath(path), label: label ? label.slice(0, 60) : null,
    mode: ctx.mode, box_id: ctx.boxId, device: device(), installed: installed(), version: APP_VERSION,
  })
  if (events.length >= 25) void flush(); else schedule()
}

function remember(kind: string, label: string) {
  trail.push({ t: new Date().toISOString().slice(11, 19), kind, label: label.slice(0, 60) })
  if (trail.length > 15) trail.shift()
}

/** What the app knew when the person asked for help. No typed values, no page content. */
export function supportContext(): Record<string, unknown> {
  const w = typeof window !== 'undefined' ? window : null
  return {
    version: APP_VERSION, path: w ? cleanPath(location.pathname) : null, mode: ctx?.mode ?? null,
    device: w ? device() : null, installed: w ? installed() : null, screen: w ? `${w.innerWidth}x${w.innerHeight}` : null,
    online: w ? navigator.onLine : null, user_agent: w ? navigator.userAgent.slice(0, 300) : null,
    errors: recentErrors.slice(-5), trail: trail.slice(-12),
  }
}

function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export function reportError(kind: 'error' | 'promise' | 'render' | 'api', message: string, stack?: string | null) {
  if (!ctx || disabledTables) return
  const msg = (message || 'Error desconocido').slice(0, 500)
  // Noise from browser extensions and cancelled navigations isn't ours to fix.
  if (/ResizeObserver loop|Script error\.?$|chrome-extension|moz-extension|AbortError|NEXT_REDIRECT|Load failed$/i.test(msg + (stack ?? ''))) return
  const top = (stack ?? '').split('\n').find(l => /\bat\b|@/.test(l))?.replace(/\?[^:)]*/g, '').replace(/:\d+:\d+/g, '').trim() ?? ''
  const fingerprint = hash(`${kind}|${msg.replace(/\d+/g, 'N').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, 'ID')}|${top}`)
  // The same error at most 3 times per visit, so a loop can't flood the log.
  const n = seenErrors.get(fingerprint) ?? 0
  if (n >= 3) return
  seenErrors.set(fingerprint, n + 1)
  recentErrors.push(msg.slice(0, 160)); if (recentErrors.length > 10) recentErrors.shift()
  remember('error', msg)
  errors.push({
    user_id: ctx.userId, fingerprint, kind, message: msg, stack: stack ? stack.slice(0, 4000) : null, path: cleanPath(location.pathname),
    mode: ctx.mode, device: device(), user_agent: navigator.userAgent.slice(0, 300), version: APP_VERSION,
    ...(noTrailColumn ? {} : { trail: trail.slice(-10) }),
  })
  schedule()
}

/** Visible name of what was pressed: explicit data-track, aria-label, or its short text. Never form values. */
export function labelOf(el: Element): string | null {
  const target = el.closest('[data-track], a, button, [role="button"], [role="tab"], [role="switch"], summary')
  if (!target || target.closest('[data-track-off]')) return null
  const explicit = target.getAttribute('data-track') ?? target.getAttribute('aria-label') ?? target.getAttribute('title')
  const text = (explicit ?? (target as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return target.tagName === 'A' ? `→ ${cleanPath((target as HTMLAnchorElement).pathname ?? '')}` : null
  // Digits are dropped so names, weights and times shown on a button don't end up in the stats.
  return text.replace(/\d+([.,:]\d+)*/g, '#').slice(0, 60)
}
