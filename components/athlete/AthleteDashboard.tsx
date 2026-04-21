'use client'
import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Settings2, Flame, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PRModal } from '@/components/athlete/PRModal'
import { StrengthChart } from '@/components/athlete/StrengthChart'
import { RmCelebrationModal } from '@/components/athlete/RmCelebrationModal'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import type { Profile } from '@/lib/types/database'

interface PR {
  id: string
  value_lb: number
  recorded_at: string
  movements: { name: string; category: string } | null
  metric: string
  is_pr: boolean
}

const DEFAULT_KPI = ['Deadlift', 'Back Squat', 'Squat Snatch', 'Clean & Jerk']
const KPI_STORAGE_KEY = 'apex.dashboard.kpis'

function formatPrValue(pr: PR, unit: 'kg' | 'lb'): { value: string; unit: string } {
  const metric = pr.metric ?? '1rm'
  const raw = pr.value_lb ?? 0
  if (metric === 'time') {
    const tot = Math.round(raw); const m = Math.floor(tot / 60); const s = tot % 60
    return { value: `${m}:${String(s).padStart(2, '0')}`, unit: 'min' }
  }
  if (metric === 'max_reps' && pr.movements?.category === 'cardio') {
    // calories stored as max_reps under cardio
    return { value: String(Math.round(raw)), unit: 'cal' }
  }
  if (metric === 'max_reps') return { value: String(Math.round(raw)), unit: 'reps' }
  if (unit === 'kg') return { value: String(Math.round(raw * 0.453592)), unit: 'kg' }
  return { value: String(Math.round(raw)), unit: 'lb' }
}

function computeStreakDays(prs: PR[]): number {
  if (prs.length === 0) return 0
  const days = new Set(prs.map(p => new Date(p.recorded_at).toISOString().slice(0, 10)))
  let streak = 0
  const cursor = new Date()
  for (;;) {
    const key = cursor.toISOString().slice(0, 10)
    if (days.has(key)) { streak++; cursor.setDate(cursor.getDate() - 1) }
    else if (streak === 0) { cursor.setDate(cursor.getDate() - 1); if (streak === 0 && (new Date().getTime() - cursor.getTime()) > 86400000) break }
    else break
  }
  return streak
}

