'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { calcOneRM, getRmTable, calcPlates, BAR_WEIGHT_LB } from '@/lib/utils/rm-calculator'
import { lbToKg } from '@/lib/utils/units'
import { ChevronDown, Search, X } from 'lucide-react'
import type { Profile } from '@/lib/types/database'

const CAT_LABEL: Record<string, string> = {
  weightlifting: '🏋️ Levantamiento',
  olympic:       '⚡ Olímpico',
  gymnastics:    '🤸 Gimnástico',
  cardio:        '🏃 Cardio',
  benchmark:     '🔥 Benchmark',
}

/* IWF/CrossFit standard plate colors */
const PLATE_STYLE: Record<number, { bg: string; w: number; h: number; border?: string }> = {
  45:  { bg: 'linear-gradient(180deg,#dc2626,#991b1b)', w: 18, h: 84 },
  35:  { bg: 'linear-gradient(180deg,#2563eb,#1d4ed8)', w: 16, h: 76 },
  25:  { bg: 'linear-gradient(180deg,#ca8a04,#92400e)', w: 14, h: 66 },
  15:  { bg: 'linear-gradient(180deg,#15803d,#14532d)', w: 12, h: 56 },
  10:  { bg: 'linear-gradient(180deg,#1f2937,#111827)', w: 11, h: 48, border: '1px solid #374151' },
  5:   { bg: 'linear-gradient(180deg,#374151,#1f2937)', w: 10, h: 40, border: '1px solid #4b5563' },
  2.5: { bg: 'linear-gradient(180deg,#4b5563,#374151)', w: 10, h: 32, border: '1px solid #6b7280' },
}

const PLATE_LEGEND = [
  { w: 45,  c: '#dc2626' },
  { w: 35,  c: '#2563eb' },
  { w: 25,  c: '#ca8a04' },
  { w: 15,  c: '#15803d' },
  { w: 10,  c: '#1f2937', border: '1px solid #6b7280' },
  { w: 5,   c: '#4b5563' },
  { w: 2.5, c: '#6b7280' },
]

