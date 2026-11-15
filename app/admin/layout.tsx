import type { Metadata } from 'next'
import { requirePlatformAdmin } from '@/lib/utils/platform'
import { AdminChrome } from '@/components/admin/AdminChrome'

export const metadata: Metadata = { title: 'APEX · Panel', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requirePlatformAdmin()
  const [{ data }, { count }] = await Promise.all([
    supabase.rpc('admin_usage', { p_days: 1 }),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ])
  return <AdminChrome name={profile.full_name} openErrors={(data as any)?.totals?.open_errors ?? 0} openTickets={count ?? 0}>{children}</AdminChrome>
}
