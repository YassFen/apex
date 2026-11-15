import { requirePlatformAdmin } from '@/lib/utils/platform'
import type { ErrorGroup } from '@/lib/utils/platform-shared'
import { ErrorsView } from '@/components/admin/ErrorsView'
import { PageTitle } from '@/components/admin/AdminChrome'
import { NoData } from '@/components/admin/UsageViews'

export default async function AdminErrors() {
  const { supabase, userId } = await requirePlatformAdmin()
  const { data, error } = await supabase.rpc('admin_errors', { p_days: 14 })
  // A failed read must not look like "no errors".
  if (error) return <><PageTitle title="Errores" /><NoData /></>
  return <ErrorsView groups={(Array.isArray(data) ? data : []) as ErrorGroup[]} me={userId} />
}
