import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import type { Profile } from '@/lib/types/database'

const CAT_LABELS: Record<string, string> = {
  weightlifting: 'Halterofilia', olympic: 'Olímpicos',
  gymnastics: 'Gymnastics', cardio: 'Cardio', benchmark: 'Benchmarks',
}

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = profileData as Profile | null
  if (!profile) redirect('/auth/login')

  // ── Coach analytics ─────────────────────────────────────────────────────────
  if (profile.role === 'coach') {
    const { data: box } = await supabase.from('boxes').select('*').eq('owner_id', user.id).single()

    if (!box) {
      return (
        <>
          <Topbar title="Analytics" profile={profile} />
          <div className="p-4 lg:p-6">
            <Card className="text-center py-12">
              <div className="text-mu text-sm">Crea tu box primero para ver estadísticas.</div>
            </Card>
          </div>
        </>
      )
    }

    const [{ data: members }, { data: wods }, { data: results }] = await Promise.all([
      supabase.from('box_members').select('id, joined_at, role').eq('box_id', box.id).eq('is_active', true),
      supabase.from('daily_wods').select('id, scheduled_for, type, title').eq('box_id', box.id).order('scheduled_for', { ascending: false }).limit(30),
      supabase.from('wod_results').select('id, daily_wod_id, rx_level').in(
        'daily_wod_id',
        ((await supabase.from('daily_wods').select('id').eq('box_id', box.id)).data ?? []).map((w: any) => w.id)
      ),
    ])

    const athletes = (members ?? []).filter((m: any) => m.role === 'athlete').length
    const totalWods = (wods ?? []).length
    const totalResults = (results ?? []).length
    const rxCount = (results ?? []).filter((r: any) => r.rx_level === 'rx').length
    const rxPct = totalResults > 0 ? Math.round((rxCount / totalResults) * 100) : 0

    const wodsByType: Record<string, number> = {}
    ;(wods ?? []).forEach((w: any) => { wodsByType[w.type] = (wodsByType[w.type] ?? 0) + 1 })

    return (
      <>
        <Topbar title="Analytics — Box" profile={profile} />
        <div className="p-4 lg:p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <Card>
              <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2">Atletas activos</div>
              <div className="font-barlow text-[50px] font-black leading-none text-ac">{athletes}</div>
            </Card>
            <Card>
              <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2">WODs publicados</div>
              <div className="font-barlow text-[50px] font-black leading-none">{totalWods}</div>
            </Card>
            <Card>
              <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2">Resultados registrados</div>
              <div className="font-barlow text-[50px] font-black leading-none">{totalResults}</div>
            </Card>
            <Card>
              <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2">% RX</div>
              <div className="font-barlow text-[50px] font-black leading-none text-gr">{rxPct}%</div>
            </Card>
          </div>

          <Card>
            <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-3">WODs por tipo</div>
            {Object.keys(wodsByType).length === 0 ? (
              <div className="text-mu text-sm">Aún no hay WODs publicados.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {Object.entries(wodsByType).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-3">
                    <div className="w-20 text-mu text-xs uppercase font-bold">{type}</div>
                    <div className="flex-1 h-2 bg-[rgba(255,255,255,.07)] rounded-full overflow-hidden">
                      <div className="h-full bg-ac rounded-full" style={{ width: `${(count / totalWods) * 100}%` }} />
                    </div>
                    <div className="font-barlow font-bold text-sm w-5 text-right">{count}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-3">Últimos WODs</div>
            {(wods ?? []).length === 0 ? (
              <div className="text-mu text-sm">Sin WODs todavía.</div>
            ) : (
              <div className="flex flex-col divide-y divide-[rgba(255,255,255,.04)]">
                {(wods ?? []).slice(0, 10).map((w: any) => (
                  <div key={w.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <div className="text-sm font-semibold">{w.title}</div>
                      <div className="text-[11px] text-mu">{new Date(w.scheduled_for).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}</div>
                    </div>
                    <span className="text-[10px] uppercase font-extrabold tracking-wide text-mu border border-[var(--ln2)] px-2 py-1 rounded-full">{w.type}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </>
    )
  }

  // ── Athlete analytics ────────────────────────────────────────────────────────
  const { data: rawPrs } = await supabase
    .from('pr_records')
    .select('id, value_lb, metric, is_pr, recorded_at, movements(name, category)')
    .eq('user_id', user.id)

  const prs = (rawPrs ?? []) as any[]
  const prBests = prs.filter((p: any) => p.is_pr)

  const byCategory: Record<string, number> = {}
  prBests.forEach((p: any) => {
    const cat = p.movements?.category ?? 'other'
    byCategory[cat] = (byCategory[cat] ?? 0) + 1
  })

  const byMonth: Record<string, number> = {}
  prs.forEach((p: any) => {
    const month = new Date(p.recorded_at).toLocaleDateString('es-CL', { month: 'short', year: '2-digit' })
    byMonth[month] = (byMonth[month] ?? 0) + 1
  })
  const monthEntries = Object.entries(byMonth).slice(-6)
  const maxMonth = Math.max(...monthEntries.map(([, v]) => v), 1)

  return (
    <>
      <Topbar title="Analytics" profile={profile} />
      <div className="p-4 lg:p-6 flex flex-col gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <Card>
            <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2">RMs actuales</div>
            <div className="font-barlow text-[50px] font-black leading-none text-ac">{prBests.length}</div>
          </Card>
          <Card>
            <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2">Total registros</div>
            <div className="font-barlow text-[50px] font-black leading-none">{prs.length}</div>
          </Card>
          <Card>
            <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2">Categorías</div>
            <div className="font-barlow text-[50px] font-black leading-none">{Object.keys(byCategory).length}</div>
          </Card>
          <Card>
            <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2">Este mes</div>
            <div className="font-barlow text-[50px] font-black leading-none">
              {prs.filter((p: any) => new Date(p.recorded_at).getMonth() === new Date().getMonth()).length}
            </div>
          </Card>
        </div>

        <div className="grid sm:grid-cols-2 gap-3.5">
          <Card>
            <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-3">RMs por categoría</div>
            {Object.keys(byCategory).length === 0 ? (
              <div className="text-mu text-sm">Registra tu primer RM para ver estadísticas.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {Object.entries(byCategory).map(([cat, count]) => (
                  <div key={cat} className="flex items-center gap-3">
                    <div className="w-24 text-mu text-xs">{CAT_LABELS[cat] ?? cat}</div>
                    <div className="flex-1 h-2 bg-[rgba(255,255,255,.07)] rounded-full overflow-hidden">
                      <div className="h-full bg-ac rounded-full" style={{ width: `${(count / (prBests.length || 1)) * 100}%` }} />
                    </div>
                    <div className="font-barlaw font-bold text-sm w-4 text-right">{count}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-3">Registros por mes</div>
            {monthEntries.length === 0 ? (
              <div className="text-mu text-sm">Sin registros todavía.</div>
            ) : (
              <div className="flex items-end gap-2 h-28">
                {monthEntries.map(([month, count]) => (
                  <div key={month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-ac/20 rounded-t-md relative" style={{ height: `${(count / maxMonth) * 96}px` }}>
                      <div className="absolute bottom-0 inset-x-0 bg-ac rounded-t-md" style={{ height: `${(count / maxMonth) * 96}px` }} />
                    </div>
                    <div className="text-[9px] text-fa font-bold">{month}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
