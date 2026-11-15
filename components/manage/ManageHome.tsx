'use client'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Avatar, BoxTabs, MigrationNotice, Stat } from '@/components/manage/ui'
import { Bars, CompareBars, Delta, LineChart, RankBars, type Datum } from '@/components/manage/charts'
import { Warning, CaretRight, CheckCircle } from '@/components/ui/icons'
import { cn } from '@/lib/utils/cn'
import type { Profile, Box } from '@/lib/types/database'

export interface ManageSummary {
  monthLabel: string
  activeNow: number; totalAthletes: number; coaches: number
  attNow: number; attPrev: number; attPrevFull: number
  joinedNow: number; joinedPrev: number; leftNow: number; leftPrev: number
  frozen: number; expiring: number; expired: number
  occupancy: number | null; waitlisted: number; noCoach: number; issues: number
  lowSlots: string[]
  away: { id: string; name: string; avatar: string | null; days: number }[]; awayCount: number
  cumLabels: string[]; cumNow: number[]; cumPrev: number[]
  byDow: { label: string; now: number; before: number }[]
  byHour: Datum[]; perCoach: Datum[]; plans: Datum[]
  evolution: { label: string; members: number; joined: number }[]
  hasSchedule: boolean
}

function Panel({ title, sub, children, className }: { title: string; sub?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('flex flex-col gap-4 min-w-0', className)}>
      <div>
        <h2 className="font-display text-base font-bold tracking-tight">{title}</h2>
        {sub && <p className="text-xs text-mu mt-0.5">{sub}</p>}
      </div>
      {children}
    </Card>
  )
}

