import { requirePlatformAdmin, loadUsage } from '@/lib/utils/platform'
import { OverviewView, NoData } from '@/components/admin/UsageViews'
import { PageTitle } from '@/components/admin/AdminChrome'

export default async function AdminHome() {
  const { supabase } = await requirePlatformAdmin()
  const u = await loadUsage(supabase, 30)
  if (!u) return <><PageTitle title="Resumen" /><NoData /></>
  return <OverviewView u={u} />
}
