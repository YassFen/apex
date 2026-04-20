'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import type { Profile } from '@/lib/types/database'

type TimerMode = 'stopwatch' | 'countdown' | 'emom' | 'tabata' | 'amrap'
type TimerState = 'idle' | 'running' | 'paused' | 'done'

export function TimerView({ profile }: { profile: Profile }) {
  const [mode, setMode]         = useState<TimerMode>('stopwatch')
  const [state, setState]       = useState<TimerState>('idle')
  const [elapsed, setElapsed]   = useState(0)         // ms
  const [config, setConfig]     = useState({ mins: 20, secs: 0, work: 40, rest: 20, rounds: 8 })
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef                = useRef<number>(0)
  const pauseRef                = useRef<number>(0)

  const totalMs = (config.mins * 60 + config.secs) * 1000

  function formatTime(ms: number) {
    const totalSecs = Math.abs(Math.floor(ms / 1000))
    const m = Math.floor(totalSecs / 60)
    const s = totalSecs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const displayMs = mode === 'countdown' || mode === 'amrap'
    ? Math.max(totalMs - elapsed, 0)
    : elapsed

  const colorClass = state === 'running'
    ? 'text-ac [text-shadow:0_0_40px_rgba(200,245,62,.35)]'
    : state === 'done'
    ? 'text-gr [text-shadow:0_0_40px_rgba(74,222,128,.4)]'
    : 'text-t'

  function start() {
    if (state === 'paused') {
      startRef.current = Date.now() - (pauseRef.current - startRef.current)
    } else {
      startRef.current = Date.now()
      setElapsed(0)
    }
    setState('running')
    intervalRef.current = setInterval(() => {
      const now = Date.now() - startRef.current
      setElapsed(now)
      if ((mode === 'countdown' || mode === 'amrap') && now >= totalMs) {
        clearInterval(intervalRef.current!)
        setState('done')
        setElapsed(totalMs)
      }
    }, 50)
  }

  function pause() {
    clearInterval(intervalRef.current!)
    pauseRef.current = Date.now()
    setState('paused')
  }

  function reset() {
    clearInterval(intervalRef.current!)
    setState('idle')
    setElapsed(0)
  }

  useEffect(() => () => clearInterval(intervalRef.current!), [])

  const MODES: { key: TimerMode; label: string }[] = [
    { key: 'stopwatch', label: 'Stopwatch' },
    { key: 'countdown', label: 'Countdown' },
    { key: 'amrap',     label: 'AMRAP' },
    { key: 'emom',      label: 'EMOM' },
    { key: 'tabata',    label: 'Tabata' },
  ]

  return (
    <>
      <Topbar title="Timer" onMenuClick={() => {}} profile={profile} />

      <div className="p-4 lg:p-6 flex flex-col items-center gap-6 max-w-lg mx-auto w-full">
        {/* Mode selector */}
        <div className="flex gap-2.5 flex-wrap justify-center">
          {MODES.map(m => (
            <button key={m.key} onClick={() => { reset(); setMode(m.key) }}
              className={`px-4 py-2.5 rounded-xl border font-barlow font-extrabold text-lg tracking-wide uppercase transition-all ${
                mode === m.key ? 'bg-ac text-bg border-ac' : 'border-[var(--ln2)] text-mu hover:text-t hover:border-mu'
              }`}>{m.label}</button>
          ))}
        </div>

        {/* Display */}
        <div className="text-center">
          <div className={`font-barlow font-black leading-none transition-colors duration-200 ${colorClass}`}
            style={{ fontSize: 'clamp(72px, 22vw, 120px)' }}>
            {formatTime(displayMs)}
          </div>
          {state === 'done' && (
            <div className="font-barlow text-2xl font-black text-gr mt-2 animate-fade-up">TIME!</div>
          )}
        </div>

        {/* Config for timed modes */}
        {(mode === 'countdown' || mode === 'amrap') && state === 'idle' && (
          <div className="grid grid-cols-3 gap-3 w-full">
            {[
              { label: 'Mins', val: config.mins, key: 'mins' as const, max: 99 },
              { label: 'Secs', val: config.secs, key: 'secs' as const, max: 59 },
            ].map(f => (
              <Card key={f.key} padding={false} className="p-4 text-center">
                <div className="text-[10px] uppercase tracking-[1.5px] text-mu font-bold mb-2">{f.label}</div>
                <input
                  type="number" min={0} max={f.max} value={f.val}
                  onChange={e => setConfig(c => ({ ...c, [f.key]: Number(e.target.value) }))}
                  className="w-full text-center bg-transparent border-0 font-barlow text-4xl font-black text-t outline-none"
                />
              </Card>
            ))}
            <Card padding={false} className="p-4 text-center">
              <div className="text-[10px] uppercase tracking-[1.5px] text-mu font-bold mb-2">Total</div>
              <div className="font-barlow text-4xl font-black">{formatTime(totalMs)}</div>
            </Card>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3">
          {state !== 'running' ? (
            <button onClick={start}
              className="px-10 py-4 rounded-xl bg-ac text-bg font-barlow text-xl font-black tracking-wide uppercase hover:bg-[#b8e030] active:scale-95 transition-all">
              {state === 'paused' ? 'RESUME' : 'START'}
            </button>
          ) : (
            <button onClick={pause}
              className="px-10 py-4 rounded-xl border border-[var(--ln2)] text-mu font-barlow text-xl font-black tracking-wide uppercase hover:text-t hover:border-mu active:scale-95 transition-all">
              PAUSE
            </button>
          )}
          <button onClick={reset}
            className="px-6 py-4 rounded-xl border border-[var(--ln2)] text-mu font-barlow text-xl font-black tracking-wide uppercase hover:text-t hover:border-mu active:scale-95 transition-all">
            RESET
          </button>
        </div>
      </div>
    </>
  )
}
