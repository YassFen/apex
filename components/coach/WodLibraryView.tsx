'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Chips, Empty, BoxTabs } from '@/components/manage/ui'
import { MagnifyingGlass, CaretRight, Users, ClipboardList } from '@/components/ui/icons'
import { WOD_TYPE_META } from '@/lib/utils/wod-types'
import { formatDateOnly } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'
import type { Profile, Box } from '@/lib/types/database'

export interface LibraryWod { id: string; title: string; type: string; date: string; mins: number | null; results: number | null }

const TYPE_OPTIONS = [
  { key: 'all', label: 'Todos' },
  { key: 'fortime', label: 'For Time' },
  { key: 'amrap', label: 'AMRAP' },
  { key: 'emom', label: 'EMOM' },
  { key: 'tabata', label: 'Tabata' },
  { key: 'strength', label: 'Fuerza' },
]

export function WodLibraryView({ profile, boxes, boxId, wods, q, type, page, hasMore }: {
  profile: Profile; boxes: Box[]; boxId: string; wods: LibraryWod[]
  q: string; type: string; page: number; hasMore: boolean
}) {
  const router = useRouter()
  const [text, setText] = useState(q)

  const href = (o: { q?: string; t?: string; p?: number }) => {
    const sp = new URLSearchParams({ box: boxId })
    const nq = o.q ?? q, nt = o.t ?? type
    if (nq) sp.set('q', nq)
    if (nt) sp.set('t', nt)
    if (o.p && o.p > 1) sp.set('p', String(o.p))
    return `/coach/library?${sp.toString()}`
  }
  const filtered = !!q || !!type

  return (
    <>
      <Topbar title="Biblioteca" profile={profile} />
      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-2xl w-full mx-auto">
        <BoxTabs boxes={boxes} current={boxId} base="/coach/library" />

        <form onSubmit={e => { e.preventDefault(); router.push(href({ q: text.trim(), p: 1 })) }} role="search" className="relative">
          <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-mu pointer-events-none" aria-hidden />
          <input type="search" value={text} onChange={e => setText(e.target.value)} enterKeyHint="search"
            placeholder="Buscar por nombre o ejercicio" aria-label="Buscar WODs"
            className="w-full h-12 pl-11 pr-4 rounded-2xl bg-p text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60" />
        </form>

        <Chips label="Tipo de WOD" value={type || 'all'} options={TYPE_OPTIONS}
          onChange={k => router.push(href({ t: k === 'all' ? '' : k, p: 1 }))} />

        {wods.length === 0 ? (
          <Empty icon={<ClipboardList size={28} aria-hidden />}
            title={filtered ? 'No encontramos WODs' : 'Aún no hay WODs publicados'}
            body={filtered ? 'Prueba con otra palabra o quita el filtro.' : 'Cuando publiques WODs, los verás aquí para volver a usarlos.'}
            action={filtered
              ? <Link href={`/coach/library?box=${boxId}`} className="mt-1 h-11 px-5 rounded-full bg-p2 text-t font-bold text-sm grid place-items-center">Quitar filtros</Link>
              : <Link href="/coach/publish-wod" className="mt-1 h-11 px-5 rounded-full bg-ac text-onac font-bold text-sm grid place-items-center">Publicar un WOD</Link>} />
        ) : (
          <ul className="flex flex-col gap-2">
            {wods.map(w => {
              const meta = WOD_TYPE_META[w.type]
              return (
                <li key={w.id}>
                  <Link href={`/coach/library/${w.id}?box=${boxId}`} className="tap-card block">
                    <Card padding={false} className="p-4 flex items-center gap-3">
                      <div className="w-12 flex-shrink-0 text-center">
                        <div className="text-[10px] font-bold uppercase text-mu">{formatDateOnly(w.date, { month: 'short' }).replace('.', '')}</div>
                        <div className="font-display text-2xl font-bold leading-none tracking-tight tabular-nums">{Number(w.date.slice(8, 10))}</div>
                        <div className="text-[10px] text-fa tabular-nums">{w.date.slice(0, 4)}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold leading-tight break-words">{w.title}</div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {meta && <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase', meta.cls)}>{meta.label}</span>}
                          {w.mins ? <span className="text-xs text-mu tabular-nums">{w.mins} min</span> : null}
                          {w.results !== null && (
                            <span className="inline-flex items-center gap-1 text-xs text-mu tabular-nums">
                              <Users size={13} aria-hidden />{w.results} {w.results === 1 ? 'resultado' : 'resultados'}
                            </span>
                          )}
                        </div>
                      </div>
                      <CaretRight size={18} className="text-fa flex-shrink-0" aria-hidden />
                    </Card>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        {hasMore && (
          <Link href={href({ p: page + 1 })} scroll={false}
            className="h-12 rounded-full bg-p text-t font-bold text-sm grid place-items-center hover:bg-p2 transition-colors">
            Ver más
          </Link>
        )}
      </div>
    </>
  )
}
