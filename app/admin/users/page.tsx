import { requirePlatformAdmin } from '@/lib/utils/platform'
import { UsersView, type UserRow } from '@/components/admin/UsersView'

export default async function AdminUsers() {
  const { supabase } = await requirePlatformAdmin()
  const [{ data: profiles }, { data: members }, { data: boxes }, { data: seen }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, avatar_url, role, city, created_at').order('created_at', { ascending: false }).limit(2000),
    supabase.from('box_members').select('user_id, box_id, role, is_active'),
    supabase.from('boxes').select('id, name, owner_id'),
    supabase.rpc('admin_last_seen'),
  ])
  const boxName = new Map(((boxes ?? []) as any[]).map(b => [b.id as string, b.name as string]))
  const owners = new Set(((boxes ?? []) as any[]).map(b => b.owner_id as string))
  const lastSeen = new Map(((Array.isArray(seen) ? seen : []) as any[]).map(s => [s.user_id as string, s as { last_seen: string; events_30d: number }]))
  const byUser = new Map<string, { boxes: string[]; staff: boolean; admin: boolean }>()
  for (const m of (members ?? []) as any[]) {
    if (m.is_active === false) continue
    const u = byUser.get(m.user_id) ?? { boxes: [], staff: false, admin: false }
    u.boxes.push(boxName.get(m.box_id) ?? 'Box')
    if (m.role !== 'athlete') u.staff = true
    if (m.role === 'admin') u.admin = true
    byUser.set(m.user_id, u)
  }
  const rows: UserRow[] = ((profiles ?? []) as any[]).map(p => {
    const u = byUser.get(p.id)
    return {
      id: p.id, name: p.full_name ?? 'Sin nombre', email: p.email ?? '', avatar: p.avatar_url ?? null, city: p.city ?? null, createdAt: p.created_at,
      kind: owners.has(p.id) || u?.admin ? 'admin' : u?.staff ? 'coach' : 'athlete', boxes: u?.boxes ?? [],
      lastSeen: lastSeen.get(p.id)?.last_seen ?? null, events: Number(lastSeen.get(p.id)?.events_30d ?? 0),
    }
  })
  return <UsersView rows={rows} />
}
