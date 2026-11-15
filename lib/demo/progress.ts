// DEMO MODE — the XP / league / squad RPCs of migration 014, computed on the in-memory store.
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { streakOf } from '@/lib/utils/progress'
import type { Row, Store } from './engine'

const TRAINING = new Set(['wod', 'class', 'pr', 'lift', 'benchmark', 'log'])
const day = (ts: string | undefined) => (ts ? String(ts).slice(0, 10) : todayISO())
const mondayOf = (d: string) => { const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; return addDaysISO(d, -wd) }

/** Builds the ledger from the seed the first time (like the backfill in 014), plus squads and a challenge. */
function ledger(store: Store, me: string): Row[] {
  if (store.xp_events) return store.xp_events
  const ev: Row[] = []
  const push = (user_id: string, kind: string, points: number, ref: string, d: string) => {
    if (!ev.some(e => e.user_id === user_id && e.kind === kind && e.ref === ref)) ev.push({ id: ev.length + 1, user_id, kind, points, ref, day: d, created_at: `${d}T12:00:00.000Z` })
  }
  const wods = new Map((store.daily_wods ?? []).map(w => [w.id, w]))
  for (const r of store.wod_results ?? []) push(r.user_id, 'wod', 25, `wod:${r.daily_wod_id}`, wods.get(r.daily_wod_id)?.scheduled_for ?? day(r.recorded_at))
  for (const p of store.pr_records ?? []) push(p.user_id, p.is_pr ? 'pr' : 'lift', p.is_pr ? 40 : 10, `pr:${p.id}`, day(p.recorded_at))
  for (const b of store.class_bookings ?? []) if (b.status === 'attended') push(b.user_id, 'class', 15, `class:${b.id}`, b.class_date)
  for (const b of store.benchmarks ?? []) push(b.user_id, 'benchmark', 20, `bench:${b.id}`, day(b.recorded_at))
  store.xp_events = ev

  const today = todayISO()
  const athletes = (store.profiles ?? []).filter(p => p.id !== me).slice(0, 3)
  store.squads = [
    { id: 'sq-duo', name: 'Los de las 7', size: 2, invite_code: 'DUO7AM', created_by: me, created_at: `${addDaysISO(today, -20)}T10:00:00Z` },
    { id: 'sq-four', name: 'Cuarteto Cordillera', size: 4, invite_code: 'CORD44', created_by: athletes[0]?.id ?? me, created_at: `${addDaysISO(today, -9)}T10:00:00Z` },
  ]
  store.squad_members = [
    { squad_id: 'sq-duo', user_id: me, joined_at: `${addDaysISO(today, -20)}T10:00:00Z` },
    ...(athletes[0] ? [{ squad_id: 'sq-duo', user_id: athletes[0].id, joined_at: `${addDaysISO(today, -20)}T11:00:00Z` }] : []),
    { squad_id: 'sq-four', user_id: me, joined_at: `${addDaysISO(today, -9)}T10:00:00Z` },
    ...athletes.slice(1, 3).map((a, i) => ({ squad_id: 'sq-four', user_id: a.id, joined_at: `${addDaysISO(today, -9)}T1${i + 1}:00:00Z` })),
  ]
  store.squad_days = []
  const mon = mondayOf(today)
  store.app_challenges ??= [
    { id: 'ac-week', title: 'Semana constante', description: 'Entrena 4 días esta semana.', metric: 'days', target: 4, xp_reward: 100, starts_on: mon, ends_on: addDaysISO(mon, 6), created_at: `${mon}T00:00:00Z` },
    { id: 'ac-prs', title: 'Mes de récords', description: 'Rompe 3 récords personales este mes.', metric: 'prs', target: 3, xp_reward: 250, starts_on: `${today.slice(0, 8)}01`, ends_on: addDaysISO(`${today.slice(0, 8)}01`, 30), created_at: `${today}T00:00:00Z` },
  ]
  // Squad days from the members' history
  for (const s of store.squads) recomputeSquad(store, s)
  return ev
}

function trainedOn(store: Store, user: string, d: string) {
  return (store.xp_events ?? []).some(e => e.user_id === user && e.day === d && TRAINING.has(e.kind))
}

function recomputeSquad(store: Store, s: Row) {
  const members = (store.squad_members ?? []).filter(m => m.squad_id === s.id)
  if (members.length < s.size) return
  const days = new Set((store.xp_events ?? []).filter(e => e.user_id === members[0].user_id && TRAINING.has(e.kind)).map(e => e.day))
  for (const d of days) {
    if (members.every(m => trainedOn(store, m.user_id, d)) && !(store.squad_days ?? []).some(x => x.squad_id === s.id && x.day === d)) {
      (store.squad_days ??= []).push({ squad_id: s.id, day: d })
    }
  }
}

