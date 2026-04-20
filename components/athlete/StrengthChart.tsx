'use client'
import { useEffect, useRef } from 'react'

export function StrengthChart({ prs }: { prs: any[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)

  useEffect(() => {
    let Chart: any
    async function init() {
      const mod = await import('chart.js/auto')
      Chart = mod.default

      const deadliftPRs = prs
        .filter(p => p.movements?.name === 'Deadlift')
        .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())

      const labels = deadliftPRs.map(p =>
        new Date(p.recorded_at).toLocaleDateString('es-CL', { month: 'short', year: '2-digit' })
      )
      const data = deadliftPRs.map(p => p.value_lb)

      if (!canvasRef.current) return
      if (chartRef.current) chartRef.current.destroy()

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
            bodyFont: { family: '"Barlow Condensed"', size: 18, weight: '700' },
            callbacks: { label: (ctx: any) => ` ${ctx.raw} lbs` },
          }},
          scales: {
            x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#50596a', font: { size: 11 } } },
            y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#50596a', font: { size: 11 } } },
          },
        },
      })
    }
    init()
    return () => { chartRef.current?.destroy() }
  }, [prs])

  return <canvas ref={canvasRef} />
}
