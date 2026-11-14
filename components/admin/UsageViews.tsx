'use client'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Stat } from '@/components/manage/ui'
import { Bars, LineChart, RankBars } from '@/components/manage/charts'
import { PageTitle, PeriodTabs } from '@/components/admin/AdminChrome'
import { Bug, CheckCircle } from '@/components/ui/icons'
import { formatDateOnly } from '@/lib/utils/dates'
import { WEEKDAYS_SHORT, WEEK_ORDER } from '@/lib/utils/schedule'
import { screenName, type Usage } from '@/lib/utils/platform-shared'
import { cn } from '@/lib/utils/cn'

const MODE: Record<string, string> = { admin: 'Administrador de box', coach: 'Coach', athlete: 'Atleta' }
const DEVICE: Record<string, string> = { mobile: 'Teléfono', tablet: 'Tablet', desktop: 'Computador' }
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const day = (d: string) => formatDateOnly(d, { day: 'numeric', month: 'short' })

function Panel({ title, sub, children, className }: { title: string; sub?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('flex flex-col gap-4 min-w-0', className)}>
      <div><h2 className="font-display text-base font-bold tracking-tight">{title}</h2>{sub && <p className="text-xs text-mu mt-0.5 text-pretty">{sub}</p>}</div>
      {children}
    </Card>
  )
}

export function NoData() {
  return (
    <Card className="text-sm text-mu text-pretty">
      Aún no hay datos. Aplica la migración 011 en Supabase y agrega tu cuenta a <code className="text-t">platform_admins</code>; desde ese momento la app empieza a registrar el uso y los errores.
    </Card>
  )
}

