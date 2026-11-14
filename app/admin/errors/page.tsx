import { requirePlatformAdmin } from '@/lib/utils/platform'
import type { ErrorGroup } from '@/lib/utils/platform-shared'
import { ErrorsView } from '@/components/admin/ErrorsView'

export default async function AdminErrors() {
  const { supabase, userId } = await requirePlatformAdmin()
  const { data } = await supabase.rpc('admin_errors', { p_days: 14 })
  return <ErrorsView groups={(Array.isArray(data) ? data : []) as ErrorGroup[]} me={userId} />
}
