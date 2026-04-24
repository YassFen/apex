'use client'
import { useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Minus as MinusIcon, LayoutGrid, List } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PRModal } from './PRModal'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Movement } from '@/lib/types/database'

// Logical filter buckets — Olympic + Weightlifting collapsed into one "Levantamiento"
const CATEGORIES = ['all', 'lifting', 'gymnastics', 'cardio', 'benchmark']
const CAT_LABELS: Record<string, string> = {
  all: 'Todos',
  lifting: 'Levantamiento',
  gymnastics: 'Gimnástico',
  cardio: 'Monoestructural',
  benchmark: 'Benchmarks',
}
// Map a DB category to a filter bucket
const CAT_BUCKET: Record<string, string> = {
  weightlifting: 'lifting',
  olympic: 'lifting',
  gymnastics: 'gymnastics',
  cardio: 'cardio',
  benchmark: 'benchmark',
}

const CAT_BADGE: Record<string, { cls: string; label: string }> = {
  weightlifting: { cls: 'bg-ac/10 text-ac', label: 'LEVANTAMIENTO' },
  olympic:       { cls: 'bg-ac/10 text-ac', label: 'LEVANTAMIENTO' },
  gymnastics:    { cls: 'bg-bl/10 text-bl', label: 'GIMNÁSTICO' },
  cardio:        { cls: 'bg-pu/10 text-pu', label: 'MONOESTRUCTURAL' },
  benchmark:     { cls: 'bg-or/10 text-or', label: 'BENCHMARK' },
}

function formatValue(pr: any, preferredUnit: 'kg' | 'lb'): { value: string; unit: string } {
  const metric: string = pr.metric ?? '1rm'
  const raw: number = pr.value_lb ?? 0

  if (metric === 'time') {
    const totalSecs = Math.round(raw)
    const m = Math.floor(totalSecs / 60); const s = totalSecs % 60
    return { value: `${m}:${String(s).padStart(2, '0')}`, unit: 'min' }
  }
  if (metric === 'max_reps' && pr.movements?.category === 'cardio') {
    return { value: String(Math.round(raw)), unit: 'cal' }
  }
  if (metric === 'max_reps') return { value: String(Math.round(raw)), unit: 'reps' }
  if (preferredUnit === 'kg') return { value: String(Math.round(raw * 0.453592)), unit: 'kg' }
  return { value: String(Math.round(raw)), unit: 'lb' }
}

function MetricBadge({ metric }: { metric: string }) {
  const labels: Record<string, string> = {
    '1rm': '1RM', '2rm': '2RM', '3rm': '3RM', 'max_reps': 'Máx. Reps', 'time': 'Tiempo',
  }
  return <Badge color="lime">{labels[metric] ?? metric}</Badge>
}

