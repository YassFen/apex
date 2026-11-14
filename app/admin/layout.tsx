import type { Metadata } from 'next'
import { requirePlatformAdmin } from '@/lib/utils/platform'
import { AdminChrome } from '@/components/admin/AdminChrome'

export const metadata: Metadata = { title: 'APEX · Panel', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requirePlatformAdmin()
  const { data } = await supabase.rpc('admin_usage', { p_days: 1 })
  return <AdminChrome name={profile.full_name} openErrors={(data as any)?.totals?.open_errors ?? 0}>{children}</AdminChrome>
}
