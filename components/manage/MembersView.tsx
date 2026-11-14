'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, UserPlus, ChevronRight, Users } from '@/components/ui/icons'
import { Topbar } from '@/components/layout/Topbar'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { Segmented } from '@/components/ui/motion'
import { Avatar, BoxTabs, Chips, Empty, MigrationNotice, Stat } from '@/components/manage/ui'
import { PLAN_STATE_META, type PlanState } from '@/lib/utils/membership'
import { formatDateOnly } from '@/lib/utils/dates'
import { cn, roleLabel } from '@/lib/utils/cn'
import type { Profile, Box } from '@/lib/types/database'

export interface MemberRow {
  id: string; name: string; email: string; avatar: string | null; role: string; isActive: boolean
  joinedDays: number; attendance30: number; lastDays: number | null
  plan: string | null; state: PlanState; endsOn: string | null; left: number | null
}

type Filter = 'all' | 'active' | 'inactive' | 'expiring' | 'frozen' | 'low' | 'new'
export const INACTIVE_DAYS = 14
export const LOW_ATTENDANCE = 4
export const NEW_DAYS = 30

const isAway = (r: MemberRow) => !r.isActive || (r.lastDays ?? r.joinedDays) >= INACTIVE_DAYS
const TESTS: Record<Filter, (r: MemberRow) => boolean> = {
  all: () => true,
  active: r => !isAway(r),
  inactive: isAway,
  expiring: r => r.isActive && (r.state === 'expiring' || r.state === 'expired' || r.state === 'no_classes'),
  frozen: r => r.state === 'frozen',
  low: r => !isAway(r) && r.attendance30 < LOW_ATTENDANCE,
  new: r => r.isActive && r.joinedDays <= NEW_DAYS,
}

function lastLabel(r: MemberRow): string {
  if (!r.isActive) return 'Cuenta desactivada'
  if (r.lastDays === null) return 'Aún no viene'
  if (r.lastDays === 0) return 'Vino hoy'
  if (r.lastDays === 1) return 'Vino ayer'
  return `Hace ${r.lastDays} días`
}