export function PRsView({ profile, prs, movements }: { profile: Profile; prs: any[]; movements: Movement[] }) {
  const [cat, setCat]                 = useState('all')
  const [view, setView]               = useState<'table' | 'cards'>('table')
  const [prModalOpen, setPrModalOpen] = useState(false)
  const [editingPr, setEditingPr]     = useState<any>(null)
  const [deletingId, setDeletingId]   = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return
    setDeletingId(id)
    const supabase = createClient()
    const { error } = await supabase.from('pr_records').delete().eq('id', id)
    setDeletingId(null)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    window.location.reload()
  }

  function handleEdit(pr: any) { setEditingPr(pr); setPrModalOpen(true) }
  function closeModal() { setPrModalOpen(false); setEditingPr(null) }

  const filtered = prs.filter(pr => {
    if (cat === 'all') return true
    const bucket = CAT_BUCKET[pr.movements?.category as string] ?? 'other'
    return bucket === cat
  })

  // Group by movement, find best + previous
  const movementSummaries = useMemo(() => {
    const byMov: Record<string, any[]> = {}
    filtered.forEach(pr => {
      const key = pr.movements?.name ?? pr.movement_id
      ;(byMov[key] = byMov[key] ?? []).push(pr)
    })
    return Object.entries(byMov).map(([name, records]) => {
      // Sort newest first
      records.sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
      const best = records.find(r => r.is_pr) ?? records[0]
      const latest = records[0]
      const prevBest = records.filter(r => r.id !== best.id)[0] ?? null
      return { name, records, best, latest, prevBest, category: best.movements?.category }
    })
  }, [filtered])

  // For grouped/cards view
  const byMovement: Record<string, any[]> = {}
  filtered.forEach(pr => {
    const key = pr.movements?.name ?? pr.movement_id
    ;(byMovement[key] = byMovement[key] ?? []).push(pr)
  })

  const unit = profile.preferred_unit

  return (
    <>
      <Topbar title="Historial & RMs" profile={profile}
        actions={
          <Button onClick={() => { setEditingPr(null); setPrModalOpen(true) }}>
            <Plus size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">Nuevo registro</span>
          </Button>
        }
      />

      <div className="p-4 lg:p-6 flex flex-col gap-4">
        {/* Filters + view toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-2 flex-wrap flex-1">
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
          <div className="flex items-center gap-1 p-1 rounded-xl bg-p border border-[var(--ln)]">
            <button onClick={() => setView('table')}
                    className={`p-1.5 rounded-lg transition ${view === 'table' ? 'bg-ac text-bg' : 'text-mu hover:text-t'}`}
                    aria-label="Vista tabla">
              <List size={15} strokeWidth={2.2} />
            </button>
            <button onClick={() => setView('cards')}
                    className={`p-1.5 rounded-lg transition ${view === 'cards' ? 'bg-ac text-bg' : 'text-mu hover:text-t'}`}
                    aria-label="Vista cards">
              <LayoutGrid size={15} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {movementSummaries.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-mu text-sm">No hay registros en esta categoría.</div>
            <button onClick={() => { setEditingPr(null); setPrModalOpen(true) }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ac/8 border border-ac/18 text-ac text-sm font-bold hover:bg-ac/14 transition-colors">
              <Plus size={14} strokeWidth={2.5} /> Agregar primer RM
            </button>
          </Card>
        ) : view === 'table' ? (
          /* V3 TABLE VIEW: Movement | Cat | Last | PR | Trend */
          <Card padding={false} className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse table-fixed sm:table-auto">
                <thead>
                  <tr className="bg-p2">
                    <th className="text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold py-3.5 px-3 sm:px-4">Movimiento</th>
                    <th className="text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold py-3.5 px-4 hidden md:table-cell">Cat.</th>
                    <th className="text-right text-[10px] uppercase tracking-[1.6px] text-fa font-bold py-3.5 px-4 hidden sm:table-cell">Último</th>
                    <th className="text-right text-[10px] uppercase tracking-[1.6px] text-fa font-bold py-3.5 px-3 sm:px-4">RM</th>
                    <th className="text-center text-[10px] uppercase tracking-[1.6px] text-fa font-bold py-3.5 px-2 sm:px-4 hidden sm:table-cell">Tend.</th>
                    <th className="py-3.5 px-1 sm:px-2 w-12 sm:w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {movementSummaries.map(({ name, best, latest, prevBest, category }) => {
                    const bestF = formatValue(best, unit)
                    const latestF = formatValue(latest, unit)
                    const badge = CAT_BADGE[category as string] ?? { cls: 'bg-mu/10 text-mu', label: 'OTRO' }

                    // Trend logic: compare best vs prevBest (only for weight metrics; for time, lower is better)
                    let trend: 'up' | 'down' | 'flat' = 'flat'
                    let trendLabel = '—'
                    if (prevBest && best.metric !== 'time') {
                      const diff = (best.value_lb ?? 0) - (prevBest.value_lb ?? 0)
                      if (diff > 0) { trend = 'up'; trendLabel = `+${Math.round(unit === 'kg' ? diff * 0.453592 : diff)}` }
                      else if (diff < 0) { trend = 'down'; trendLabel = String(Math.round(unit === 'kg' ? diff * 0.453592 : diff)) }
                    }
                    if (prevBest && best.metric === 'time') {
                      const diff = (best.value_lb ?? 0) - (prevBest.value_lb ?? 0)
                      // Lower time = better
                      if (diff < 0) { trend = 'up'; trendLabel = `${Math.round(diff)}s` }
                      else if (diff > 0) { trend = 'down'; trendLabel = `+${Math.round(diff)}s` }
                    }

                    const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : MinusIcon
                    const trendColor = trend === 'up' ? 'text-gr' : trend === 'down' ? 'text-rd' : 'text-fa'

                    return (
                      <tr key={name}
                          className="border-b border-[rgba(255,255,255,.04)] hover:bg-white/[.02] transition cursor-pointer"
                          onClick={() => handleEdit(best)}>
                        <td className="py-3 px-3 sm:px-4">
                          <div className="font-semibold text-t text-sm truncate">{name}</div>
                          <div className="flex items-center gap-2 mt-0.5 md:hidden">
                            <span className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide ${badge.cls}`}>
                              {badge.label}
                            </span>
                            {/* Inline previous value on mobile (replaces hidden "Último" column) */}
                            <span className="text-fa text-[11px] sm:hidden whitespace-nowrap">
                              ant. {latestF.value} {latestF.unit}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right hidden sm:table-cell">
                          <div className="font-barlow text-base font-bold text-mu">
                            {latestF.value}
                            <span className="text-[10px] text-fa font-normal ml-1">{latestF.unit}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 sm:px-4 text-right whitespace-nowrap">
                          <div className="font-barlow text-lg sm:text-xl font-black text-ac">
                            {bestF.value}
                            <span className="text-[11px] text-mu font-normal ml-1">{bestF.unit}</span>
                          </div>
                          {/* Inline trend on mobile (column hidden) */}
                          <div className={`flex items-center justify-end gap-1 ${trendColor} font-bold text-[10px] sm:hidden mt-0.5`}>
                            <TrendIcon size={11} strokeWidth={2.5} />
                            {trendLabel !== '—' && <span>{trendLabel}</span>}
                          </div>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-center hidden sm:table-cell">
                          <div className={`inline-flex items-center gap-1 ${trendColor} font-bold text-xs`}>
                            <TrendIcon size={14} strokeWidth={2.5} />
                            {trendLabel !== '—' && <span>{trendLabel}</span>}
                          </div>
                        </td>
                        <td className="py-3 px-1 sm:px-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5 justify-end">
                            <button onClick={() => handleEdit(best)} aria-label="Editar"
                                    className="p-1.5 rounded-lg text-fa hover:text-ac hover:bg-p3 transition-colors">
                              <Pencil size={13} strokeWidth={2} />
                            </button>
                            <button onClick={() => handleDelete(best.id)} aria-label="Eliminar"
                                    disabled={deletingId === best.id}
                                    className="p-1.5 rounded-lg text-fa hover:text-rd hover:bg-rd/10 transition-colors disabled:opacity-50">
                              <Trash2 size={13} strokeWidth={2} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          /* CARDS / GROUPED VIEW (legacy expanded) */
          Object.entries(byMovement).map(([movName, records]) => {
            const best = records.find(r => r.is_pr) ?? records[0]
            const history = records.filter(r => r.id !== best.id)
            const bestFmt = formatValue(best, unit)

            return (
              <Card key={movName} padding={false}>
                <div className="flex items-center justify-between p-4 border-b border-[var(--ln)] gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{movName}</div>
                    <div className="text-mu text-[11px] capitalize mt-0.5">
                      {best.movements?.category} · <span className="uppercase tracking-wide">{best.metric}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-barlow text-[32px] font-black leading-none text-ac">
                      {bestFmt.value}
                      <span className="text-[13px] text-mu font-normal ml-1">{bestFmt.unit}</span>
                    </div>
                    <div className="flex items-center gap-2 justify-end mt-1">
                      <MetricBadge metric={best.metric} />
                      <button onClick={() => handleEdit(best)} aria-label="Editar"
                              className="p-1.5 rounded-lg text-fa hover:text-ac hover:bg-p3 transition-colors">
                        <Pencil size={14} strokeWidth={2} />
                      </button>
                      <button onClick={() => handleDelete(best.id)} aria-label="Eliminar"
                              disabled={deletingId === best.id}
                              className="p-1.5 rounded-lg text-fa hover:text-rd hover:bg-rd/10 transition-colors disabled:opacity-50">
                        <Trash2 size={14} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </div>

                {history.length > 0 && (
                  <div className="divide-y divide-[rgba(255,255,255,.04)]">
                    {history.slice(0, 5).map(r => {
                      const fmt = formatValue(r, unit)
                      return (
                        <div key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-white/[.02] transition-colors gap-3">
                          <div className="text-mu text-sm flex-1 min-w-0">
                            {new Date(r.recorded_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                          <div className="font-barlow text-xl font-bold">
                            {fmt.value}
                            <span className="text-[11px] text-mu font-normal ml-1">{fmt.unit}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleEdit(r)} aria-label="Editar"
                                    className="p-1.5 rounded-lg text-fa hover:text-ac hover:bg-p3 transition-colors">
                              <Pencil size={13} strokeWidth={2} />
                            </button>
                            <button onClick={() => handleDelete(r.id)} aria-label="Eliminar"
                                    disabled={deletingId === r.id}
                                    className="p-1.5 rounded-lg text-fa hover:text-rd hover:bg-rd/10 transition-colors disabled:opacity-50">
                              <Trash2 size={13} strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
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
          editingPr={editingPr}
          onClose={closeModal}
          onSaved={() => { closeModal(); window.location.reload() }}
        />
      )}
    </>
  )
}
