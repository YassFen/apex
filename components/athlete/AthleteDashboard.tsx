'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PRModal } from '@/components/athlete/PRModal'
import { StrengthChart } from '@/components/athlete/StrengthChart'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { useShell } from '@/lib/hooks/useShell'
import type { Profile } from '@/lib/types/database'
import { formatWeight } from '@/lib/utils/units'

interface PR {
  id: string
  value_lb: number
  recorded_at: string
  movements: { name: string; category: string } | null
  metric: string
  is_pr: boolean
}

export function AthleteDashboard({ profile, prs }: { profile: Profile; prs: PR[] }) {
  const [prModalOpen, setPrModalOpen] = useState(false)
  const unit = profile.preferred_unit

  const topPRs = prs.slice(0, 5)
  const kpiMovements = ['Deadlift', 'Back Squat', 'Squat Snatch', 'Clean & Jerk']
  const kpiPRs = kpiMovements.map(name => prs.find(p => p.movements?.name === name))

  const today = new Date().toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })

  return (
    <>
      <Topbar
        title="Dashboard"
        onMenuClick={() => {}}
        profile={profile}
        actions={
          <Button onClick={() => setPrModalOpen(true)} size="md">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span className="hidden sm:inline">Registrar PR</span>
          </Button>
        }
      />

      <div className="p-4 lg:p-6 flex flex-col gap-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {kpiPRs.map((pr, i) => (
            <Card key={i} className="p-[18px]">
              <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2.5">
                {kpiMovements[i]}
              </div>
              {pr ? (
                <>
                  <div className="font-barlow text-[46px] lg:text-[50px] font-black leading-none">
                    {unit === 'kg'
                      ? Math.round(pr.value_lb * 0.453592)
                      : pr.value_lb}
                    <span className="text-[16px] text-mu font-normal ml-1">{unit}</span>
                  </div>
                  <div className="text-mu text-[13px] mt-0.5">
                    {unit === 'kg'
                      ? `${pr.value_lb} lbs`
                      : `${Math.round(pr.value_lb * 0.453592)} kg`}
                  </div>
                  <Badge color="lime" className="mt-2">★ PR</Badge>
                </>
              ) : (
                <div className="font-barlow text-3xl font-black text-fa">—</div>
              )}
            </Card>
          ))}
        </div>

        {/* Chart + Top PRs */}
        <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
          <Card padding={false} className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-barlow text-[17px] font-extrabold tracking-wide uppercase">Evolución de fuerza</div>
              <select className="bg-p3 border border-[var(--ln)] rounded-xl px-3 py-2 text-sm text-t outline-none focus:border-ac">
                <option>Deadlift</option>
                <option>Back Squat</option>
                <option>Squat Snatch</option>
                <option>Power Clean</option>
              </select>
            </div>
            <div className="h-[280px]">
              <StrengthChart prs={prs} />
            </div>
          </Card>

          <Card padding={false} className="p-5">
            <div className="font-barlow text-[17px] font-extrabold tracking-wide uppercase mb-4">
              Top PRs actuales
              <span className="text-[10px] text-fa font-normal font-sans tracking-normal ml-2">↗ click para historial</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {topPRs.length === 0 && (
                <p className="text-mu text-sm">Aún no hay PRs registrados. ¡Empieza ahora!</p>
              )}
              {topPRs.map(pr => (
                <Link key={pr.id} href="/prs"
                  className="flex items-center justify-between p-3 bg-p3 rounded-xl hover:bg-[#232c39] transition-colors cursor-pointer">
                  <div>
                    <div className="font-semibold text-sm">{pr.movements?.name}</div>
                    <div className="text-mu text-[11px]">
                      {new Date(pr.recorded_at).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="font-barlow text-[26px] font-extrabold text-ac">
                    {unit === 'kg' ? Math.round(pr.value_lb * 0.453592) : pr.value_lb}
                    <span className="text-[12px] text-mu font-normal ml-1">{unit}</span>
                  </div>
                </Link>
              ))}
            </div>
            {prs.length > 5 && (
              <Link href="/prs" className="block mt-3 text-center text-ac text-xs font-bold hover:underline">
                Ver todos los PRs →
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
          onSaved={() => { setPrModalOpen(false); window.location.reload() }}
        />
      )}
    </>
  )
}
