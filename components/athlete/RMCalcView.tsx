'use client'
import { useState, useMemo } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { calcOneRM, getRmTable, calcPlates, BAR_WEIGHT_LB } from '@/lib/utils/rm-calculator'
import { lbToKg } from '@/lib/utils/units'
import type { Profile } from '@/lib/types/database'

const PLATE_COLORS: Record<number, string> = {
  45: 'bg-gradient-to-b from-red-600 to-red-800',
  35: 'bg-gradient-to-b from-blue-600 to-blue-800',
  25: 'bg-gradient-to-b from-yellow-600 to-yellow-800',
  15: 'bg-gradient-to-b from-green-700 to-green-900',
  10: 'bg-gradient-to-b from-gray-600 to-gray-800',
  5:  'bg-gradient-to-b from-gray-500 to-gray-700',
  2.5:'bg-gradient-to-b from-gray-400 to-gray-600',
}
const PLATE_HEIGHTS: Record<number, string> = {
  45:'h-16',35:'h-14',25:'h-12',15:'h-10',10:'h-8',5:'h-7',2.5:'h-6',
}

export function RMCalcView({ profile, prs }: { profile: Profile; prs: any[] }) {
  const [weight, setWeight]   = useState('')
  const [reps, setReps]       = useState('1')
  const [unit, setUnit]       = useState<'lb' | 'kg'>(profile.preferred_unit)
  const [selectedPR, setSelectedPR] = useState('')

  const weightLb = useMemo(() => {
    if (selectedPR) {
      const pr = prs.find(p => p.id === selectedPR)
      return pr ? pr.value_lb : 0
    }
    if (!weight) return 0
    const n = Number(weight)
    return unit === 'kg' ? n * 2.20462 : n
  }, [weight, unit, selectedPR, prs])

  const oneRM = weightLb > 0 ? calcOneRM(weightLb, Number(reps)) : 0
  const table = oneRM > 0 ? getRmTable(oneRM) : []
  const [plates] = oneRM > 0 ? calcPlates(oneRM) : [[]]

  return (
    <>
      <Topbar title="Calculadora RM" onMenuClick={() => {}} profile={profile} />

      <div className="p-4 lg:p-6 grid lg:grid-cols-[1.2fr_1fr] gap-4 max-w-4xl mx-auto w-full">
        {/* Input card */}
        <div className="flex flex-col gap-4">
          <Card>
            <div className="font-barlow text-[15px] font-extrabold tracking-wide uppercase mb-4">Calcular 1RM</div>

            {/* Load from PR */}
            {prs.length > 0 && (
              <div className="mb-4">
                <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Cargar desde PR</label>
                <select value={selectedPR} onChange={e => { setSelectedPR(e.target.value); setWeight('') }}
                  className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac">
                  <option value="">— Seleccionar PR —</option>
                  {prs.map(pr => (
                    <option key={pr.id} value={pr.id}>
                      {pr.movements?.name} — {pr.value_lb} lbs
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Peso levantado</label>
                <div className="flex">
                  <input type="number" min="0" value={weight}
                    onChange={e => { setWeight(e.target.value); setSelectedPR('') }}
                    className="flex-1 min-w-0 px-3 py-2.5 rounded-l-xl bg-p3 border-y border-l border-[var(--ln)] text-t text-sm outline-none focus:border-ac font-barlow text-2xl font-bold"
                    placeholder="0" />
                  <button onClick={() => setUnit(u => u === 'lb' ? 'kg' : 'lb')}
                    className="px-3 rounded-r-xl border border-[var(--ln)] bg-p2 text-mu text-xs font-bold hover:text-t transition-colors">
                    {unit}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Reps realizadas</label>
                <input type="number" min="1" max="30" value={reps} onChange={e => setReps(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac font-barlow text-2xl font-bold" />
              </div>
            </div>

            {/* 1RM result */}
            {oneRM > 0 && (
              <div className="p-4 bg-p3 rounded-xl text-center animate-fade-up">
                <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1">1RM Estimado</div>
                <div className="font-barlow text-[56px] font-black leading-none text-ac">
                  {unit === 'kg' ? Math.round(oneRM * 0.453592) : oneRM}
                  <span className="text-[20px] text-mu font-normal ml-2">{unit}</span>
                </div>
                <div className="text-mu text-[13px] mt-1">
                  {unit === 'kg' ? `${oneRM} lbs` : `${Math.round(oneRM * 0.453592)} kg`}
                </div>
              </div>
            )}
          </Card>

          {/* Barbell visualization */}
          {plates.length > 0 && (
            <Card>
              <div className="font-barlow text-[15px] font-extrabold tracking-wide uppercase mb-3">Carga en barra</div>
              <div className="flex items-center justify-center gap-0 py-2">
                {/* Collar */}
                <div className="w-3 h-6 bg-gradient-to-r from-gray-500 to-gray-400 rounded-l-sm flex-shrink-0" />
                {/* Plates reversed (outermost first) */}
                {[...plates].reverse().map((p, i) => (
                  <div key={i} className={`w-4 ${PLATE_HEIGHTS[p] ?? 'h-8'} ${PLATE_COLORS[p] ?? 'bg-gray-600'} flex-shrink-0 rounded-sm`} />
                ))}
                {/* Bar shaft */}
                <div className="w-20 h-2 bg-gradient-to-b from-gray-400 to-gray-700 rounded-r-sm" />
              </div>
              <div className="text-center text-mu text-xs mt-2">
                Barra {BAR_WEIGHT_LB} lbs + {plates.map(p => `${p}`).join(' + ')} × 2 lbs
              </div>
            </Card>
          )}
        </div>

        {/* Percentage table */}
        {table.length > 0 && (
          <Card padding={false}>
            <div className="p-5 border-b border-[var(--ln)]">
              <div className="font-barlow text-[15px] font-extrabold tracking-wide uppercase">Tabla de porcentajes</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,.04)]">
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold">%</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold">Lbs</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold">Kg</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold">~Reps</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map(row => (
                    <tr key={row.pct} className="border-b border-[rgba(255,255,255,.04)] hover:bg-white/[.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-[rgba(255,255,255,.07)] rounded-full overflow-hidden">
                            <div className="h-full bg-ac rounded-full" style={{ width: `${row.pct}%` }} />
                          </div>
                          <span className="font-barlow font-bold text-sm">{row.pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-barlow text-xl font-bold">{row.weight}</td>
                      <td className="px-4 py-3 text-mu text-sm">{lbToKg(row.weight)}</td>
                      <td className="px-4 py-3 text-mu text-sm">{row.approxReps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
