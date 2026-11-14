import { requirePlatformAdmin, loadUsage } from '@/lib/utils/platform'
import { UsageView, NoData } from '@/components/admin/UsageViews'
import { PageTitle } from '@/components/admin/AdminChrome'

export default async function AdminUsage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const sp = await searchParams
  const { supabase } = await requirePlatformAdmin()
  const days = [7, 30, 90].includes(Number(sp.d)) ? Number(sp.d) : 30
  const u = await loadUsage(supabase, days)
  if (!u) return <><PageTitle title="Uso" /><NoData /></>
  return <UsageView u={u} />
}
