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
  movements: ['movement_id'], boxes: ['box_id'], profiles: ['user_id', 'coach_id', 'created_by'],
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
      if (!('id' in base) && !['event_participants', 'event_results', 'wod_result_bumps'].includes(spec.table)) base.id = newId()
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
  if (fn === 'join_box_by_code') return { data: null, error: { message: 'En la demo no puedes unirte a otros boxes.' } }
  return { data: null, error: { message: `rpc ${fn} no disponible en la demo` } }
}