export function OverviewView({ u }: { u: Usage }) {
  const t = u.totals
  const stick = pct(t.dau, t.mau)
  const kept = pct(u.retention.kept, u.retention.before)
  const topScreens = mergeScreens(u).slice(0, 6)
  return (
    <>
      <PageTitle title="Resumen" sub="Cómo va la aplicación completa: quiénes la usan, cuánto vuelven y si algo está fallando." />
      <Link href="/admin/errors" className={cn('tap-card flex items-center gap-3 p-4 rounded-2xl mb-4 text-sm', t.open_errors ? 'bg-rd/10 text-rd' : 'bg-gr/10 text-gr')}>
        {t.open_errors ? <Bug size={20} weight="fill" /> : <CheckCircle size={20} weight="fill" />}
        <span className="flex-1 font-semibold">{t.open_errors ? `${t.open_errors} ${t.open_errors === 1 ? 'error distinto sin resolver' : 'errores distintos sin resolver'} en los últimos 14 días` : 'Sin errores abiertos en los últimos 14 días'}</span>
        <span className="font-semibold underline">Ver</span>
      </Link>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
        <Stat label="Boxes" value={t.boxes} />
        <Stat label="Personas registradas" value={t.users} hint={`${t.new_7d} nuevas esta semana`} />
        <Stat label="Coaches" value={t.coaches} />
        <Stat label="Atletas" value={t.athletes} />
        <Stat label="Activos hoy" value={t.dau} hint="personas distintas en 24 h" />
        <Stat label="Activos en 7 días" value={t.wau} />
        <Stat label="Activos en 30 días" value={t.mau} hint={`${pct(t.mau, t.users)}% de los registrados`} />
        <Stat label="Frecuencia de uso" value={`${stick}%`} hint="activos hoy ÷ activos del mes" tone={stick >= 20 ? 'text-gr' : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Panel title="Personas activas por día" sub={`Últimos ${u.days} días.`}>
          {u.daily.length > 1 ? <LineChart labels={u.daily.map(d => day(d.d))} series={u.daily.map(d => d.users)} nowLabel="Personas" /> : <p className="text-sm text-mu">Se dibuja con dos días de datos o más.</p>}
        </Panel>
        <Panel title="Registros por semana" sub="Cuentas nuevas en las últimas 12 semanas.">
          <Bars data={u.signups.map((s, i) => ({ label: day(s.d), value: s.n, highlight: i === u.signups.length - 1 }))} />
        </Panel>
        <Panel title="¿Vuelven?" sub="De quienes usaron la app la semana pasada, cuántos volvieron esta semana.">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-5xl font-bold tracking-tight tabular-nums">{kept}%</span>
            <span className="text-sm text-mu">{u.retention.kept} de {u.retention.before} personas</span>
          </div>
          <div className="h-2 rounded-full bg-p3 overflow-hidden"><div className="h-full rounded-full bg-ac" style={{ width: `${kept}%` }} /></div>
          <p className="text-xs text-mu text-pretty">Bajo 40% conviene revisar qué hacen quienes no vuelven: suelen ser cuentas nuevas que no encontraron su box o su WOD.</p>
        </Panel>
        <Panel title="Lo más usado" sub={<Link href="/admin/usage" className="text-ac font-semibold">Ver todo el detalle de uso</Link>}>
          <RankBars data={topScreens.map(s => ({ label: screenName(s.k), value: s.n, hint: `${s.users} personas` }))} />
        </Panel>
      </div>
    </>
  )
}

/** The same screen is counted once per mode; add them up for the overall ranking. */
function mergeScreens(u: Usage) {
  const m = new Map<string, { k: string; n: number; users: number }>()
  for (const s of u.screens) { const x = m.get(s.k) ?? { k: s.k, n: 0, users: 0 }; x.n += s.n; x.users += s.users ?? 0; m.set(s.k, x) }
  return [...m.values()].sort((a, b) => b.n - a.n)
}

export function UsageView({ u }: { u: Usage }) {
  const totalUsers = Math.max(1, u.modes.reduce((a, m) => a + m.users, 0))
  const hours = Array.from({ length: 24 }, (_, h) => ({ label: h % 3 === 0 ? `${h}h` : '', value: u.hours.find(x => x.h === h)?.n ?? 0 }))
  const ages = ['-18', '18-24', '25-34', '35-44', '45-54', '55+'].map(k => ({ label: k, value: u.ages.find(a => a.k === k)?.n ?? 0 }))
  const noAge = u.ages.find(a => a.k === 'Sin dato')?.n ?? 0
  const devUsers = Math.max(1, u.devices.reduce((a, d) => a + d.users, 0))
  const installed = u.devices.reduce((a, d) => a + (d.installed ?? 0), 0)
  const all = mergeScreens(u)
  // Screens almost nobody opens: candidates to simplify, move or explain better.
  const least = all.filter(s => s.n > 0).slice(-5).reverse()

  return (
    <>
      <PageTitle title="Uso" sub="Qué pantallas abren, qué botones tocan y en qué momento. Solo se registra el nombre de la pantalla y del botón, nunca lo que la persona escribe."
        action={<PeriodTabs days={u.days} base="/admin/usage" />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Visitas (sesiones)" value={u.totals.sessions} hint={`en ${u.days} días`} />
        <Stat label="Sesiones por persona" value={(u.totals.sessions / Math.max(1, u.totals.mau)).toFixed(1)} />
        <Stat label="App instalada" value={`${pct(installed, devUsers)}%`} hint="la usan desde el ícono del teléfono" />
        <Stat label="En teléfono" value={`${pct(u.devices.find(d => d.k === 'mobile')?.users ?? 0, devUsers)}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Panel title="Pantallas más usadas" sub="Veces que se abrió cada pantalla.">
          <RankBars data={all.slice(0, 12).map(s => ({ label: screenName(s.k), value: s.n, hint: `${s.users} pers.` }))} />
        </Panel>
        <Panel title="Botones más tocados" sub="Por el texto del botón y la pantalla donde está.">
          <RankBars data={u.clicks.slice(0, 12).map(c => ({ label: `${c.k} · ${screenName(c.path ?? '')}`, value: c.n, hint: `${c.users} pers.` }))} />
        </Panel>

        {(['athlete', 'coach', 'admin'] as const).map(mode => {
          const rows = u.screens.filter(s => s.mode === mode).slice(0, 6)
          const m = u.modes.find(x => x.k === mode)
          return (
            <Panel key={mode} title={`Como ${MODE[mode].toLowerCase()}`} sub={m ? `${m.users} personas (${pct(m.users, totalUsers)}%) · ${m.events} acciones` : 'Sin actividad en el periodo.'}>
              <RankBars data={rows.map(s => ({ label: screenName(s.k), value: s.n }))} empty="Sin datos." />
            </Panel>
          )
        })}

        <Panel title="Puntos de frustración" sub="Toques repetidos y rápidos en el mismo lugar: suele significar que algo no responde o no se entiende.">
          <RankBars data={u.rage.map(r => ({ label: `${r.k} · ${screenName(r.path ?? '')}`, value: r.n, hint: `${r.users} pers.` }))} empty="Ninguno detectado. Bien." />
        </Panel>
        <Panel title="Horas de uso" sub="Visitas por hora del día (hora de Chile).">
          <Bars data={hours.map((h, i) => ({ ...h, label: h.label, hint: `${i}:00` }))} />
        </Panel>
        <Panel title="Días de uso" sub="Personas distintas por día de la semana.">
          <Bars data={WEEK_ORDER.map(d => ({ label: WEEKDAYS_SHORT[d], value: u.weekdays.find(x => x.d === d)?.n ?? 0 }))} />
        </Panel>
        <Panel title="Grupo etario" sub={`Según el año de nacimiento que cada persona indica. ${noAge} no lo han indicado.`}>
          <Bars data={ages} />
        </Panel>
        <Panel title="Dispositivo y versión">
          <RankBars data={u.devices.map(d => ({ label: DEVICE[d.k] ?? d.k, value: d.users, hint: `${pct(d.users, devUsers)}%` }))} />
          <div className="text-xs text-mu">Versiones en uso esta semana: {u.versions.map(v => `v${v.k} (${v.users})`).join(' · ') || 'sin datos'}</div>
          <div className="text-xs text-mu">Categoría: {u.sex.map(s => `${s.k === 'm' ? 'Masculino' : s.k === 'f' ? 'Femenino' : 'Sin dato'} ${s.n}`).join(' · ')}</div>
        </Panel>
        <Panel title="Lo menos usado" sub="Pantallas que casi nadie abre: candidatas a simplificar, mover o explicar mejor.">
          <RankBars data={least.map(s => ({ label: screenName(s.k), value: s.n, hint: `${s.users} pers.` }))} empty="Sin datos." />
        </Panel>
      </div>
    </>
  )
}