function progressOf(store: Store, user: string, metric: string, from: string, to: string) {
  const ev = (store.xp_events ?? []).filter(e => e.user_id === user && e.day >= from && e.day <= to)
  if (metric === 'days') return new Set(ev.filter(e => TRAINING.has(e.kind)).map(e => e.day)).size
  if (metric === 'wods') return ev.filter(e => e.kind === 'wod').length
  if (metric === 'classes') return ev.filter(e => e.kind === 'class').length
  if (metric === 'prs') return ev.filter(e => e.kind === 'pr').length
  return ev.filter(e => e.kind !== 'challenge').reduce((a, e) => a + e.points, 0)
}

/** Mirror of award_xp(): called after a demo insert into an activity table. */
export function demoAward(store: Store, table: string, row: Row) {
  if (!store.xp_events) return
  const today = todayISO()
  let kind = '', points = 0, ref = '', d = today
  if (table === 'wod_results') { kind = 'wod'; points = 25; ref = `wod:${row.daily_wod_id}` }
  else if (table === 'pr_records') { kind = row.is_pr ? 'pr' : 'lift'; points = row.is_pr ? 40 : 10; ref = `pr:${row.id}` }
  else if (table === 'benchmarks') { kind = 'benchmark'; points = 20; ref = `bench:${row.id}` }
  else if (table === 'personal_logs') { kind = 'log'; points = 5; ref = `log:${row.logged_on ?? today}` }
  else return
  const user = row.user_id
  const ev = store.xp_events
  if (ev.some(e => e.user_id === user && e.kind === kind && e.ref === ref)) return
  const cap = kind === 'pr' || kind === 'lift' ? 3 : kind === 'benchmark' ? 2 : null
  if (cap && ev.filter(e => e.user_id === user && e.kind === kind && e.day === d).length >= cap) return
  const add = (k: string, p: number, r: string) => { if (!ev.some(e => e.user_id === user && e.kind === k && e.ref === r)) ev.push({ id: ev.length + 1, user_id: user, kind: k, points: p, ref: r, day: d, created_at: new Date().toISOString() }) }
  add(kind, points, ref)
  const st = streakOf(ev.filter(e => e.user_id === user && TRAINING.has(e.kind)).map(e => e.day), today)
  const bonus: Record<number, number> = { 3: 30, 7: 70, 14: 150, 30: 300, 60: 600, 100: 1000, 200: 1500, 365: 2000 }
  for (const m of [3, 7, 14, 30, 60, 100, 200, 365]) if (st.current >= m) add('streak', bonus[m], `streak:${m}:${st.start}`)
  for (const s of (store.squads ?? []).filter(s => (store.squad_members ?? []).some(m => m.squad_id === s.id && m.user_id === user))) {
    const members = (store.squad_members ?? []).filter(m => m.squad_id === s.id)
    if (members.length === s.size && !(store.squad_days ?? []).some(x => x.squad_id === s.id && x.day === d) && members.every(m => trainedOn(store, m.user_id, d))) {
      (store.squad_days ??= []).push({ squad_id: s.id, day: d })
      for (const m of members) if (!ev.some(e => e.user_id === m.user_id && e.kind === 'squad' && e.ref === `squad:${s.id}:${d}`)) ev.push({ id: ev.length + 1, user_id: m.user_id, kind: 'squad', points: 15, ref: `squad:${s.id}:${d}`, day: d, created_at: new Date().toISOString() })
    }
  }
  for (const c of store.app_challenges ?? []) if (d >= c.starts_on && d <= c.ends_on && progressOf(store, user, c.metric, c.starts_on, c.ends_on) >= c.target) add('challenge', c.xp_reward, `challenge:${c.id}`)
}

