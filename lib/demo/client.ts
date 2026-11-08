// DEMO MODE — a Supabase-shaped client backed by the in-memory demo engine.
// Server components run queries directly; the browser sends them to /demo/api so both
// sides share the same per-visitor store (what you save in the demo shows up after a refresh).
import type { Filter, QuerySpec, Row } from './engine'

export const DEMO_COOKIE = 'apex_demo'
export const DEMO_USER_ID = 'demo-user-martin'
export const DEMO_EMAIL = 'demo@apex.app'

type Exec = (spec: QuerySpec | { rpc: string; args: Row }) => Promise<{ data: any; error: any; count?: number | null }>

class DemoQuery implements PromiseLike<any> {
  private spec: QuerySpec
  constructor(private exec: Exec, table: string) {
    this.spec = { table, op: 'select', filters: [], orders: [] }
  }
  select(columns = '*', opts?: { count?: string; head?: boolean }) {
    if (this.spec.op === 'select') { this.spec.columns = columns; this.spec.count = !!opts?.count; this.spec.head = !!opts?.head }
    else { this.spec.returning = true; this.spec.columns = columns }
    return this
  }
  insert(values: Row | Row[]) { this.spec.op = 'insert'; this.spec.values = values; return this }
  upsert(values: Row | Row[], opts?: { onConflict?: string }) { this.spec.op = 'upsert'; this.spec.values = values; this.spec.onConflict = opts?.onConflict; return this }
  update(values: Row) { this.spec.op = 'update'; this.spec.values = values; return this }
  delete() { this.spec.op = 'delete'; return this }
  private f(op: Filter['op'], col: string, val: any) { this.spec.filters.push({ op, col, val }); return this }
  eq(c: string, v: any) { return this.f('eq', c, v) }
  neq(c: string, v: any) { return this.f('neq', c, v) }
  in(c: string, v: any[]) { return this.f('in', c, v) }
  gt(c: string, v: any) { return this.f('gt', c, v) }
  gte(c: string, v: any) { return this.f('gte', c, v) }
  lt(c: string, v: any) { return this.f('lt', c, v) }
  lte(c: string, v: any) { return this.f('lte', c, v) }
  is(c: string, v: any) { return this.f('is', c, v) }
  order(col: string, opts?: { ascending?: boolean }) { this.spec.orders.push({ col, asc: opts?.ascending !== false }); return this }
  limit(n: number) { this.spec.limit = n; return this }
  single() { this.spec.single = 'single'; return this }
  maybeSingle() { this.spec.single = 'maybe'; return this }
  then<A = any, B = never>(ok?: ((v: any) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.exec(this.spec).then(ok, bad)
  }
}

const noopChannel = () => {
  const ch: any = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} }
  return ch
}

export function createDemoClient(exec: Exec, onSignOut?: () => void): any {
  const user = { id: DEMO_USER_ID, email: DEMO_EMAIL }
  return {
    from: (table: string) => new DemoQuery(exec, table),
    rpc: (fn: string, args: Row = {}) => exec({ rpc: fn, args }),
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: { user } }, error: null }),
      signOut: async () => { onSignOut?.(); return { error: null } },
      updateUser: async () => ({ data: null, error: { message: 'En la demo no se puede cambiar la contraseña.' } }),
      signInWithPassword: async () => ({ data: null, error: { message: 'Estás en la demo. Sal de la demo para iniciar sesión.' } }),
      resend: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: { message: 'En la demo no se pueden subir imágenes.' } }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
    channel: noopChannel,
    removeChannel: () => {},
  }
}

/** Browser side: is this visitor in the demo? (cookie set by /demo) */
export function isDemoBrowser(): boolean {
  return typeof document !== 'undefined' && document.cookie.split('; ').some(c => c.startsWith(`${DEMO_COOKIE}=`))
}

export function createDemoBrowserClient() {
  return createDemoClient(
    async spec => {
      const res = await fetch('/demo/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(spec) })
      return res.ok ? res.json() : { data: null, error: { message: 'La demo no respondió. Recarga la página.' } }
    },
    () => { window.location.href = '/demo/exit' },
  )
}
