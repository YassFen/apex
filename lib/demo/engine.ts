// DEMO MODE — delete the whole lib/demo folder (and app/demo) to remove it.
// A tiny in-memory stand-in for the parts of the Supabase/PostgREST API the app uses:
// select with embedded relations, eq/neq/in/gt/gte/lt/lte/is filters, order, limit,
// single/maybeSingle, count, insert/update/upsert/delete and a couple of RPCs.

export type Row = Record<string, any>
export type Store = Record<string, Row[]>

export interface Filter { op: 'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'is'; col: string; val: any }
export interface QuerySpec {
  table: string
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  columns?: string
  count?: boolean
  head?: boolean
  filters: Filter[]
  orders: { col: string; asc: boolean }[]
  limit?: number
  single?: 'single' | 'maybe'
  values?: Row | Row[]
  onConflict?: string
  returning?: boolean
}

// Many-to-one embeds: the column on the base row that points at the embedded table's id.
const ONE: Record<string, string[]> = {
  movements: ['movement_id'], boxes: ['box_id'], profiles: ['user_id', 'coach_id', 'created_by', 'author_id'],
  daily_wods: ['daily_wod_id'], events: ['event_id'],
}
// One-to-many embeds: the column on the embedded table that points back at the base row.
const MANY_FK: Record<string, string> = {
  events: 'event_id', daily_wods: 'daily_wod_id', wod_results: 'result_id', boxes: 'box_id',
}

/** Split "a, b(c, d(e)), f" at top-level commas. */
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

function project(store: Store, table: string, row: Row, columns: string): Row {
  const parts = splitTop(columns || '*')
  let out: Row = {}
  for (const p of parts) {
    const m = /^(?:(\w+):)?(\w+)\(([\s\S]*)\)$/.exec(p)
    if (m) {
      const [, alias, embed, inner] = m
      const key = alias ?? embed
      const oneCol = (ONE[embed] ?? []).find(c => c in row)
      if (oneCol) {
        const target = (store[embed] ?? []).find(r => r.id === row[oneCol])
        out[key] = target ? project(store, embed, target, inner) : null
      } else {
        const fk = MANY_FK[table] ?? `${table.replace(/s$/, '')}_id`
        out[key] = (store[embed] ?? []).filter(r => r[fk] === row.id).map(r => project(store, embed, r, inner))
      }
    } else if (p === '*') {
      out = { ...row, ...out }
    } else {
      const name = p.split(':').pop()!.trim()
      out[name] = row[name] ?? null
    }
  }
  return out
}

const cmp = (a: any, b: any) => (a === b ? 0 : a === null || a === undefined ? -1 : b === null || b === undefined ? 1 : a < b ? -1 : 1)

function matches(row: Row, f: Filter): boolean {
  const v = row[f.col]
  switch (f.op) {
    case 'eq': return v === f.val || (typeof v === 'number' && Number(f.val) === v) || String(v) === String(f.val)
    case 'neq': return String(v) !== String(f.val)
    case 'in': return (f.val as any[]).map(String).includes(String(v))
    case 'gt': return v !== null && v !== undefined && v > f.val
    case 'gte': return v !== null && v !== undefined && v >= f.val
    case 'lt': return v !== null && v !== undefined && v < f.val
    case 'lte': return v !== null && v !== undefined && v <= f.val
    case 'is': return f.val === null ? v === null || v === undefined : v === f.val
  }
}

let seq = 0
export const newId = () => `demo-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function runQuery(store: Store, spec: QuerySpec, userId: string): { data: any; error: any; count?: number | null } {
  const rows = (store[spec.table] ??= [])
  const pass = (r: Row) => spec.filters.every(f => matches(r, f))

  if (spec.op === 'insert' || spec.op === 'upsert') {
    const vals = Array.isArray(spec.values) ? spec.values : [spec.values ?? {}]
    const keys = spec.onConflict?.split(',').map(s => s.trim())
    const written: Row[] = []
    for (const v of vals) {
      const base: Row = { user_id: v.user_id ?? userId, created_at: new Date().toISOString(), recorded_at: new Date().toISOString(), ...v }
      if (!('id' in base) && !['event_participants', 'event_results', 'wod_result_bumps', 'announcement_reads', 'member_files', 'platform_admins'].includes(spec.table)) base.id = newId()
      const existing = spec.op === 'upsert' && keys ? rows.find(r => keys.every(k => String(r[k]) === String(base[k]))) : undefined
      if (existing) { Object.assign(existing, v); written.push(existing) } else { rows.push(base); written.push(base) }
      if (spec.table === 'pr_records') recalcPr(store, base)
    }
    return finish(store, spec, written)
  }
  if (spec.op === 'update') {
    const hit = rows.filter(pass)
    hit.forEach(r => Object.assign(r, spec.values))
    return finish(store, spec, hit)
  }
  if (spec.op === 'delete') {
    const hit = rows.filter(pass)
    store[spec.table] = rows.filter(r => !hit.includes(r))
    if (spec.table === 'events') for (const t of ['event_workouts', 'event_participants', 'event_results']) store[t] = (store[t] ?? []).filter(r => !hit.some(h => h.id === r.event_id))
    if (spec.table === 'daily_wods') store.wod_results = (store.wod_results ?? []).filter(r => !hit.some(h => h.id === r.daily_wod_id))
    return finish(store, spec, hit)
  }

  let out = rows.filter(pass)
  for (const o of [...spec.orders].reverse()) out = [...out].sort((a, b) => (o.asc ? 1 : -1) * cmp(a[o.col], b[o.col]))
  const count = out.length
  if (spec.limit !== undefined) out = out.slice(0, spec.limit)
  if (spec.head) return { data: null, error: null, count }
  return finish(store, spec, out, spec.count ? count : null)
}

function finish(store: Store, spec: QuerySpec, rows: Row[], count: number | null = null) {
  const isWrite = spec.op !== 'select'
  if (isWrite && !spec.returning) return { data: null, error: null, count }
  const data = rows.map(r => project(store, spec.table, r, spec.columns ?? '*'))
  if (spec.single === 'single') return data.length === 1 ? { data: data[0], error: null, count } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count }
  if (spec.single === 'maybe') return { data: data[0] ?? null, error: null, count }
  return { data, error: null, count }
}

/** Mirror of the recalc_pr trigger: best value per user+movement+metric is the PR. */
function recalcPr(store: Store, row: Row) {
  const same = (store.pr_records ?? []).filter(r => r.user_id === row.user_id && r.movement_id === row.movement_id && r.metric === row.metric)
  const best = same.reduce<Row | null>((b, r) => (!b ? r : row.metric === 'time' ? (r.value_lb < b.value_lb ? r : b) : (r.value_lb > b.value_lb ? r : b)), null)
  same.forEach(r => { r.is_pr = r === best })
}

export function runRpc(store: Store, fn: string, args: Row): { data: any; error: any } {
  if (fn === 'box_wod_days') {
    const mine = new Set((store.box_members ?? []).filter(m => m.user_id === store.__me?.[0]?.id).map(m => m.box_id))
    const days = (store.daily_wods ?? []).filter(d => d.is_live && mine.has(d.box_id) && d.scheduled_for >= args.p_from && d.scheduled_for <= args.p_to)
    return { data: [...new Map(days.map(d => [`${d.box_id}|${d.scheduled_for}`, { box_id: d.box_id, scheduled_for: d.scheduled_for }])).values()], error: null }
  }
  const me: string = store.__me?.[0]?.id
  const current = (box: string, user: string) => (store.memberships ?? []).filter(m => m.box_id === box && m.user_id === user && m.status !== 'cancelled').sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
  const spendClass = (box: string, user: string, n: number) => { const m = current(box, user); if (m && m.kind === 'classes') m.classes_used = Math.max(0, m.classes_used + n) }
  if (fn === 'book_class') {
    const user = args.p_user ?? me
    const slot = (store.class_slots ?? []).find(s => s.id === args.p_slot && s.is_active)
    if (!slot) return { data: { ok: false, reason: 'no_class' }, error: null }
    const ov = (store.class_overrides ?? []).find(o => o.slot_id === slot.id && o.class_date === args.p_date)
    if (ov?.cancelled) return { data: { ok: false, reason: 'cancelled' }, error: null }
    const list = (store.class_bookings ??= [])
    const prev = list.find(b => b.slot_id === slot.id && b.class_date === args.p_date && b.user_id === user)
    if (prev && prev.status !== 'cancelled') return { data: { ok: true, status: prev.status }, error: null }
    const m = current(slot.box_id, user)
    if (m) {
      if (m.status === 'frozen') return { data: { ok: false, reason: 'frozen' }, error: null }
      if (m.ends_on < args.p_date) return { data: { ok: false, reason: 'expired' }, error: null }
      if (m.kind === 'classes' && m.classes_used >= (m.classes_total ?? 0)) return { data: { ok: false, reason: 'no_classes' }, error: null }
    }
    const taken = list.filter(b => b.slot_id === slot.id && b.class_date === args.p_date && (b.status === 'booked' || b.status === 'attended')).length
    const status = taken >= (ov?.capacity ?? slot.capacity) ? 'waitlist' : 'booked'
    if (prev) { prev.status = status; prev.created_at = new Date().toISOString() }
    else list.push({ id: newId(), slot_id: slot.id, box_id: slot.box_id, class_date: args.p_date, user_id: user, status, created_at: new Date().toISOString() })
    if (status === 'booked') spendClass(slot.box_id, user, 1)
    return { data: { ok: true, status }, error: null }
  }
  if (fn === 'cancel_booking') {
    const user = args.p_user ?? me
    const list = store.class_bookings ?? []
    const b = list.find(x => x.slot_id === args.p_slot && x.class_date === args.p_date && x.user_id === user)
    if (!b) return { data: { ok: false, reason: 'no_booking' }, error: null }
    const had = b.status === 'booked' || b.status === 'attended'
    b.status = 'cancelled'
    if (had) {
      spendClass(b.box_id, user, -1)
      const next = list.filter(x => x.slot_id === args.p_slot && x.class_date === args.p_date && x.status === 'waitlist').sort((x, y) => (x.created_at < y.created_at ? -1 : 1))[0]
      if (next) { next.status = 'booked'; spendClass(next.box_id, next.user_id, 1) }
    }
    return { data: { ok: true }, error: null }
  }
  if (fn === 'mark_attendance') {
    const b = (store.class_bookings ?? []).find(x => x.id === args.p_booking)
    if (b) b.status = args.p_status
    return { data: { ok: !!b }, error: null }
  }
  if (fn === 'set_member_role') {
    const bm = (store.box_members ?? []).find(m => m.box_id === args.p_box && m.user_id === args.p_user)
    if (bm) bm.role = args.p_role
    const pr = (store.profiles ?? []).find(p => p.id === args.p_user)
    if (pr && args.p_role !== 'athlete' && pr.role === 'athlete') pr.role = 'coach'
    return { data: { ok: true }, error: null }
  }
  if (fn === 'join_box_by_code') return { data: null, error: { message: 'En la demo no puedes unirte a otros boxes.' } }
  return { data: null, error: { message: `rpc ${fn} no disponible en la demo` } }
}