export function ManageHome({ profile, box, boxes, s, missing }: { profile: Profile; box: Box; boxes: Box[]; s: ManageSummary; missing: boolean }) {
  // Keeps the chosen box when an administrator has several.
  const withBox = (href: string) => (boxes.length > 1 ? `${href}${href.includes('?') ? '&' : '?'}box=${box.id}` : href)
  // What needs a decision, most pressing first.
  const alerts: { tone: 'red' | 'orange' | 'muted'; text: string; href: string }[] = []
  if (s.issues) alerts.push({ tone: 'red', text: s.issues === 1 ? 'Un coach no puede dar una clase. Asigna reemplazo.' : `${s.issues} avisos de coaches que no pueden dar clase.`, href: '/manage/coaches' })
  if (s.noCoach) alerts.push({ tone: 'red', text: `${s.noCoach} ${s.noCoach === 1 ? 'clase' : 'clases'} de los próximos 7 días sin coach asignado.`, href: '/manage/schedule' })
  if (s.waitlisted) alerts.push({ tone: 'orange', text: `${s.waitlisted} ${s.waitlisted === 1 ? 'clase llena' : 'clases llenas'} con lista de espera.`, href: '/manage/schedule' })
  if (s.expired) alerts.push({ tone: 'orange', text: `${s.expired} ${s.expired === 1 ? 'atleta con el plan vencido o sin clases' : 'atletas con el plan vencido o sin clases'}.`, href: '/manage/members?f=expiring' })
  if (s.expiring) alerts.push({ tone: 'orange', text: `${s.expiring} ${s.expiring === 1 ? 'plan vence' : 'planes vencen'} en los próximos 7 días.`, href: '/manage/members?f=expiring' })
  if (s.awayCount) alerts.push({ tone: 'orange', text: `${s.awayCount} ${s.awayCount === 1 ? 'atleta lleva' : 'atletas llevan'} 14 días o más sin venir.`, href: '/manage/members?f=inactive' })
  if (s.lowSlots.length) alerts.push({ tone: 'muted', text: `Poca demanda en ${s.lowSlots.slice(0, 4).join(', ')}${s.lowSlots.length > 4 ? '…' : ''}.`, href: '/manage/schedule' })

  return (
    <>
      <Topbar title={box.name.length > 18 ? 'Resumen' : box.name} profile={profile} backHref={null} />
      <div className="p-4 lg:p-6 grid grid-cols-1 gap-4 w-full max-w-5xl">
        <BoxTabs boxes={boxes} current={box.id} base="/manage" />
        {missing && <MigrationNotice />}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <Stat label="Atletas activos" value={s.activeNow} hint={`de ${s.totalAthletes} inscritos · ${s.coaches} coaches`} />
          <Stat label={`Asistencias en ${s.monthLabel}`} value={s.attNow} hint={<Delta now={s.attNow} before={s.attPrev} suffix="a la misma fecha" />} />
          <Stat label="Nuevos ingresos" value={s.joinedNow} hint={<Delta now={s.joinedNow} before={s.joinedPrev} />} />
          <Stat label="Bajas" value={s.leftNow} tone={s.leftNow ? 'text-rd' : undefined} hint={`${s.leftPrev} el mes anterior`} />
          <Stat label="Planes congelados" value={s.frozen} tone={s.frozen ? 'text-bl' : undefined} />
          <Stat label="Planes por vencer" value={s.expiring} tone={s.expiring ? 'text-or' : undefined} hint={s.expired ? `${s.expired} ya vencidos` : undefined} />
          <Stat label="Ocupación de clases" value={s.occupancy === null ? '—' : `${s.occupancy}%`} hint={s.hasSchedule ? 'promedio del mes' : 'Crea la grilla en Horarios'} />
          <Stat label="Con lista de espera" value={s.waitlisted} tone={s.waitlisted ? 'text-or' : undefined} hint="próximos 7 días" />
        </div>

        {/* Alerts */}
        <section aria-label="Alertas" className="flex flex-col gap-2">
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-gr/10 text-gr text-sm"><CheckCircle size={18} weight="fill" /> Todo en orden: sin alertas por ahora.</div>
          ) : alerts.map(a => (
            <Link key={a.text} href={withBox(a.href)} className={cn('tap-card flex items-center gap-2.5 p-3.5 rounded-2xl text-sm',
              a.tone === 'red' ? 'bg-rd/10 text-rd' : a.tone === 'orange' ? 'bg-or/10 text-or' : 'bg-p text-mu')}>
              <Warning size={18} className="flex-shrink-0" aria-hidden />
              <span className="flex-1 text-pretty">{a.text}</span>
              <CaretRight size={14} weight="bold" className="flex-shrink-0 opacity-70" aria-hidden />
            </Link>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Asistencia acumulada" sub={<>Este mes contra el anterior, día a día. Mes anterior completo: {s.attPrevFull}.</>}>
            <LineChart labels={s.cumLabels.map(d => `Día ${d}`)} series={s.cumNow} compare={s.cumPrev} nowLabel="Este mes" beforeLabel="Mes anterior" />
          </Panel>
          <Panel title="Días de mayor asistencia" sub="Asistencias por día de la semana, a la misma fecha de cada mes.">
            <CompareBars data={s.byDow} nowLabel="Este mes" beforeLabel="Mes anterior" />
          </Panel>
          <Panel title="Horarios más concurridos" sub="Promedio de inscritos por clase en cada horario.">
            {s.byHour.length ? <Bars data={s.byHour} unit=" personas" /> : <p className="text-sm text-mu">Aparece cuando haya reservas en la grilla de horarios.</p>}
          </Panel>
          <Panel title="Asistencia por coach" sub={`Personas que pasaron por sus clases en ${s.monthLabel}.`}>
            <RankBars data={s.perCoach} empty="Aparece cuando las clases tengan coach y reservas." />
          </Panel>
          <Panel title="Evolución de atletas" sub="Inscritos al cierre de cada mes.">
            <LineChart labels={s.evolution.map(e => e.label)} series={s.evolution.map(e => e.members)} nowLabel="Atletas" />
          </Panel>
          <Panel title="Nuevas inscripciones" sub="Personas que se sumaron cada mes.">
            <Bars data={s.evolution.map((e, i) => ({ label: e.label, value: e.joined, highlight: i === s.evolution.length - 1 }))} />
          </Panel>
          <Panel title="Atletas por plan" sub="Solo planes vigentes.">
            <RankBars data={s.plans} empty="Crea planes y asígnalos desde la ficha de cada atleta." />
          </Panel>
          <Panel title="Están dejando de venir" sub="14 días o más sin entrenar. Escríbeles antes de que se den de baja.">
            {s.away.length === 0 ? <p className="text-sm text-mu">Nadie por ahora.</p> : (
              <ul className="flex flex-col gap-1.5">
                {s.away.map(p => (
                  <li key={p.id}>
                    <Link href={withBox(`/manage/members/${p.id}`)} data-track-off className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-p2">
                      <Avatar name={p.name} src={p.avatar} size={36} />
                      <span className="flex-1 text-sm font-medium truncate">{p.name}</span>
                      <span className="text-sm text-or font-semibold tabular-nums">{p.days} días</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {s.awayCount > s.away.length && <Link href={withBox('/manage/members?f=inactive')} className="text-sm font-semibold text-ac">Ver los {s.awayCount}</Link>}
          </Panel>
        </div>
      </div>
    </>
  )
}
