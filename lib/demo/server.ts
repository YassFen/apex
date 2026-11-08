// DEMO MODE — per-visitor in-memory stores on the server.
import { todayISO } from '@/lib/utils/dates'
import { runQuery, runRpc, type QuerySpec, type Row, type Store } from './engine'
import { buildSeed } from './seed'
import { createDemoClient, DEMO_USER_ID } from './client'

const g = globalThis as unknown as { __apexDemo?: Map<string, { store: Store; day: string; at: number }> }
const sessions = (g.__apexDemo ??= new Map())

/** The visitor's store; a fresh copy of the seed per session (and per day, so dates stay current). */
export function demoStore(sessionId: string): Store {
  const day = todayISO()
  const s = sessions.get(sessionId)
  if (s && s.day === day) { s.at = Date.now(); return s.store }
  if (sessions.size > 300) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100)
    oldest.forEach(([k]) => sessions.delete(k))
  }
  const store = buildSeed(day)
  sessions.set(sessionId, { store, day, at: Date.now() })
  return store
}

export function runDemo(sessionId: string, spec: QuerySpec | { rpc: string; args: Row }) {
  const store = demoStore(sessionId)
  return 'rpc' in spec ? runRpc(store, spec.rpc, spec.args) : runQuery(store, spec, DEMO_USER_ID)
}

export function createDemoServerClient(sessionId: string) {
  return createDemoClient(async spec => runDemo(sessionId, spec))
}
