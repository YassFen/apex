import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import type { Profile, Box } from '@/lib/types/database'

export default async function AthletesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile || profile.role !== 'coach') redirect('/dashboard')

  const { data: b } = await supabase.from('boxes').select('*').eq('owner_id', user.id).single()
  const box = b as Box | null
  if (!box) redirect('/dashboard')

  const { data: rawMembers } = await supabase
    .from('box_members')
    .select('*, profiles(id, full_name, email, city, tracking_since, preferred_unit)')
    .eq('box_id', box.id)
    .eq('is_active', true)
    .order('joined_at', { ascending: false })

  const members = (rawMembers ?? []) as any[]

  return (
    <>
      <Topbar title="Atletas" profile={profile} />
      <div className="p-4 lg:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="text-mu text-sm">{members.length} atletas en {box.name}</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-p3 border border-[var(--ln)]">
            <span className="text-[10px] uppercase tracking-wide text-mu font-bold">Código:</span>
            <span className="font-barlow font-black tracking-widest text-ac">{box.invite_code}</span>
          </div>
        </div>
        <Card padding={false}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,.04)]">
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold">Atleta</th>
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold hidden sm:table-cell">Ciudad</th>
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold">Rol</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m: any) => {
                const pr = m.profiles as any
                const initials = (pr?.full_name ?? 'AN').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <tr key={m.id} className="border-b border-[rgba(255,255,255,.04)] hover:bg-white/[.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ac to-bl grid place-items-center font-black text-xs text-bg flex-shrink-0">
                          {initials}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{pr?.full_name}</div>
                          <div className="text-mu text-[11px]">{pr?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-mu text-sm hidden sm:table-cell">{pr?.city ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${m.role === 'coach' ? 'bg-ac/10 text-ac' : 'bg-bl/10 text-bl'}`}>
                        {m.role}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  )
}
