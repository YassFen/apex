'use client'
import { useEffect, useRef } from 'react'

interface Props {
  prs: any[]
  movement: string
  unit: 'kg' | 'lb'
}

export function StrengthChart({ prs, movement, unit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  const emptyRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let destroyed = false
    async function init() {
      const mod = await import('chart.js/auto')
      const Chart = mod.default
      if (destroyed) return

      const filtered = prs
        .filter(p => p.movements?.name === movement && (p.metric === '1rm' || p.metric === '3rm'))
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
            borderColor: '#c8f53e',
            backgroundColor: 'rgba(200,245,62,.08)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#c8f53e',
            pointRadius: 5,
            pointHoverRadius: 7,
            borderWidth: 2.5,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: {
            backgroundColor: '#12161d',
            borderColor: 'rgba(255,255,255,.13)',
            borderWidth: 1,
            titleColor: '#8a96a8',
            bodyColor: '#eef0f3',
            bodyFont: { family: '"Barlow Condensed"', size: 18, weight: 'bold' as const },
            callbacks: { label: (ctx: any) => ` ${ctx.raw} ${suffix}` },
          }},
          scales: {
            x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#50596a', font: { size: 11 } } },
            y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#50596a', font: { size: 11 } } },
          },
        },
      })
    }
    init()
    return () => {
      destroyed = true
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    }
  }, [prs, movement, unit])

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} />
      <div ref={emptyRef} className="absolute inset-0 items-center justify-center text-center text-mu text-sm" style={{ display: 'none' }}>
        <div>
          <div className="text-3xl mb-2 opacity-50">📉</div>
          <div>Sin datos de <span className="font-bold text-t">{movement}</span></div>
          <div className="text-fa text-xs mt-1">Registra un RM para ver tu evolución</div>
        </div>
      </div>
    </div>
  )
}
