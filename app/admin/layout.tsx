import type { Metadata } from 'next'
import { requirePlatformAdmin } from '@/lib/utils/platform'
import { AdminChrome } from '@/components/admin/AdminChrome'

export const metadata: Metadata = { title: 'APEX · Panel', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requirePlatformAdmin()
  // A small count for the badges (013); before 013, fall back to the full usage report.
  const light = await supabase.rpc('admin_open_counts')
  let errors = 0, tickets = 0
  if (!light.error && light.data) { errors = Number((light.data as any).errors ?? 0); tickets = Number((light.data as any).tickets ?? 0) }
  else {
    const [{ data }, { count }] = await Promise.all([
      supabase.rpc('admin_usage', { p_days: 1 }),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ])
    errors = (data as any)?.totals?.open_errors ?? 0; tickets = count ?? 0
  }
  return <AdminChrome name={profile.full_name} openErrors={errors} openTickets={tickets}>{children}</AdminChrome>
}
