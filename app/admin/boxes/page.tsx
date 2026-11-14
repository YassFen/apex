import Link from 'next/link'
import { requirePlatformAdmin } from '@/lib/utils/platform'
import { PageTitle } from '@/components/admin/AdminChrome'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/manage/ui'
import { formatDateOnly, toDateInput } from '@/lib/utils/dates'
import type { Box } from '@/lib/types/database'

const PLAN_COLOR = { free: 'neutral', pro: 'lime', enterprise: 'purple' } as const

export default async function AdminBoxes() {
  const { supabase } = await requirePlatformAdmin()
  const [{ data: rawBoxes }, { data: rawMembers }] = await Promise.all([
    supabase.from('boxes').select('*').order('created_at', { ascending: false }),
    supabase.from('box_members').select('box_id, role, is_active'),
  ])
  const boxes = (rawBoxes ?? []) as Box[]
  const { data: owners } = boxes.length ? await supabase.from('profiles').select('id, full_name, email').in('id', boxes.map(b => b.owner_id)) : { data: [] }
  const ownerOf = (id: string) => ((owners ?? []) as any[]).find(o => o.id === id)
  const count = new Map<string, { athletes: number; coaches: number }>()
  for (const m of (rawMembers ?? []) as any[]) {
    if (m.is_active === false) continue
    const c = count.get(m.box_id) ?? { athletes: 0, coaches: 0 }
    if (m.role === 'athlete') c.athletes++; else c.coaches++
    count.set(m.box_id, c)
  }
  const paying = boxes.filter(b => b.plan !== 'free').length

  return (
    <>
      <PageTitle title="Boxes" sub="Todos los boxes de la aplicación, con sus coaches y atletas." />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Boxes" value={boxes.length} />
        <Stat label="Con plan de pago" value={paying} />
        <Stat label="Atletas por box" value={boxes.length ? Math.round([...count.values()].reduce((a, c) => a + c.athletes, 0) / boxes.length) : 0} hint="promedio" />
      </div>
      <ul className="flex flex-col gap-2">
        {boxes.map(b => {
          const c = count.get(b.id) ?? { athletes: 0, coaches: 0 }
          const o = ownerOf(b.owner_id)
          return (
            <li key={b.id}>
              <Link href={`/admin/boxes/${b.id}`} className="tap-card flex items-center gap-4 p-4 rounded-2xl bg-p">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="font-semibold truncate">{b.name}</span><Badge color={PLAN_COLOR[b.plan] ?? 'neutral'}>{b.plan}</Badge></div>
                  <div className="text-xs text-mu mt-0.5 truncate">{[b.city, b.country].filter(Boolean).join(', ')} · Dueño: {o?.full_name ?? '—'} · desde {formatDateOnly(toDateInput(b.created_at), { month: 'short', year: 'numeric' })}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-display text-2xl font-bold tabular-nums leading-none tracking-tight">{c.athletes}</div>
                  <div className="text-[11px] text-fa mt-0.5">atletas · {c.coaches} coaches</div>
                </div>
              </Link>
            </li>
          )
        })}
        {boxes.length === 0 && <li className="text-sm text-mu p-4">Aún no hay boxes.</li>}
      </ul>
    </>
  )
}