export function RMCalcView({ profile, prs }: { profile: Profile; prs: any[] }) {
  const [weight, setWeight]         = useState('')
  const [reps, setReps]             = useState('1')
  const [unit, setUnit]             = useState<'lb' | 'kg'>(profile.preferred_unit)
  const [selectedPR, setSelectedPR] = useState('')
  const [pct, setPct]               = useState(70)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch]         = useState('')
  const pickerRef                   = useRef<HTMLDivElement>(null)

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  // Only include strength-relevant PRs (1rm, 2rm, 3rm, 5rm)
  const eligiblePrs = prs.filter(p => ['1rm','2rm','3rm','5rm'].includes(p.metric))

  // Group eligible PRs by movement category
  const groupedPrs = useMemo(() => {
    const groups: Record<string, typeof eligiblePrs> = {}
    eligiblePrs.forEach(pr => {
      const cat = pr.movements?.category ?? 'weightlifting'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(pr)
    })
    return groups
  }, [eligiblePrs])

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groupedPrs
    const q = search.toLowerCase()
    const result: Record<string, typeof eligiblePrs> = {}
    Object.entries(groupedPrs).forEach(([cat, items]) => {
      const filtered = items.filter(p => p.movements?.name?.toLowerCase().includes(q))
      if (filtered.length > 0) result[cat] = filtered
    })
    return result
  }, [groupedPrs, search])

  const selectedPrData = eligiblePrs.find(p => p.id === selectedPR)

  const weightLb = useMemo(() => {
    if (selectedPR) {
      const pr = prs.find(p => p.id === selectedPR)
      return pr ? pr.value_lb : 0
    }
    if (!weight) return 0
    const n = Number(weight)
    return unit === 'kg' ? n * 2.20462 : n
  }, [weight, unit, selectedPR, prs])

  const oneRM   = weightLb > 0 ? calcOneRM(weightLb, Number(reps)) : 0
  const table   = oneRM > 0 ? getRmTable(oneRM) : []
  const targetLb = oneRM > 0 ? Math.round(oneRM * (pct / 100)) : 0
  const [plates] = targetLb > 0 ? calcPlates(targetLb) : [[]]
  const sideLb   = (targetLb - BAR_WEIGHT_LB) / 2

  const PCT_QUICK = [50, 60, 70, 75, 80, 85, 90, 95, 100]

  return (
    <>
      <Topbar title="Calculadora RM" profile={profile} />

      <div className="p-4 lg:p-6 grid lg:grid-cols-[1.1fr_1fr] gap-4 max-w-5xl mx-auto w-full">
        {/* LEFT: input + percentages */}
        <div className="flex flex-col gap-4">
          <Card>
            <div className="font-barlow text-[15px] font-extrabold tracking-wide uppercase mb-4">Calcular 1RM</div>

            {eligiblePrs.length > 0 && (
              <div className="mb-4" ref={pickerRef}>
                <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
                  Cargar desde RM existente
                </label>

                {/* Trigger button */}
                <button
                  type="button"
                  onClick={() => setPickerOpen(o => !o)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all ${
                    pickerOpen
                      ? 'bg-p3 border-ac/50 text-t'
                      : 'bg-p3 border-[var(--ln)] text-t hover:border-[var(--ln2)]'
                  }`}
                >
                  {selectedPrData ? (
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold truncate">{selectedPrData.movements?.name}</span>
                      <span className="text-ac font-barlow font-black text-base leading-none">{selectedPrData.value_lb} lb</span>
                      <span className="text-mu text-xs uppercase">{selectedPrData.metric}</span>
                    </span>
                  ) : (
                    <span className="text-mu">— Seleccionar ejercicio —</span>
                  )}
                  <span className="flex items-center gap-1 flex-shrink-0">
                    {selectedPrData && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={e => { e.stopPropagation(); setSelectedPR(''); setSearch('') }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setSelectedPR(''); setSearch('') } }}
                        className="text-mu hover:text-rd transition-colors p-0.5 rounded"
                      >
                        <X size={13} strokeWidth={2.5} />
                      </span>
                    )}
                    <ChevronDown size={15} strokeWidth={2.5} className={`text-mu transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
                  </span>
                </button>

                {/* Dropdown panel */}
                {pickerOpen && (
                  <div className="absolute z-50 mt-1.5 w-[calc(100%-2rem)] max-w-sm bg-p border border-[var(--ln2)] rounded-2xl shadow-2xl overflow-hidden">
                    {/* Search */}
                    <div className="p-3 border-b border-[var(--ln)]">
                      <div className="flex items-center gap-2 px-3 py-2 bg-p3 rounded-xl border border-[var(--ln)]">
                        <Search size={13} strokeWidth={2.5} className="text-mu flex-shrink-0" />
                        <input
                          autoFocus
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="Buscar ejercicio…"
                          className="flex-1 bg-transparent text-sm text-t outline-none placeholder:text-mu"
                        />
                        {search && (
                          <button onClick={() => setSearch('')} className="text-mu hover:text-t transition-colors">
                            <X size={12} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Grouped list */}
                    <div className="max-h-64 overflow-y-auto">
                      {Object.keys(filteredGroups).length === 0 ? (
                        <div className="p-4 text-center text-mu text-sm">Sin resultados</div>
                      ) : (
                        Object.entries(filteredGroups).map(([cat, items]) => (
                          <div key={cat}>
                            <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-[1.6px] text-fa font-bold">
                              {CAT_LABEL[cat] ?? cat}
                            </div>
                            {items.map(pr => (
                              <button
                                key={pr.id}
                                type="button"
                                onClick={() => {
                                  setSelectedPR(pr.id)
                                  setWeight('')
                                  setPickerOpen(false)
                                  setSearch('')
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-ac/5 transition-colors ${
                                  selectedPR === pr.id ? 'bg-ac/8 text-ac' : 'text-t'
                                }`}
                              >
                                <span className="font-medium">{pr.movements?.name}</span>
                                <span className="flex items-center gap-1.5 flex-shrink-0">
                                  <span className={`font-barlow font-black text-base leading-none ${selectedPR === pr.id ? 'text-ac' : 'text-t'}`}>
                                    {pr.value_lb} lb
                                  </span>
                                  <span className="text-[10px] uppercase text-mu bg-p3 px-1.5 py-0.5 rounded-full border border-[var(--ln)]">
                                    {pr.metric}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Peso levantado</label>
                <div className="flex">
                  <input type="number" min="0" value={weight}
                    onChange={e => { setWeight(e.target.value); setSelectedPR('') }}
                    className="flex-1 min-w-0 px-3 py-2.5 rounded-l-xl bg-p3 border-y border-l border-[var(--ln)] text-t outline-none focus:border-ac font-barlow text-2xl font-bold"
                    placeholder="0" />
                  <button onClick={() => setUnit(u => u === 'lb' ? 'kg' : 'lb')}
                    className="px-3 rounded-r-xl border border-[var(--ln)] bg-p2 text-mu text-xs font-bold hover:text-t transition-colors">
                    {unit}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Reps</label>
                <input type="number" min="1" max="30" value={reps} onChange={e => setReps(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t outline-none focus:border-ac font-barlow text-2xl font-bold" />
              </div>
            </div>

            {oneRM > 0 && (
              <div className="p-4 bg-p3 rounded-xl text-center animate-fade-up">
                <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1">1RM Estimado</div>
                <div className="font-barlow text-[56px] font-black leading-none text-ac">
                  {unit === 'kg' ? Math.round(oneRM * 0.453592) : oneRM}
                  <span className="text-[20px] text-mu font-normal ml-2">{unit}</span>
                </div>
                <div className="text-mu text-[13px] mt-1">
                  {unit === 'kg' ? `${oneRM} lb` : `${Math.round(oneRM * 0.453592)} kg`}
                </div>
              </div>
            )}
          </Card>

          {/* Percentage selector */}
          {oneRM > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <div className="font-barlow text-[15px] font-extrabold tracking-wide uppercase">Carga de trabajo</div>
                <div className="font-barlow text-3xl font-black text-ac">{pct}%</div>
              </div>
              <div className="flex gap-1.5 flex-wrap mb-3">
                {PCT_QUICK.map(p => (
                  <button key={p} onClick={() => setPct(p)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                            pct === p ? 'bg-ac/10 text-ac border-ac/25' : 'border-[var(--ln2)] text-mu hover:text-t'
                          }`}>
                    {p}%
                  </button>
                ))}
              </div>
              <input type="range" min="30" max="100" step="5" value={pct}
                     onChange={e => setPct(Number(e.target.value))}
                     className="w-full accent-ac" />

              <div className="grid grid-cols-2 gap-2.5 mt-4">
                <div className="p-4 rounded-2xl bg-p3 border border-ac/14">
                  <div className="text-[10px] uppercase tracking-[1.5px] text-fa font-bold mb-1.5">Peso objetivo</div>
                  <div className="font-barlow text-3xl font-black leading-none text-ac">
                    {unit === 'kg' ? Math.round(targetLb * 0.453592) : targetLb}
                    <span className="text-sm text-mu font-normal ml-1">{unit}</span>
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-p3 border border-bl/14">
                  <div className="text-[10px] uppercase tracking-[1.5px] text-fa font-bold mb-1.5">Carga por lado</div>
                  <div className="font-barlow text-3xl font-black leading-none text-bl">
                    {unit === 'kg' ? Math.round(sideLb * 0.453592) : Math.round(sideLb)}
                    <span className="text-sm text-mu font-normal ml-1">{unit}</span>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT: barbell + table */}
        <div className="flex flex-col gap-4">
          {targetLb > 0 && (
            <Card>
              <div className="font-barlow text-[15px] font-extrabold tracking-wide uppercase mb-1">Barra y discos por lado</div>
              <div className="text-fa text-[11px] mb-4">Colores estándar CrossFit / IWF</div>

              <div className="flex items-center justify-center py-4 overflow-x-auto">
                {/* Realistic barbell - left half */}
                <div className="flex items-center min-w-fit">
                  {/* Collar end cap */}
                  <div className="rounded-l flex-shrink-0"
                       style={{ width: 14, height: 26, background: 'linear-gradient(90deg,#374151,#6b7280)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.15)' }} />
                  {/* Plates stack (outer to inner) */}
                  <div className="flex items-center gap-[3px] ml-[3px]">
                    {[...plates].reverse().map((p, i) => {
                      const s = PLATE_STYLE[p as 45 | 35 | 25 | 15 | 10 | 5 | 2.5]
                      if (!s) return null
                      return (
                        <div key={i} className="rounded-[5px] grid place-items-center text-white text-[9px] font-extrabold flex-shrink-0"
                             style={{
                               width: s.w, minWidth: s.w, height: s.h, background: s.bg, border: s.border,
                               boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18), 0 2px 4px rgba(0,0,0,.4)',
                               textShadow: '0 1px 2px rgba(0,0,0,.6)',
                             }}>
                          {p}
                        </div>
                      )
                    })}
                  </div>
                  {/* Sleeve */}
                  <div className="flex-shrink-0 ml-1"
                       style={{ width: 38, height: 16, background: 'linear-gradient(180deg,#4b5563,#1f2937)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12), 0 1px 3px rgba(0,0,0,.4)' }} />
                  {/* Bar shaft */}
                  <div className="flex-shrink-0 rounded-r"
                       style={{ width: 90, height: 9, background: 'linear-gradient(180deg,#6b7280 0%,#1f2937 50%,#374151 100%)',
                                boxShadow: '0 2px 6px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.1)' }} />
                </div>
              </div>

              {/* Legend */}
              <div className="flex gap-2.5 flex-wrap justify-center mt-3 text-[11px] text-mu">
                {PLATE_LEGEND.map(p => (
                  <div key={p.w} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: p.c, border: p.border }} />
                    <span>{p.w} lb</span>
                  </div>
                ))}
              </div>

              {/* Plates summary text */}
              <div className="mt-4 text-center text-mu text-xs">
                {plates.length === 0
                  ? <span className="text-fa">Solo la barra ({BAR_WEIGHT_LB} lb)</span>
                  : <>
                      Barra {BAR_WEIGHT_LB} lb + <span className="text-t font-semibold">{plates.map(p => `${p} lb`).join(' + ')}</span>
                      <span className="text-fa"> · cada lado</span>
                    </>
                }
              </div>
            </Card>
          )}

          {table.length > 0 && (
            <Card padding={false}>
              <div className="p-5 border-b border-[var(--ln)]">
                <div className="font-barlow text-[15px] font-extrabold tracking-wide uppercase">Tabla de porcentajes</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[rgba(255,255,255,.04)] bg-p2">
                      <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold">%</th>
                      <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold">Lb</th>
                      <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold">Kg</th>
                      <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold">~Reps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.map(row => (
                      <tr key={row.pct}
                          className="border-b border-[rgba(255,255,255,.04)] hover:bg-white/[.02] transition-colors cursor-pointer"
                          onClick={() => setPct(row.pct)}>
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
      </div>
    </>
  )
}
