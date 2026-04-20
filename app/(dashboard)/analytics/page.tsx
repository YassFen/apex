import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import type { Profile } from '@/lib/types/database'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = profileData as Profile | null
  if (!profile) redirect('/auth/login')

  const { data: rawPrs } = await supabase
    .from('pr_records')
    .select('id, value_lb, is_pr, movements(name, category)')
    .eq('user_id', user.id)
    .eq('is_pr', true)

  const prs = (rawPrs ?? []) as unknown as { id: string; value_lb: number; is_pr: boolean; movements: { name: string; category: string } | null }[]

  const byCategory: Record<string, number> = {}
  prs.forEach(p => {
    const cat = p.movements?.category ?? 'other'
    byCategory[cat] = (byCategory[cat] ?? 0) + 1
  })

  return (
    <>
      <Topbar title="Analytics" onMenuClick={() => {}} profile={profile} />
      <div className="p-4 lg:p-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card>
          <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2">PRs totales</div>
          <div className="font-barlow text-[50px] font-black leading-none">{prs.length}</div>
        </Card>
        <Card>
          <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2">Categorías</div>
          <div className="font-barlow text-[50px] font-black leading-none">{Object.keys(byCategory).length}</div>
        </Card>
        <Card className="sm:col-span-2">
          <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-3">PRs por categoría</div>
          <div className="flex flex-col gap-2">
            {Object.entries(byCategory).map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-3">
                <div className="w-24 text-mu text-xs capitalize">{cat}</div>
                <div className="flex-1 h-2 bg-[rgba(255,255,255,.07)] rounded-full overflow-hidden">
                  <div className="h-full bg-ac rounded-full transition-all"
                    style={{ width: `${(count / (prs.length || 1)) * 100}%` }} />
                </div>
                <div className="font-barlow font-bold text-sm w-5 text-right">{count}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
