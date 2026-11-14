import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requirePlatformAdmin } from '@/lib/utils/platform'
import { PageTitle } from '@/components/admin/AdminChrome'
import { BoxPlanCard } from '@/components/admin/BoxPlanCard'
import { Avatar, Stat } from '@/components/manage/ui'
import { CaretLeft } from '@/components/ui/icons'
import { formatDateOnly, toDateInput } from '@/lib/utils/dates'
import { roleLabel } from '@/lib/utils/cn'
import type { Box } from '@/lib/types/database'

export default async function AdminBox({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, userId } = await requirePlatformAdmin()
  const [{ data: b }, { data: rawMembers }, { data: seen }] = await Promise.all([
    supabase.from('boxes').select('*').eq('id', id).maybeSingle(),
    supabase.from('box_members').select('user_id, role, joined_at, is_active, profiles(full_name, email, avatar_url)').eq('box_id', id).order('joined_at', { ascending: false }),
    supabase.rpc('admin_last_seen'),
  ])
  const box = b as Box | null
  if (!box) redirect('/admin/boxes')
  const lastSeen = new Map(((Array.isArray(seen) ? seen : []) as any[]).map(s => [s.user_id as string, s.last_seen as string]))
  const members = ((rawMembers ?? []) as any[]).map(m => ({ ...m, role: m.user_id === box.owner_id ? 'admin' : m.role }))
  const active = members.filter(m => m.is_active !== false)
  const staff = active.filter(m => m.role !== 'athlete')
  const athletes = active.filter(m => m.role === 'athlete')
  const used7 = active.filter(m => { const s = lastSeen.get(m.user_id); return s && Date.now() - new Date(s).getTime() < 7 * 86_400_000 }).length

  const row = (m: any) => {
    const s = lastSeen.get(m.user_id)
    return (
      <li key={m.user_id} className="flex items-center gap-3 p-3 rounded-2xl bg-p">
        <Avatar name={m.profiles?.full_name ?? '?'} src={m.profiles?.avatar_url} size={38} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{m.profiles?.full_name ?? 'Sin nombre'} <span className="text-xs font-normal text-mu">· {roleLabel(m.role)}</span></div>
          <div className="text-xs text-mu truncate">{m.profiles?.email}</div>
        </div>
        <div className="text-right text-xs text-fa flex-shrink-0">
          <div>{s ? `Usó la app el ${formatDateOnly(toDateInput(s), { day: 'numeric', month: 'short' })}` : 'Sin uso en 30 días'}</div>
          <div>Desde {formatDateOnly(toDateInput(m.joined_at), { month: 'short', year: 'numeric' })}</div>
        </div>
      </li>
    )
  }

  return (
    <>
      <Link href="/admin/boxes" className="inline-flex items-center gap-1 text-sm text-mu h-10 -mt-2"><CaretLeft size={16} weight="bold" /> Boxes</Link>
      <PageTitle title={box.name} sub={`${[box.city, box.country].filter(Boolean).join(', ')} · creado el ${formatDateOnly(toDateInput(box.created_at), { day: 'numeric', month: 'long', year: 'numeric' })}`} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Atletas" value={athletes.length} />
        <Stat label="Coaches y admins" value={staff.length} />
        <Stat label="Usaron la app en 7 días" value={used7} hint={`de ${active.length}`} />
        <Stat label="Bajas" value={members.length - active.length} />
      </div>
      <BoxPlanCard boxId={box.id} boxName={box.name} plan={box.plan} me={userId} />
      <h2 className="font-display text-lg font-bold tracking-tight mt-6 mb-2">Coaches y administradores</h2>
      <ul className="flex flex-col gap-2">{staff.map(row)}{staff.length === 0 && <li className="text-sm text-mu">Ninguno.</li>}</ul>
      <h2 className="font-display text-lg font-bold tracking-tight mt-6 mb-2">Atletas</h2>
      <ul className="flex flex-col gap-2">{athletes.map(row)}{athletes.length === 0 && <li className="text-sm text-mu">Ninguno.</li>}</ul>
    </>
  )
}
