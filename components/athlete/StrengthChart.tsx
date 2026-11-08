'use client'
import { useEffect, useRef } from 'react'
import { LineChart } from '@/components/ui/icons'
import { themeColor } from '@/lib/utils/theme'
import { useThemeVersion } from '@/components/ui/AppearancePicker'

interface Props {
  prs: any[]
  movement: string
  unit: 'kg' | 'lb'
}

export function StrengthChart({ prs, movement, unit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  const emptyRef  = useRef<HTMLDivElement>(null)
  const themeVersion = useThemeVersion() // redraw with the new colors when the theme changes

  useEffect(() => {
    let destroyed = false
    async function init() {
      const mod = await import('chart.js/auto')
      const Chart = mod.default
      if (destroyed) return

      // One metric per line: mixing 1RM and 3RM draws fake drops. Prefer 1RM.
      const ofMovement = prs.filter(p => p.movements?.name === movement)
      const metric = ofMovement.some(p => p.metric === '1rm') ? '1rm' : '3rm'
      const filtered = ofMovement
        .filter(p => p.metric === metric)
        .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())

      const labels = filtered.map(p =>
        new Date(p.recorded_at).toLocaleDateString('es-CL', { month: 'short', day: 'numeric' })
      )
      const data = filtered.map(p => unit === 'kg' ? Math.round(p.value_lb * 0.453592) : Math.round(p.value_lb))
      const suffix = unit === 'kg' ? 'kg' : 'lbs'

      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
      if (!canvasRef.current) return

      if (filtered.length === 0) {
        if (emptyRef.current) emptyRef.current.style.display = 'flex'
        return
      }
      if (emptyRef.current) emptyRef.current.style.display = 'none'

      chartRef.current = new Chart(canvasRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data,
            borderColor: themeColor('ac'),
            backgroundColor: themeColor('ac', .1),
            fill: true,
            tension: 0.35,
            cubicInterpolationMode: 'monotone' as const, // no overshoot below/above real values
            pointBackgroundColor: themeColor('ac'),
            pointRadius: 5,
            pointHoverRadius: 7,
            borderWidth: 2.5,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: {
            backgroundColor: themeColor('p'),
            borderColor: themeColor('t', .13),
            borderWidth: 1,
            titleColor: themeColor('mu'),
            bodyColor: themeColor('t'),
            bodyFont: { family: 'Geist', size: 15, weight: 'bold' as const },
            callbacks: { label: (ctx: any) => ` ${ctx.raw} ${suffix}` },
          }},
          scales: {
            x: { grid: { color: themeColor('t', .06) }, ticks: { color: themeColor('fa'), font: { size: 11 } } },
            y: { grid: { color: themeColor('t', .06) }, ticks: { color: themeColor('fa'), font: { size: 11 } } },
          },
        },
      })
    }
    init()
    return () => {
      destroyed = true
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    }
  }, [prs, movement, unit, themeVersion])

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} />
      <div ref={emptyRef} className="absolute inset-0 items-center justify-center text-center text-mu text-sm" style={{ display: 'none' }}>
        <div>
          <LineChart size={28} className="mx-auto mb-2 text-fa" aria-hidden />
          <div>Sin datos de <span className="font-bold text-t">{movement}</span></div>
          <div className="text-fa text-xs mt-1">Registra un RM para ver tu evolución</div>
        </div>
      </div>
    </div>
  )
}
