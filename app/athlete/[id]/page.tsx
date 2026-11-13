import { Logo } from '@/components/ui/Logo'
import { notFound } from 'next/navigation'
import { roleLabel } from '@/lib/utils/cn'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AthleteRadar } from '@/components/athlete/AthleteRadar'
import type { Profile } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

// Only what the public page shows. The email never leaves the database here (migration 009 also blocks it for visitors).
const PUBLIC_COLUMNS = 'id, full_name, avatar_url, role, preferred_unit, bio, city, favorite_movement, profile_public, show_prs_public'

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

  const { data: p } = await supabase.from('profiles').select(PUBLIC_COLUMNS).eq('id', id).maybeSingle()
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
    <main className="min-h-dvh bg-bg text-t">
      <div className="max-w-2xl mx-auto px-4 py-6 lg:py-10">
        {/* Back to APEX logo */}
        <Link href="/" className="inline-flex items-center gap-2 text-mu hover:text-t text-sm font-semibold mb-6">
          <Logo size={24} className="text-t" />
        </Link>

        {/* Header card */}
        <div className="rounded-2xl bg-p p-5 flex items-center gap-4 mb-4">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-20 h-20 rounded-2xl object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-ac to-bl grid place-items-center font-bold text-2xl text-onac">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-display text-2xl font-bold truncate tracking-tight">{profile.full_name}</div>
            <div className="text-mu text-sm">{roleLabel(profile.role)}{profile.city ? ` · ${profile.city}` : ''}</div>
            {profile.favorite_movement && (
              <div className="text-ac text-xs mt-1.5 font-semibold">Movimiento favorito: {profile.favorite_movement}</div>
            )}
          </div>
        </div>

        {profile.bio && (
          <div className="rounded-2xl bg-p p-5 mb-4">
            <div className="text-xs text-mu font-semibold mb-2">Bio</div>
            <p className="text-t text-sm leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
          </div>
        )}

        {profile.show_prs_public && prs.length > 0 && (
          <>
            <div className="rounded-2xl bg-p p-5 mb-4">
              <div className="font-display text-lg font-bold mb-4 tracking-tight">PERFIL ATLÉTICO</div>
              <AthleteRadar prs={prs} />
            </div>
            <div className="rounded-2xl bg-p p-5 mb-4">
              <div className="font-display text-lg font-bold mb-4 tracking-tight">RMs DESTACADOS</div>
              <div className="grid grid-cols-2 gap-3">
                {prs.slice(0, 12).map(pr => {
                  const f = fmtValue(pr, unit)
                  return (
                    <div key={pr.id} className="p-3 bg-p3 rounded-xl">
                      <div className="text-[10px] text-mu uppercase tracking-wide font-bold truncate">{pr.movements?.name}</div>
                      <div className="font-display text-2xl font-bold text-ac mt-1 tracking-tight">
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
