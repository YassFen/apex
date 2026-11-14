'use client'
import { useMemo, useState } from 'react'
import { Search } from '@/components/ui/icons'
import { Avatar, Chips, Stat } from '@/components/manage/ui'
import { PageTitle } from '@/components/admin/AdminChrome'
import { formatDateOnly, toDateInput } from '@/lib/utils/dates'

export interface UserRow {
  id: string; name: string; email: string; avatar: string | null; city: string | null; createdAt: string
  kind: 'admin' | 'coach' | 'athlete'; boxes: string[]; lastSeen: string | null; events: number
}
type Filter = 'all' | 'admin' | 'coach' | 'athlete' | 'nobox' | 'quiet'
const KIND = { admin: 'Administrador de box', coach: 'Coach', athlete: 'Atleta' }
const PAGE = 60

export function UsersView({ rows }: { rows: UserRow[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const test = (f: Filter) => (r: UserRow) => f === 'all' ? true : f === 'nobox' ? r.boxes.length === 0 : f === 'quiet' ? !r.lastSeen : r.kind === f
  const n = (f: Filter) => rows.filter(test(f)).length
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(test(filter)).filter(r => !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.boxes.some(b => b.toLowerCase().includes(q)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, query])

  return (
    <>
      <PageTitle title="Usuarios" sub="Todas las personas registradas: de qué box son, qué rol tienen y cuándo usaron la app por última vez." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Registrados" value={rows.length} />
        <Stat label="Administradores de box" value={n('admin')} />
        <Stat label="Coaches" value={n('coach')} />
        <Stat label="Sin box" value={n('nobox')} tone={n('nobox') ? 'text-or' : undefined} hint="se registraron y no se unieron" />
      </div>
      <label className="relative block mb-3">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-fa" aria-hidden />
        <input type="search" value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE) }} placeholder="Buscar por nombre, correo o box" aria-label="Buscar usuario"
          className="w-full h-12 pl-11 pr-4 rounded-2xl bg-p text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 placeholder:text-fa" />
      </label>
      <Chips label="Filtrar usuarios" value={filter} onChange={f => { setFilter(f); setLimit(PAGE) }} options={[
        { key: 'all', label: 'Todos' }, { key: 'athlete', label: 'Atletas', count: n('athlete') }, { key: 'coach', label: 'Coaches', count: n('coach') },
        { key: 'admin', label: 'Admins de box', count: n('admin') }, { key: 'nobox', label: 'Sin box', count: n('nobox'), tone: 'text-or' },
        { key: 'quiet', label: 'Sin uso en 30 días', count: n('quiet'), tone: 'text-or' },
      ]} />
      <ul className="flex flex-col gap-2 mt-4">
        {shown.slice(0, limit).map(r => (
          <li key={r.id} className="flex items-center gap-3 p-3 rounded-2xl bg-p">
            <Avatar name={r.name} src={r.avatar} size={40} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{r.name} <span className="text-xs font-normal text-mu">· {KIND[r.kind]}</span></div>
              <div className="text-xs text-mu truncate">{r.email}</div>
              <div className="text-[11px] text-fa truncate">{r.boxes.length ? r.boxes.join(', ') : 'Sin box'}{r.city ? ` · ${r.city}` : ''}</div>
            </div>
            <div className="text-right text-xs flex-shrink-0">
              <div className={r.lastSeen ? 'text-mu' : 'text-or'}>{r.lastSeen ? formatDateOnly(toDateInput(r.lastSeen), { day: 'numeric', month: 'short' }) : 'Sin uso'}</div>
              <div className="text-fa tabular-nums">{r.events} acciones</div>
              <div className="text-fa">Alta {formatDateOnly(toDateInput(r.createdAt), { month: 'short', year: '2-digit' })}</div>
            </div>
          </li>
        ))}
        {shown.length === 0 && <li className="text-sm text-mu p-4">Nadie coincide.</li>}
      </ul>
      {shown.length > limit && <button type="button" onClick={() => setLimit(l => l + PAGE)} className="mt-4 h-11 px-5 rounded-full bg-p2 text-sm font-bold">Ver más ({shown.length - limit})</button>}
    </>
  )
}
