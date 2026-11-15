'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Chips, Empty, BoxTabs } from '@/components/manage/ui'
import { Trophy, CaretRight, Users, MapPin } from '@/components/ui/icons'
import { EVENT_KIND_LABEL, type EventKind } from '@/lib/utils/readiness'
import { formatDateOnly } from '@/lib/utils/dates'
import type { Profile, Box } from '@/lib/types/database'

export interface LibEvent {
  id: string; name: string; kind: EventKind; startsOn: string; endsOn: string
  location: string | null; workouts: number; participants: number
}

export function CompetitionsLibraryView({ profile, boxes, boxId, upcoming, past, missing }: {
  profile: Profile; boxes: Box[]; boxId: string; upcoming: LibEvent[]; past: LibEvent[]; missing: boolean
}) {
  const [tab, setTab] = useState<'up' | 'past'>(upcoming.length || !past.length ? 'up' : 'past')
  const list = tab === 'up' ? upcoming : past

  return (
    <>
      <Topbar title="Competencias" profile={profile} actions={
        <Link href="/calendar/event/new" aria-label="Nueva competencia"
          className="h-10 px-4 rounded-full bg-ac text-onac text-sm font-bold grid place-items-center">Nueva</Link>
      } />
      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-2xl w-full mx-auto">
        <BoxTabs boxes={boxes} current={boxId} base="/coach/competitions" />
        <Chips label="Cuándo" value={tab} onChange={setTab} options={[
          { key: 'up', label: 'Próximas', count: upcoming.length },
          { key: 'past', label: 'Pasadas', count: past.length },
        ]} />

        {list.length === 0 ? (
          <Empty icon={<Trophy size={28} aria-hidden />}
            title={missing ? 'Competencias no disponible todavía' : tab === 'up' ? 'No hay competencias próximas' : 'Aún no hay competencias pasadas'}
            body={missing ? 'Esta sección estará disponible pronto.' : 'Crea un evento del box y aquí verás sus resultados y el ranking.'} />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map(e => (
              <li key={e.id}>
                <Link href={`/coach/competitions/${e.id}?box=${boxId}`} className="tap-card block">
                  <Card padding={false} className="p-4 flex items-center gap-3">
                    <span className="size-11 rounded-xl bg-ac/15 text-ac grid place-items-center flex-shrink-0"><Trophy size={20} aria-hidden /></span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold leading-tight break-words">{e.name}</div>
                      <div className="text-xs text-mu mt-1">
                        {formatDateOnly(e.startsOn, { day: 'numeric', month: 'short', year: 'numeric' })}
                        {e.endsOn !== e.startsOn ? ` – ${formatDateOnly(e.endsOn, { day: 'numeric', month: 'short' })}` : ''} · {EVENT_KIND_LABEL[e.kind] ?? 'Evento'}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-mu flex-wrap">
                        <span className="inline-flex items-center gap-1"><Users size={13} aria-hidden />{e.participants} {e.participants === 1 ? 'atleta' : 'atletas'}</span>
                        <span>{e.workouts} {e.workouts === 1 ? 'prueba' : 'pruebas'}</span>
                        {e.location && <span className="inline-flex items-center gap-1 min-w-0"><MapPin size={13} aria-hidden /><span className="truncate">{e.location}</span></span>}
                      </div>
                    </div>
                    <CaretRight size={18} className="text-fa flex-shrink-0" aria-hidden />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
