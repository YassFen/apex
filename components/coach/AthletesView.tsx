'use client'
import { useMemo, useState } from 'react'
import { Search, Share2, UserPlus, AlertCircle } from '@/components/ui/icons'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'
import { cn, roleLabel } from '@/lib/utils/cn'
import type { Profile, Box } from '@/lib/types/database'

export interface AthleteRow {
  id: string
  name: string
  email: string
  city: string | null
  avatar: string | null
  role: string
  joinedAt: string
  wods30: number
  lastResultAt: string | null
  isMe: boolean
}

type Filter = 'all' | 'active' | 'inactive'
const INACTIVE_DAYS = 7

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function lastSeenLabel(days: number | null): string {
  if (days === null) return 'Sin resultados aún'
  if (days === 0) return 'Entrenó hoy'
  if (days === 1) return 'Entrenó ayer'
  return `Último WOD hace ${days} días`
}

export function AthletesView({ profile, box, rows, wodsPublished }: { profile: Profile; box: Box; rows: AthleteRow[]; wodsPublished: number }) {
  const { fire } = useToast()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  // The coach is a member of their own box; list only the athletes.
  const athletes = rows.filter(r => !r.isMe)

  const isInactive = (r: AthleteRow) => {
    const d = daysSince(r.lastResultAt ?? r.joinedAt)
    return d !== null && d >= INACTIVE_DAYS
  }
  const inactiveCount = athletes.filter(isInactive).length

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return athletes
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
      .filter(r => filter === 'all' ? true : filter === 'inactive' ? isInactive(r) : !isInactive(r))
      .sort((a, b) => b.wods30 - a.wods30)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athletes, query, filter])

  async function invite() {
    const text = `Únete a ${box.name} en APEX: ${location.origin}/auth/register — código de invitación: ${box.invite_code}`
    if (navigator.share) {
      try { await navigator.share({ title: `APEX · ${box.name}`, text }) } catch { /* cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(text); fire('Invitación copiada. Pégala en WhatsApp.', 'ok') } catch {}
    }
  }

  return (
    <>
      <Topbar title="Atletas" profile={profile} actions={
        <button type="button" onClick={invite} aria-label="Invitar atletas"
          className="inline-flex items-center gap-1.5 h-10 px-3 sm:px-4 rounded-full bg-ac text-onac text-sm font-bold hover:bg-ac/90 transition active:scale-95">
          <UserPlus size={16} aria-hidden /><span className="hidden sm:inline">Invitar</span>
        </button>
      } />

      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-2xl w-full">
        {athletes.length === 0 ? (
          <Card className="text-center py-12 flex flex-col items-center gap-3">
            <div className="size-14 rounded-2xl bg-ac/15 text-ac grid place-items-center animate-pop">
              <UserPlus size={26} aria-hidden />
            </div>
            <h2 className="font-display text-2xl font-extrabold tracking-tight">Suma a tus atletas</h2>
            <p className="text-mu text-sm max-w-xs text-pretty">Comparte este código. Lo ingresan al registrarse o en su perfil, y aparecen aquí.</p>
            <div className="font-display text-4xl font-extrabold tracking-[0.2em] text-ac select-all my-1">{box.invite_code}</div>
            <button type="button" onClick={invite}
              className="h-12 px-6 rounded-full bg-ac text-onac font-bold flex items-center gap-2 active:scale-95 transition-transform">
              <Share2 size={18} aria-hidden /> Compartir invitación
            </button>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 stagger">
              <Stat label="Atletas" value={athletes.length} />
              <Stat label="WODs · 30 días" value={wodsPublished} />
              <Stat label="Inactivos" value={inactiveCount} tone={inactiveCount > 0 ? 'text-or' : undefined} />
            </div>

            <label className="relative block">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-fa" aria-hidden />
              <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre o email"
                aria-label="Buscar atleta"
                className="w-full h-12 pl-11 pr-4 rounded-2xl bg-p text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 placeholder:text-fa" />
            </label>

            <div role="tablist" aria-label="Filtrar atletas" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-p2">
              {([['all', 'Todos'], ['active', 'Activos'], ['inactive', `Inactivos${inactiveCount ? ` · ${inactiveCount}` : ''}`]] as [Filter, string][]).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                  className={cn('min-h-10 rounded-xl text-sm font-bold transition-colors', filter === k ? 'bg-p3 text-t' : 'text-mu hover:text-t')}>
                  {label}
                </button>
              ))}
            </div>

            {filter === 'inactive' && inactiveCount > 0 && (
              <div className="flex gap-2.5 p-3.5 rounded-2xl bg-or/10 text-or text-sm">
                <AlertCircle size={18} className="flex-shrink-0 mt-px" aria-hidden />
                <span className="text-pretty">Llevan {INACTIVE_DAYS}+ días sin registrar un WOD. Un mensaje a tiempo ayuda a que no se vayan.</span>
              </div>
            )}

            <ul className="flex flex-col gap-2 stagger">
              {shown.map(r => {
                const days = daysSince(r.lastResultAt)
                const inactive = isInactive(r)
                const initials = r.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <li key={r.id} className="flex items-center gap-3 p-3.5 rounded-2xl bg-p">
                    {r.avatar ? (
                      <img src={r.avatar} alt="" className="size-11 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <span className="size-11 rounded-full bg-p3 grid place-items-center font-bold text-sm text-mu flex-shrink-0">{initials}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{r.name}</span>
                        {r.role !== 'athlete' && (
                          <span className="px-1.5 py-0.5 rounded-full bg-ac/15 text-ac text-[10px] font-bold uppercase">{roleLabel(r.role)}</span>
                        )}
                      </div>
                      <div className={cn('text-xs mt-0.5 flex items-center gap-1.5', inactive ? 'text-or' : 'text-mu')}>
                        {inactive && <span className="size-1.5 rounded-full bg-or" aria-hidden />}
                        {lastSeenLabel(days)}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-display text-2xl font-extrabold tabular-nums leading-none tracking-tight">{r.wods30}</div>
                      <div className="text-[10px] text-fa mt-0.5">WODs / 30d</div>
                    </div>
                  </li>
                )
              })}
              {shown.length === 0 && <li className="text-center text-mu text-sm py-8">Ningún atleta coincide.</li>}
            </ul>
          </>
        )}
      </div>
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card padding={false} className="p-4">
      <div className={cn('font-display text-3xl font-extrabold tabular-nums leading-none tracking-tight', tone)}>{value}</div>
      <div className="text-[11px] text-mu mt-1.5 leading-tight">{label}</div>
    </Card>
  )
}