export function MembersView({ profile, box, boxes, rows, initialFilter, missing }: { profile: Profile; box: Box; boxes: Box[]; rows: MemberRow[]; initialFilter: string; missing: boolean }) {
  const { fire } = useToast()
  const [who, setWho] = useState<'athletes' | 'coaches'>('athletes')
  const [filter, setFilter] = useState<Filter>((initialFilter in TESTS ? initialFilter : 'all') as Filter)
  const [query, setQuery] = useState('')

  const athletes = useMemo(() => rows.filter(r => r.role === 'athlete'), [rows])
  const coaches = useMemo(() => rows.filter(r => r.role !== 'athlete'), [rows])
  const count = (f: Filter) => athletes.filter(TESTS[f]).length

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (who === 'coaches' ? coaches : athletes.filter(TESTS[filter]))
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [who, coaches, athletes, filter, query])

  async function invite() {
    const text = `Únete a ${box.name} en APEX: ${location.origin}/auth/register — código de invitación: ${box.invite_code}`
    if (navigator.share) { try { await navigator.share({ title: `APEX · ${box.name}`, text }) } catch { /* cancelled */ } }
    else { try { await navigator.clipboard.writeText(text); fire('Invitación copiada', 'ok') } catch {} }
  }

  return (
    <>
      <Topbar title="Personas" profile={profile} backHref={null} actions={
        <button type="button" onClick={invite} aria-label="Invitar"
          className="inline-flex items-center gap-1.5 h-10 px-3 sm:px-4 rounded-full bg-ac text-onac text-sm font-bold">
          <UserPlus size={16} aria-hidden /><span className="hidden sm:inline">Invitar</span>
        </button>
      } />
      <div className="p-4 lg:p-6 grid grid-cols-1 gap-4 max-w-3xl w-full">
        <BoxTabs boxes={boxes} current={box.id} base="/manage/members" />
        {missing && <MigrationNotice />}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger">
          <Stat label="Atletas activos" value={count('active')} />
          <Stat label="Por vencer o vencidos" value={count('expiring')} tone={count('expiring') ? 'text-or' : undefined} />
          <Stat label="Congelados" value={count('frozen')} tone={count('frozen') ? 'text-bl' : undefined} />
          <Stat label={`Sin venir ${INACTIVE_DAYS}+ días`} value={count('inactive')} tone={count('inactive') ? 'text-rd' : undefined} />
        </div>

        <Segmented id="who" value={who} onChange={setWho} options={[['athletes', `Atletas · ${athletes.length}`], ['coaches', `Coaches · ${coaches.length}`]]} />

        <label className="relative block">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-fa" aria-hidden />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre o email" aria-label="Buscar persona"
            className="w-full h-12 pl-11 pr-4 rounded-2xl bg-p text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 placeholder:text-fa" />
        </label>

        {who === 'athletes' && (
          <Chips label="Filtrar atletas" value={filter} onChange={setFilter} options={[
            { key: 'all', label: 'Todos' },
            { key: 'active', label: 'Activos', count: count('active') },
            { key: 'expiring', label: 'Por vencer', count: count('expiring'), tone: 'text-or' },
            { key: 'frozen', label: 'Congelados', count: count('frozen'), tone: 'text-bl' },
            { key: 'low', label: 'Baja asistencia', count: count('low'), tone: 'text-or' },
            { key: 'inactive', label: 'Inactivos', count: count('inactive'), tone: 'text-rd' },
            { key: 'new', label: 'Nuevos', count: count('new'), tone: 'text-gr' },
          ]} />
        )}

        {filter === 'low' && who === 'athletes' && <p className="text-xs text-mu -mt-1">Menos de {LOW_ATTENDANCE} asistencias en los últimos 30 días.</p>}
        {filter === 'inactive' && who === 'athletes' && <p className="text-xs text-mu -mt-1">Llevan {INACTIVE_DAYS} días o más sin venir. Un mensaje a tiempo evita la baja.</p>}

        {rows.length <= 1 ? (
          <Empty icon={<Users size={26} />} title="Aún no hay personas en el box" body={`Comparte el código ${box.invite_code} para que se sumen.`} />
        ) : (
          <ul className="flex flex-col gap-2 stagger">
            {shown.map(r => {
              const meta = PLAN_STATE_META[r.state]
              const away = isAway(r)
              return (
                <li key={r.id}>
                  <Link href={`/manage/members/${r.id}?box=${box.id}`} className="tap-card flex items-center gap-3 p-3.5 rounded-2xl bg-p">
                    <Avatar name={r.name} src={r.avatar} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{r.name}</span>
                        {r.role !== 'athlete' && <span className="px-1.5 py-0.5 rounded-full bg-ac/15 text-ac text-[10px] font-bold uppercase">{roleLabel(r.role)}</span>}
                      </div>
                      <div className={cn('text-xs mt-0.5 flex items-center gap-1.5', away && r.role === 'athlete' ? 'text-or' : 'text-mu')}>
                        <span className="truncate">{lastLabel(r)}{r.role === 'athlete' ? ` · ${r.attendance30} en 30 días` : ''}</span>
                      </div>
                      {r.plan && (
                        <div className="text-[11px] text-fa mt-0.5 truncate">
                          {r.plan}{r.left !== null ? ` · ${r.left} clases` : ''}{r.endsOn ? ` · vence ${formatDateOnly(r.endsOn, { day: 'numeric', month: 'short' })}` : ''}
                        </div>
                      )}
                    </div>
                    {r.role === 'athlete' && <Badge color={meta.color}>{meta.label}</Badge>}
                    <ChevronRight size={16} className="text-fa flex-shrink-0" aria-hidden />
                  </Link>
                </li>
              )
            })}
            {shown.length === 0 && <li className="text-center text-mu text-sm py-8">Nadie coincide con ese filtro.</li>}
          </ul>
        )}
      </div>
    </>
  )
}
