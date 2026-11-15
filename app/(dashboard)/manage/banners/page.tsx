import { requireAdminBox } from '@/lib/utils/admin-box'
import { Topbar } from '@/components/layout/Topbar'
import { BannersManager } from '@/components/banners/BannersManager'
import { BoxTabs, MigrationNotice } from '@/components/manage/ui'
import { todayISO } from '@/lib/utils/dates'
import { isMissingTable } from '@/lib/utils/errors'
import type { Banner } from '@/lib/utils/banners'

export default async function ManageBanners({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const sp = await searchParams
  const { supabase, userId, profile, box, boxes } = await requireAdminBox(sp.box)
  const { data, error } = await supabase.from('banners').select('*').eq('box_id', box.id).order('position')
  return (
    <>
      <Topbar title="Banners" profile={profile} backHref={null} />
      <div className="p-4 lg:p-6 grid grid-cols-1 gap-4 max-w-2xl w-full">
        <BoxTabs boxes={boxes} current={box.id} base="/manage/banners" />
        {isMissingTable(error) && <MigrationNotice n="012" />}
        <BannersManager boxId={box.id} me={userId} today={todayISO()} banners={(data ?? []) as Banner[]} missing={isMissingTable(error)} />
      </div>
    </>
  )
}