export function AthleteDashboard({ profile, prs }: { profile: Profile; prs: PR[] }) {
  const [prModalOpen, setPrModalOpen] = useState(false)
  const [celebration, setCelebration] = useState<{ open: boolean; isNew: boolean; diff: number }>({ open: false, isNew: false, diff: 0 })
  const [editKpis, setEditKpis] = useState(false)
  const unit = profile.preferred_unit

  // All distinct movement names ever recorded, for customization picker
  const allMovementNames = useMemo(() =>
    Array.from(new Set(prs.map(p => p.movements?.name).filter(Boolean))) as string[],
    [prs]
  )

  // KPI movements — SSR-safe: start with default, sync from localStorage after mount
  const [kpiMovements, setKpiMovements] = useState<string[]>(DEFAULT_KPI)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KPI_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length) setKpiMovements(parsed.slice(0, 4))
      }
    } catch {}
  }, [])

  function saveKpis(next: string[]) {
    setKpiMovements(next)
    try { localStorage.setItem(KPI_STORAGE_KEY, JSON.stringify(next)) } catch {}
  }

  // For each KPI show best PR + previous record
  const kpiPRs = kpiMovements.map(name => {
    const sorted = prs
      .filter(p => p.movements?.name === name)
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    const best = sorted.find(p => p.is_pr) ?? sorted[0]
    const previous = sorted.filter(p => p.id !== best?.id).sort((a, b) => {
      if (a.metric === 'time') return a.value_lb - b.value_lb
      return b.value_lb - a.value_lb
    })[0]
    return { name, best, previous }
  })

  const topPRs = prs.slice(0, 5)

  const strengthMovements = useMemo(() => {
    const names = Array.from(new Set(
      prs
        .filter(p => (p.metric === '1rm' || p.metric === '2rm' || p.metric === '3rm') && p.movements?.name)
        .map(p => p.movements!.name)
    ))
    return names.length > 0 ? names : DEFAULT_KPI
  }, [prs])

  const [selectedMovement, setSelectedMovement] = useState<string>(() =>
    prs.find(p => (p.metric === '1rm' || p.metric === '2rm' || p.metric === '3rm'))?.movements?.name ?? 'Deadlift'
  )

  const totalRecords = prs.length
  const streak = useMemo(() => computeStreakDays(prs), [prs])

  function toggleKpi(name: string) {
    if (kpiMovements.includes(name)) {
      if (kpiMovements.length <= 1) return
      saveKpis(kpiMovements.filter(n => n !== name))
    } else if (kpiMovements.length < 4) {
      saveKpis([...kpiMovements, name])
    }
  }

  return (
    <>
      <Topbar
        title="Dashboard"
        profile={profile}
        actions={
          <Button onClick={() => setPrModalOpen(true)} size="md">
            <Plus size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">Nuevo registro</span>
          </Button>
        }
      />

      <div className="p-4 lg:p-6 flex flex-col gap-4">

        {/* Mini stats row */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3">
            <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1">Records</div>
            <div className="font-barlow text-3xl font-black leading-none">{totalRecords}</div>
            <div className="text-fa text-[11px] mt-0.5">RMs registrados</div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1">Racha</div>
            <div className="font-barlow text-3xl font-black leading-none flex items-center gap-1.5">
              {streak}
              {streak > 0 && <Flame size={18} className="text-or" fill="currentColor" />}
            </div>
            <div className="text-fa text-[11px] mt-0.5">{streak === 1 ? 'día' : 'días'} consecutivos</div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1">PRs activos</div>
            <div className="font-barlow text-3xl font-black leading-none flex items-center gap-1.5">
              {prs.filter(p => p.is_pr).length}
              <Trophy size={16} className="text-ac" />
            </div>
            <div className="text-fa text-[11px] mt-0.5">máximos vigentes</div>
          </Card>
        </div>

        {/* KPI Cards */}
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[1.8px] text-fa font-bold">Destacados</div>
          <button onClick={() => setEditKpis(v => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-fa hover:text-t transition-colors">
            <Settings2 size={12} /> {editKpis ? 'Listo' : 'Personalizar'}
          </button>
        </div>

        {editKpis ? (
          <Card className="p-4">
            <div className="text-[11px] text-mu mb-2">Selecciona hasta 4 movimientos para destacar ({kpiMovements.length}/4):</div>
            <div className="flex flex-wrap gap-2">
              {(allMovementNames.length ? allMovementNames : DEFAULT_KPI).map(name => {
                const active = kpiMovements.includes(name)
                return (
                  <button key={name} onClick={() => toggleKpi(name)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      active ? 'bg-ac/15 text-ac border-ac/30' : 'border-[var(--ln)] text-mu hover:text-t'
                    }`}>
                    {name}
                  </button>
                )
              })}
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {kpiPRs.map((slot, i) => {
              const pr = slot.best
              const prev = slot.previous
              const prFmt = pr ? formatPrValue(pr, unit) : null
              const prevFmt = prev ? formatPrValue(prev, unit) : null
              return (
                <Card key={i} className="p-[18px]">
                  <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2.5">
                    {slot.name}
                  </div>
                  {pr && prFmt ? (
                    <>
                      <div className="font-barlow text-[46px] lg:text-[50px] font-black leading-none">
                        {prFmt.value}
                        <span className="text-[16px] text-mu font-normal ml-1">{prFmt.unit}</span>
                      </div>
                      <div className="text-fa text-[11px] mt-1">
                        {prevFmt ? <>Anterior: {prevFmt.value} {prevFmt.unit}</> : 'Primer registro'}
                      </div>
                      <Badge color="lime" className="mt-2">★ RM</Badge>
                    </>
                  ) : (
                    <div className="font-barlow text-3xl font-black text-fa">—</div>
                  )}
                </Card>
              )
            })}
          </div>
        )}

        {/* Chart + Top RMs */}
        <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
          <Card padding={false} className="p-5">
            <div className="flex items-center justify-between mb-4 gap-2">
              <div className="font-barlow text-[17px] font-extrabold tracking-wide uppercase">Evolución de fuerza</div>
              <select
                value={selectedMovement}
                onChange={e => setSelectedMovement(e.target.value)}
                className="bg-p3 border border-[var(--ln)] rounded-xl px-3 py-2 text-sm text-t outline-none focus:border-ac max-w-[180px]"
              >
                {strengthMovements.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="h-[280px]">
              <StrengthChart prs={prs} movement={selectedMovement} unit={unit} />
            </div>
          </Card>

          <Card padding={false} className="p-5">
            <div className="font-barlow text-[17px] font-extrabold tracking-wide uppercase mb-4">
              Tops RM actuales
              <span className="text-[10px] text-fa font-normal font-sans tracking-normal ml-2">↗ click para historial</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {topPRs.length === 0 && (
                <p className="text-mu text-sm">Aún no hay RMs registrados. ¡Empieza ahora!</p>
              )}
              {topPRs.map(pr => {
                const fmt = formatPrValue(pr, unit)
                return (
                  <Link key={pr.id} href="/prs"
                    className="flex items-center justify-between p-3 bg-p3 rounded-xl hover:bg-[#232c39] transition-colors cursor-pointer">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{pr.movements?.name}</div>
                      <div className="text-mu text-[11px]">
                        {new Date(pr.recorded_at).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div className="font-barlow text-[26px] font-extrabold text-ac whitespace-nowrap">
                      {fmt.value}
                      <span className="text-[12px] text-mu font-normal ml-1">{fmt.unit}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
            {prs.length > 5 && (
              <Link href="/prs" className="block mt-3 text-center text-ac text-xs font-bold hover:underline">
                Ver todos los RMs →
              </Link>
            )}
          </Card>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-3 gap-3.5">
          {[
            { href: '/wod',        label: 'WOD del Día',  desc: 'Ver entrenamiento',  color: 'text-ac', bg: 'bg-ac/10 border-ac/20' },
            { href: '/timer',      label: 'Timer',         desc: 'Iniciar workout',    color: 'text-bl', bg: 'bg-bl/10 border-bl/20' },
            { href: '/benchmarks', label: 'Benchmarks',    desc: 'Girls & Heroes',     color: 'text-or', bg: 'bg-or/10 border-or/20' },
          ].map(item => (
            <Link key={item.href} href={item.href}>
              <Card className={`p-4 border ${item.bg} hover:scale-[1.02] active:scale-[.98] transition-transform cursor-pointer`}>
                <div className={`font-barlow text-[15px] font-extrabold tracking-wide uppercase ${item.color}`}>{item.label}</div>
                <div className="text-mu text-xs mt-0.5">{item.desc}</div>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {prModalOpen && (
        <PRModal
          profile={profile}
          onClose={() => setPrModalOpen(false)}
          onSaved={(isNew, diff) => {
            setPrModalOpen(false)
            setCelebration({ open: true, isNew: !!isNew, diff: diff ?? 0 })
          }}
        />
      )}

      {celebration.open && (
        <RmCelebrationModal
          isNew={celebration.isNew}
          onClose={() => { setCelebration({ open: false, isNew: false, diff: 0 }); window.location.reload() }}
        />
      )}
    </>
  )
}
