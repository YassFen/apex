import { requirePlatformAdmin } from '@/lib/utils/platform'
import { PageTitle } from '@/components/admin/AdminChrome'
import { BannersManager } from '@/components/banners/BannersManager'
import { todayISO } from '@/lib/utils/dates'
import { isMissingTable } from '@/lib/utils/errors'
import type { Banner } from '@/lib/utils/banners'

export default async function AdminBanners() {
  const { supabase, userId } = await requirePlatformAdmin()
  const { data, error } = await supabase.from('banners').select('*').is('box_id', null).order('position')
  return (
    <>
      <PageTitle title="Banners" sub="Mensajes de la aplicación para todos los boxes: novedades, mantenciones, funciones nuevas." />
      <div className="grid grid-cols-1 gap-4 max-w-2xl">
        <BannersManager boxId={null} me={userId} today={todayISO()} banners={(data ?? []) as Banner[]} missing={isMissingTable(error)} />
      </div>
    </>
  )
}
