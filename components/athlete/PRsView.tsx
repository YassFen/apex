'use client'
import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PRModal } from './PRModal'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Movement } from '@/lib/types/database'

const CATEGORIES = ['all', 'weightlifting', 'olympic', 'gymnastics', 'cardio', 'benchmark']
const CAT_LABELS: Record<string, string> = {
  all: 'Todos',
  weightlifting: 'Halterofilia',
  olympic: 'Olímpicos',
  gymnastics: 'Gymnastics',
  cardio: 'Cardio',
  benchmark: 'Benchmarks',
}

function formatValue(pr: any, preferredUnit: 'kg' | 'lb'): { value: string; unit: string } {
  const metric: string = pr.metric ?? '1rm'
  const raw: number = pr.value_lb ?? 0

  if (metric === 'max_reps') return { value: String(Math.round(raw)), unit: 'reps' }
  if (metric === 'time') {
    const totalSecs = Math.round(raw)
    const m = Math.floor(totalSecs / 60)
    const s = totalSecs % 60
    return { value: `${m}:${String(s).padStart(2, '0')}`, unit: 'min' }
  }
  if (preferredUnit === 'kg') return { value: String(Math.round(raw * 0.453592)), unit: 'kg' }
  return { value: String(Math.round(raw)), unit: 'lb' }
}

function MetricBadge({ metric }: { metric: string }) {
  const labels: Record<string, string> = {
    '1rm': '1RM', '3rm': '3RM', 'max_reps': 'Máx. Reps', 'time': 'Tiempo',
  }
  return <Badge color="lime">{labels[metric] ?? metric}</Badge>
}

export function PRsView({ profile, prs, movements }: { profile: Profile; prs: any[]; movements: Movement[] }) {
  const [cat, setCat]             = useState('all')
  const [prModalOpen, setPrModalOpen] = useState(false)
  const [editingPr, setEditingPr] = useState<any>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return
    setDeletingId(id)
    const supabase = createClient()
    const { error } = await supabase.from('pr_records').delete().eq('id', id)
    setDeletingId(null)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    window.location.reload()
  }

  function handleEdit(pr: any) {
    setEditingPr(pr)
    setPrModalOpen(true)
  }

  function closeModal() {
    setPrModalOpen(false)
    setEditingPr(null)
  }

  const filtered = prs.filter(pr => {
    if (cat !== 'all' && pr.movements?.category !== cat) return false
    return true
  })

  const byMovement: Record<string, any[]> = {}
  filtered.forEach(pr => {
    const key = pr.movements?.name ?? pr.movement_id
    ;(byMovement[key] = byMovement[key] ?? []).push(pr)
  })

  const unit = profile.preferred_unit

  return (
    <>
      <Topbar title="Récords Personales" profile={profile}
        actions={
          <Button onClick={() => { setEditingPr(null); setPrModalOpen(true) }}>
            <Plus size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">Nuevo RM</span>
          </Button>
        }
      />

      <div className="p-4 lg:p-6 flex flex-col gap-4">
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

        {Object.keys(byMovement).length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-mu text-sm">No hay registros en esta categoría.</div>
            <button onClick={() => { setEditingPr(null); setPrModalOpen(true) }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ac/8 border border-ac/18 text-ac text-sm font-bold hover:bg-ac/14 transition-colors">
              <Plus size={14} strokeWidth={2.5} /> Agregar primer RM
            </button>
          </Card>
        ) : (
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
                      <button
                        onClick={() => handleEdit(best)}
                        aria-label="Editar"
                        className="p-1.5 rounded-lg text-fa hover:text-ac hover:bg-p3 transition-colors"
                      >
                        <Pencil size={14} strokeWidth={2} />
                      </button>
                      <button
                        onClick={() => handleDelete(best.id)}
                        aria-label="Eliminar"
                        disabled={deletingId === best.id}
                        className="p-1.5 rounded-lg text-fa hover:text-rd hover:bg-rd/10 transition-colors disabled:opacity-50"
                      >
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
                            <button
                              onClick={() => handleEdit(r)}
                              aria-label="Editar"
                              className="p-1.5 rounded-lg text-fa hover:text-ac hover:bg-p3 transition-colors"
                            >
                              <Pencil size={13} strokeWidth={2} />
                            </button>
                            <button
                              onClick={() => handleDelete(r.id)}
                              aria-label="Eliminar"
                              disabled={deletingId === r.id}
                              className="p-1.5 rounded-lg text-fa hover:text-rd hover:bg-rd/10 transition-colors disabled:opacity-50"
                            >
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
