import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AthleteRadar } from '@/components/athlete/AthleteRadar'
import type { Profile } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

function fmtValue(pr: any, preferredUnit: 'kg' | 'lb' = 'kg'): { v: string; u: string } {
  const metric = pr.metric ?? '1rm'
  const raw = pr.value_lb ?? 0
  if (metric === 'time') {
    const tot = Math.round(raw); const m = Math.floor(tot / 60); const s = tot % 60
    return { v: `${m}:${String(s).padStart(2, '0')}`, u: 'min' }
  }
  if (metric === 'max_reps' && pr.movements?.category === 'cardio') {
    return { v: String(Math.round(raw)), u: 'cal' }
  }
  if (metric === 'max_reps') return { v: String(Math.round(raw)), u: 'reps' }
  if (preferredUnit === 'kg') return { v: String(Math.round(raw * 0.453592)), u: 'kg' }
  return { v: String(Math.round(raw)), u: 'lb' }
}

export default async function PublicAthletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: p } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  const profile = p as Profile | null
  if (!profile || !profile.profile_public) return notFound()

  const initials = profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const unit = (profile.preferred_unit ?? 'kg') as 'kg' | 'lb'

  let prs: any[] = []
  if (profile.show_prs_public) {
    const { data } = await supabase
      .from('pr_records')
      .select('*, movements(name, category)')
      .eq('user_id', id)
      .eq('is_pr', true)
      .order('recorded_at', { ascending: false })
      .limit(40)
    prs = data ?? []
  }

  return (
    <main className="min-h-screen bg-bg text-t">
      <div className="max-w-2xl mx-auto px-4 py-6 lg:py-10">
        {/* Back to APEX logo */}
        <Link href="/" className="inline-flex items-center gap-2 text-mu hover:text-t text-sm font-semibold mb-6">
          <span className="font-barlow text-[22px] font-black tracking-[3px]">AP<span className="text-ac">E</span>X</span>
        </Link>

        {/* Header card */}
        <div className="rounded-2xl bg-p border border-[var(--ln)] p-5 flex items-center gap-4 mb-4">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-20 h-20 rounded-2xl object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-ac to-bl grid place-items-center font-black text-2xl text-bg">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-barlow text-2xl font-black tracking-wide uppercase truncate">{profile.full_name}</div>
            <div className="text-mu text-sm capitalize">{profile.role}{profile.city ? ` · ${profile.city}` : ''}</div>
            {profile.favorite_movement && (
              <div className="text-ac text-xs mt-1.5 font-semibold">⭐ {profile.favorite_movement}</div>
            )}
          </div>
        </div>

        {profile.bio && (
          <div className="rounded-2xl bg-p border border-[var(--ln)] p-5 mb-4">
            <div className="text-[10px] uppercase tracking-[1.8px] text-fa font-bold mb-2">Bio</div>
            <p className="text-t text-sm leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
          </div>
        )}

        {profile.show_prs_public && prs.length > 0 && (
          <>
            <div className="rounded-2xl bg-p border border-[var(--ln)] p-5 mb-4">
              <div className="font-barlow text-lg font-black tracking-wide mb-4">PERFIL ATLÉTICO</div>
              <AthleteRadar prs={prs} />
            </div>
            <div className="rounded-2xl bg-p border border-[var(--ln)] p-5 mb-4">
              <div className="font-barlow text-lg font-black tracking-wide mb-4">RMs DESTACADOS</div>
              <div className="grid grid-cols-2 gap-3">
                {prs.slice(0, 12).map(pr => {
                  const f = fmtValue(pr, unit)
                  return (
                    <div key={pr.id} className="p-3 bg-p3 rounded-xl">
                      <div className="text-[10px] text-mu uppercase tracking-wide font-bold truncate">{pr.movements?.name}</div>
                      <div className="font-barlow text-2xl font-black text-ac mt-1">
                        {f.v}<span className="text-[11px] text-mu font-normal ml-1">{f.u}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {profile.show_prs_public && prs.length === 0 && (
          <div className="text-center text-mu text-sm py-6">Aún sin RMs registrados.</div>
        )}

        <div className="text-center text-fa text-xs mt-8">
          Perfil público · <Link href="/" className="text-ac hover:underline">APEX</Link>
        </div>
      </div>
    </main>
  )
}