export function demoProgressRpc(store: Store, fn: string, args: Row, me: string): { data: any; error: any } | null {
  if (!['my_progress', 'xp_ranking', 'create_squad', 'join_squad', 'leave_squad', 'public_xp'].includes(fn)) return null
  const ev = ledger(store, me)
  const today = todayISO(), mon = mondayOf(today)
  const prof = (id: string) => (store.profiles ?? []).find(p => p.id === id)
  const sum = (rows: Row[]) => rows.reduce((a, e) => a + e.points, 0)

  if (fn === 'my_progress') {
    const mine = ev.filter(e => e.user_id === me)
    const tdays = mine.filter(e => TRAINING.has(e.kind)).map(e => e.day)
    const st = streakOf(tdays, today)
    const squads = (store.squads ?? []).filter(s => (store.squad_members ?? []).some(m => m.squad_id === s.id && m.user_id === me)).map(s => {
      const sq = streakOf((store.squad_days ?? []).filter(x => x.squad_id === s.id).map(x => x.day), today)
      return {
        id: s.id, name: s.name, size: s.size, code: s.invite_code, streak: sq.current, best: sq.best,
        members: (store.squad_members ?? []).filter(m => m.squad_id === s.id).map(m => ({ id: m.user_id, name: prof(m.user_id)?.full_name ?? 'Atleta', avatar: prof(m.user_id)?.avatar_url ?? null, trained_today: trainedOn(store, m.user_id, today) })),
      }
    })
    return { error: null, data: {
      total: sum(mine), week: sum(mine.filter(e => e.day >= mon)), today: sum(mine.filter(e => e.day === today)),
      trained_today: tdays.includes(today), streak: st.current, best_streak: st.best, last_day: tdays.sort().at(-1) ?? null,
      public: prof(me)?.league_public ?? true,
      recent: [...mine].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 20).map(e => ({ kind: e.kind, points: e.points, day: e.day, created_at: e.created_at })),
      days: [...new Set(tdays.filter(d => d > addDaysISO(today, -35)))].sort(), squads,
      challenges: (store.app_challenges ?? []).filter(c => c.ends_on >= addDaysISO(today, -7) && c.starts_on <= addDaysISO(today, 7)).map(c => ({
        id: c.id, title: c.title, description: c.description, metric: c.metric, target: c.target, reward: c.xp_reward, starts_on: c.starts_on, ends_on: c.ends_on,
        progress: progressOf(store, me, c.metric, c.starts_on, c.ends_on), done: ev.some(e => e.user_id === me && e.kind === 'challenge' && e.ref === `challenge:${c.id}`),
      })),
    } }
  }
  if (fn === 'xp_ranking') {
    const from = args.p_period === 'week' ? mon : '2000-01-01'
    let people = (store.profiles ?? []).map(p => p.id)
    if (args.p_scope === 'box') people = [...new Set([...(store.box_members ?? []).filter(m => m.box_id === args.p_id && m.is_active !== false).map(m => m.user_id), ...(store.boxes ?? []).filter(b => b.id === args.p_id).map(b => b.owner_id)])]
    if (args.p_scope === 'squad') people = (store.squad_members ?? []).filter(m => m.squad_id === args.p_id).map(m => m.user_id)
    const rows = people.map(id => prof(id)).filter(p => p && (p.league_public !== false || p.id === me)).map(p => {
      const e = ev.filter(x => x.user_id === p!.id)
      return { user_id: p!.id, full_name: p!.full_name, avatar_url: p!.avatar_url ?? null, xp: sum(e.filter(x => x.day >= from)), total: sum(e) }
    }).filter(r => r.user_id === me || r.xp > 0).sort((a, b) => b.xp - a.xp || b.total - a.total).slice(0, 50)
    return { data: rows, error: null }
  }
  if (fn === 'public_xp') return { data: sum(ev.filter(e => e.user_id === args.p_user)), error: null }
  const mineCount = (store.squad_members ?? []).filter(m => m.user_id === me).length
  if (fn === 'create_squad') {
    if (![2, 4].includes(Number(args.p_size))) return { data: { ok: false, reason: 'bad_size' }, error: null }
    const name = String(args.p_name ?? '').trim()
    if (!name || name.length > 40) return { data: { ok: false, reason: 'bad_name' }, error: null }
    if (mineCount >= 3) return { data: { ok: false, reason: 'too_many' }, error: null }
    const id = `sq-${Date.now().toString(36)}`, code = Math.random().toString(36).slice(2, 8).toUpperCase()
    store.squads!.push({ id, name, size: Number(args.p_size), invite_code: code, created_by: me, created_at: new Date().toISOString() })
    store.squad_members!.push({ squad_id: id, user_id: me, joined_at: new Date().toISOString() })
    return { data: { ok: true, id, code }, error: null }
  }
  if (fn === 'join_squad') {
    const s = (store.squads ?? []).find(x => x.invite_code === String(args.p_code ?? '').trim().toUpperCase())
    if (!s) return { data: { ok: false, reason: 'no_squad' }, error: null }
    const members = (store.squad_members ?? []).filter(m => m.squad_id === s.id)
    if (members.some(m => m.user_id === me)) return { data: { ok: true, id: s.id, already: true }, error: null }
    if (members.length >= s.size) return { data: { ok: false, reason: 'full' }, error: null }
    if (mineCount >= 3) return { data: { ok: false, reason: 'too_many' }, error: null }
    store.squad_members!.push({ squad_id: s.id, user_id: me, joined_at: new Date().toISOString() })
    return { data: { ok: true, id: s.id }, error: null }
  }
  if (fn === 'leave_squad') {
    store.squad_members = (store.squad_members ?? []).filter(m => !(m.squad_id === args.p_squad && m.user_id === me))
    if (!store.squad_members.some(m => m.squad_id === args.p_squad)) store.squads = (store.squads ?? []).filter(s => s.id !== args.p_squad)
    return { data: { ok: true }, error: null }
  }
  return null
}
