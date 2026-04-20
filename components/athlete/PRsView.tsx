'use client'
import { useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PRModal } from './PRModal'
import type { Profile, Movement } from '@/lib/types/database'

const CATEGORIES = ['all', 'weightlifting', 'olympic', 'gymnastics', 'cardio']
const CAT_LABELS: Record<string, string> = {
  all: 'Todos', weightlifting: 'Halterofilia', olympic: 'Olímpicos',
  gymnastics: 'Gymnastics', cardio: 'Cardio',
}

export function PRsView({ profile, prs, movements }: { profile: Profile; prs: any[]; movements: Movement[] }) {
  const [cat, setCat]       = useState('all')
  const [movFilter, setMov] = useState('all')
  const [prModalOpen, setPrModalOpen] = useState(false)

  const filtered = prs.filter(pr => {
    if (cat !== 'all' && pr.movements?.category !== cat) return false
    if (movFilter !== 'all' && pr.movement_id !== movFilter) return false
    return true
  })

  // Group by movement to show current PR vs history
  const byMovement: Record<string, any[]> = {}
  filtered.forEach(pr => {
    const key = pr.movements?.name ?? pr.movement_id
    ;(byMovement[key] = byMovement[key] ?? []).push(pr)
  })

  const unit = profile.preferred_unit

  return (
    <>
      <Topbar title="Historial & PRs" onMenuClick={() => {}} profile={profile}
        actions={
          <Button onClick={() => setPrModalOpen(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span className="hidden sm:inline">Nuevo PR</span>
          </Button>
        }
      />

      <div className="p-4 lg:p-6 flex flex-col gap-4">
        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`px-3.5 py-2 rounded-full border text-xs font-bold transition-all ${
                cat === c
                  ? 'bg-ac/10 text-ac border-ac/22'
                  : 'border-[var(--ln2)] text-mu hover:text-t hover:border-mu'
              }`}>
              {CAT_LABELS[c]}
            </button>
          ))}
        </div>

        {/* Table */}
        {Object.keys(byMovement).length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-mu text-sm">No hay PRs en esta categoría.</div>
            <button onClick={() => setPrModalOpen(true)} className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ac/8 border border-ac/18 text-ac text-sm font-bold hover:bg-ac/14 transition-colors">
              + Agregar primer PR
            </button>
          </Card>
        ) : (
          Object.entries(byMovement).map(([movName, records]) => {
            const pr = records.find(r => r.is_pr) ?? records[0]
            const history = records.filter(r => r.id !== pr.id)
            return (
              <Card key={movName} padding={false}>
                {/* Movement header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--ln)]">
                  <div>
                    <div className="font-semibold">{movName}</div>
                    <div className="text-mu text-[11px] capitalize">{pr.movements?.category}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-barlow text-[32px] font-black leading-none text-ac">
                      {unit === 'kg' ? Math.round(pr.value_lb * 0.453592) : pr.value_lb}
                      <span className="text-[13px] text-mu font-normal ml-1">{unit}</span>
                    </div>
                    <Badge color="lime">PR</Badge>
                  </div>
                </div>
                {/* History rows */}
                {history.length > 0 && (
                  <div className="divide-y divide-[rgba(255,255,255,.04)]">
                    {history.slice(0, 5).map(r => (
                      <div key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-white/[.02] transition-colors">
                        <div className="text-mu text-sm">
                          {new Date(r.recorded_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <div className="font-barlow text-xl font-bold">
                          {unit === 'kg' ? Math.round(r.value_lb * 0.453592) : r.value_lb}
                          <span className="text-[11px] text-mu font-normal ml-1">{unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })
        )}
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
