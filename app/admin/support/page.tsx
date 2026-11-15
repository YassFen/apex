import { requirePlatformAdmin } from '@/lib/utils/platform'
import { SupportInbox, type Ticket } from '@/components/admin/SupportInbox'
import { PageTitle } from '@/components/admin/AdminChrome'
import { NoData } from '@/components/admin/UsageViews'

export default async function AdminSupport() {
  const { supabase, userId } = await requirePlatformAdmin()
  const { data, error } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(120)
  if (error) return <><PageTitle title="Soporte" /><NoData /></>
  const rows = (data ?? []) as any[]
  const ids = [...new Set(rows.map(r => r.user_id as string))]
  const boxIds = [...new Set(rows.map(r => r.box_id).filter(Boolean) as string[])]
  const [{ data: people }, { data: boxes }] = await Promise.all([
    ids.length ? supabase.from('profiles').select('id, full_name, email, role').in('id', ids) : Promise.resolve({ data: [] }),
    boxIds.length ? supabase.from('boxes').select('id, name').in('id', boxIds) : Promise.resolve({ data: [] }),
  ])
  const who = new Map(((people ?? []) as any[]).map(p => [p.id as string, p]))
  const boxName = new Map(((boxes ?? []) as any[]).map(b => [b.id as string, b.name as string]))
  const tickets: Ticket[] = rows.map(r => ({
    ...r, name: who.get(r.user_id)?.full_name ?? 'Persona', email: who.get(r.user_id)?.email ?? '', box: r.box_id ? boxName.get(r.box_id) ?? null : null,
  }))
  return <SupportInbox tickets={tickets} me={userId} />
}
