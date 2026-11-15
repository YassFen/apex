import { requirePlatformAdmin } from '@/lib/utils/platform'
import { PageTitle } from '@/components/admin/AdminChrome'
import { AppChallengesManager, type AppChallenge } from '@/components/admin/AppChallengesManager'
import { todayISO } from '@/lib/utils/dates'
import { isMissingTable } from '@/lib/utils/errors'

export default async function AdminChallenges() {
  const { supabase } = await requirePlatformAdmin()
  const { data, error } = await supabase.from('app_challenges').select('*').order('starts_on', { ascending: false }).limit(60)
  return (
    <>
      <PageTitle title="Retos de APEX" sub="Retos para todos los atletas de la app. Al cumplirlos ganan la experiencia que definas." />
      <div className="grid grid-cols-1 gap-4 max-w-2xl">
        <AppChallengesManager challenges={(data ?? []) as AppChallenge[]} today={todayISO()} missing={isMissingTable(error)} />
      </div>
    </>
  )
}
