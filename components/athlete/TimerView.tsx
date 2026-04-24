'use client'
import { useState, useEffect, useRef } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import type { Profile } from '@/lib/types/database'
import { Play, Pause, RotateCcw, CheckCircle2, Plus, Minus } from 'lucide-react'

type TimerMode = 'fortime' | 'amrap' | 'emom' | 'tabata'
type TimerState = 'idle' | 'running' | 'paused' | 'done'

const MODES: { key: TimerMode; label: string; desc: string }[] = [
  { key: 'fortime', label: 'FOR TIME', desc: 'Cuenta regresiva — termina cuando llegas a 00:00 o presionas TIME' },
  { key: 'amrap',   label: 'AMRAP',    desc: 'Tantas rondas como puedas en el tiempo definido' },
  { key: 'emom',    label: 'EMOM',     desc: 'Una ronda cada X segundos durante el total' },
  { key: 'tabata',  label: 'TABATA',   desc: '8 rondas de 20 s trabajo + 10 s descanso (configurable)' },
]

interface Cfg {
  mins: number; secs: number
  durationMin: number       // EMOM total
  intervalSec: number       // EMOM "cada X segundos"
  work: number; rest: number; rounds: number  // Tabata
}

export function TimerView({ profile }: { profile: Profile }) {
  const [mode, setMode]     = useState<TimerMode>('fortime')
  const [state, setState]   = useState<TimerState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [cfg, setCfg]       = useState<Cfg>({ mins: 12, secs: 0, durationMin: 10, intervalSec: 60, work: 20, rest: 10, rounds: 8 })
  const [amrapRounds, setAmrapRounds] = useState(0)
  const [tabataPhase, setTabataPhase] = useState<'work' | 'rest'>('work')
  const [emomRound, setEmomRound] = useState(1)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef    = useRef<number>(0)
  const pauseAccum  = useRef<number>(0)

  // Total milliseconds for countdown modes
  const totalMs =
    mode === 'fortime' || mode === 'amrap' ? (cfg.mins * 60 + cfg.secs) * 1000
    : mode === 'emom' ? cfg.durationMin * 60 * 1000
    : (cfg.rounds * (cfg.work + cfg.rest)) * 1000

  function fmt(ms: number) {
    const sec = Math.max(0, Math.floor(ms / 1000))
    const m = Math.floor(sec / 60); const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  function tick() {
    const now = Date.now() - startRef.current - pauseAccum.current
    setElapsed(now)

    // Countdown / fortime / amrap finish
    if ((mode === 'fortime' || mode === 'amrap' || mode === 'emom' || mode === 'tabata') && now >= totalMs) {
      clearInterval(intervalRef.current!)
      setState('done')
      setElapsed(totalMs)
      return
    }

    // EMOM round detection
    if (mode === 'emom') {
      const r = Math.floor(now / 1000 / cfg.intervalSec) + 1
      setEmomRound(r)
    }

    // Tabata phase detection
    if (mode === 'tabata') {
      const sec = Math.floor(now / 1000)
      const cycleSec = cfg.work + cfg.rest
      const insideCycle = sec % cycleSec
      setTabataPhase(insideCycle < cfg.work ? 'work' : 'rest')
      const r = Math.floor(sec / cycleSec) + 1
      setEmomRound(r)
    }
  }

  function start() {
    if (state === 'paused') {
      pauseAccum.current += Date.now() - (startRef.current + pauseAccum.current + elapsed)
    } else {
      startRef.current = Date.now()
      pauseAccum.current = 0
      setElapsed(0); setAmrapRounds(0); setEmomRound(1); setTabataPhase('work')
    }
    setState('running')
    intervalRef.current = setInterval(tick, 100)
  }

  function pause() {
    clearInterval(intervalRef.current!)
    setState('paused')
  }

  function reset() {
    clearInterval(intervalRef.current!)
    setState('idle'); setElapsed(0); setAmrapRounds(0); setEmomRound(1); setTabataPhase('work')
  }

  function finishNow() {
    clearInterval(intervalRef.current!)
    setState('done')
  }

  useEffect(() => () => clearInterval(intervalRef.current!), [])
  // Reset when mode changes
  useEffect(() => { reset() }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Display value
  const displayMs =
    mode === 'fortime' || mode === 'emom' || mode === 'tabata'
      ? Math.max(totalMs - elapsed, 0)
      : mode === 'amrap'
      ? Math.max(totalMs - elapsed, 0)
      : elapsed

  // Tabata sub-display: time in current phase
  const tabataPhaseRemaining = (() => {
    if (mode !== 'tabata') return 0
    const sec = Math.floor(elapsed / 1000)
    const cycleSec = cfg.work + cfg.rest
    const insideCycle = sec % cycleSec
    return tabataPhase === 'work' ? cfg.work - insideCycle : cfg.work + cfg.rest - insideCycle
  })()

  const colorCls =
    state === 'done' ? 'text-gr [text-shadow:0_0_40px_rgba(74,222,128,.4)]'
    : state === 'running'
      ? mode === 'tabata' && tabataPhase === 'rest'
        ? 'text-bl [text-shadow:0_0_40px_rgba(110,195,244,.35)]'
        : 'text-ac [text-shadow:0_0_40px_rgba(200,245,62,.35)]'
    : 'text-t'

  const currentMode = MODES.find(m => m.key === mode)!

  return (
    <>
      <Topbar title="Timer" profile={profile} />

      <div className="p-4 lg:p-6 max-w-2xl mx-auto w-full">
        {/* Mode selector */}
        <div className="flex gap-2.5 flex-wrap justify-center mb-4">
          {MODES.map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              disabled={state === 'running'}
              className={`px-5 py-2.5 rounded-xl border font-barlow font-extrabold text-base lg:text-lg tracking-wide uppercase transition-all disabled:opacity-50 ${
                mode === m.key
                  ? 'bg-ac text-bg border-ac shadow-[0_0_20px_rgba(200,245,62,.25)]'
                  : 'border-[var(--ln2)] text-mu hover:text-t hover:border-mu'
              }`}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="text-center text-fa text-xs mb-5 tracking-wide">{currentMode.desc}</div>

        {/* Config */}
        {state === 'idle' && (
          <div className={`grid gap-3 mb-6 ${
            mode === 'fortime' || mode === 'amrap' ? 'grid-cols-2'
            : mode === 'emom' ? 'grid-cols-2'
            : 'grid-cols-3'
          }`}>
            {(mode === 'fortime' || mode === 'amrap') && (
              <>
                <CfgBox label="MIN" val={cfg.mins} max={99}
                  onChange={v => setCfg(c => ({ ...c, mins: v }))} />
                <CfgBox label="SEG" val={cfg.secs} max={59}
                  onChange={v => setCfg(c => ({ ...c, secs: v }))} />
              </>
            )}
            {mode === 'emom' && (
              <>
                <CfgBox label="RONDA CADA (SEG)" val={cfg.intervalSec} max={300} min={10}
                  onChange={v => setCfg(c => ({ ...c, intervalSec: v }))} />
                <CfgBox label="DURACIÓN (MIN)" val={cfg.durationMin} max={60} min={1}
                  onChange={v => setCfg(c => ({ ...c, durationMin: v }))} />
              </>
            )}
            {mode === 'tabata' && (
              <>
                <CfgBox label="TRABAJO (S)" val={cfg.work} max={120} min={5}
                  onChange={v => setCfg(c => ({ ...c, work: v }))} />
                <CfgBox label="DESCANSO (S)" val={cfg.rest} max={120} min={0}
                  onChange={v => setCfg(c => ({ ...c, rest: v }))} />
                <CfgBox label="RONDAS" val={cfg.rounds} max={30} min={1}
                  onChange={v => setCfg(c => ({ ...c, rounds: v }))} />
              </>
            )}
          </div>
        )}

        {/* EMOM info */}
        {mode === 'emom' && state !== 'idle' && (
          <div className="text-center font-barlow text-lg tracking-[2px] text-mu uppercase mb-1">
            Ronda {emomRound} / {Math.floor((cfg.durationMin * 60) / cfg.intervalSec)}
          </div>
        )}
        {mode === 'tabata' && state !== 'idle' && (
          <div className="text-center font-barlow text-lg tracking-[2px] uppercase mb-1">
            <span className={tabataPhase === 'work' ? 'text-ac' : 'text-bl'}>
              {tabataPhase === 'work' ? 'TRABAJO' : 'DESCANSO'}
            </span>
            <span className="text-mu mx-2">·</span>
            <span className="text-mu">Ronda {emomRound}/{cfg.rounds}</span>
          </div>
        )}

        {/* Display */}
        <div className="text-center my-4">
          <div className={`font-barlow font-black leading-none transition-colors duration-200 ${colorCls}`}
               style={{ fontSize: 'clamp(72px, 22vw, 140px)', letterSpacing: '-2px' }}>
            {fmt(displayMs)}
          </div>
          {mode === 'tabata' && state === 'running' && (
            <div className="font-barlow text-3xl font-black mt-2 text-mu">
              {String(tabataPhaseRemaining).padStart(2, '0')}s
            </div>
          )}
          <div className="font-barlow text-xl tracking-[2px] text-mu mt-1 uppercase">
            {currentMode.label}
          </div>
        </div>

        {/* AMRAP rounds counter */}
        {mode === 'amrap' && state !== 'idle' && (
          <div className="my-6 text-center">
            <div className="text-[10px] uppercase tracking-[2px] text-fa font-bold mb-2">
              RONDAS COMPLETADAS
            </div>
            <div className="flex items-center gap-5 justify-center">
              <button onClick={() => setAmrapRounds(r => Math.max(0, r - 1))}
                      className="w-14 h-14 rounded-full bg-p3 border border-[var(--ln2)] text-t grid place-items-center transition active:scale-95">
                <Minus size={22} strokeWidth={2.5} />
              </button>
              <div className="font-barlow text-7xl font-black leading-none text-ac min-w-[90px]">
                {amrapRounds}
              </div>
              <button onClick={() => setAmrapRounds(r => r + 1)}
                      className="w-14 h-14 rounded-full bg-ac text-bg grid place-items-center font-black transition active:scale-95 shadow-[0_4px_18px_rgba(200,245,62,.3)]">
                <Plus size={22} strokeWidth={3} />
              </button>
            </div>
            <div className="text-fa text-xs mt-2">Toca + cada vez que completes una ronda</div>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2.5 justify-center flex-wrap mt-6">
          {state !== 'running' ? (
            <button onClick={start}
                    className="px-8 py-3.5 rounded-xl bg-ac text-bg font-barlow text-lg font-black tracking-wide uppercase active:scale-95 transition flex items-center gap-2 min-w-[150px] justify-center">
              <Play size={18} fill="currentColor" />
              {state === 'paused' ? 'CONTINUAR' : 'INICIAR'}
            </button>
          ) : (
            <button onClick={pause}
                    className="px-8 py-3.5 rounded-xl border border-[var(--ln2)] text-t font-barlow text-lg font-black tracking-wide uppercase active:scale-95 transition flex items-center gap-2 min-w-[150px] justify-center">
              <Pause size={18} fill="currentColor" />
              PAUSA
            </button>
          )}
          {mode === 'fortime' && state === 'running' && (
            <button onClick={finishNow}
                    className="px-6 py-3.5 rounded-xl bg-gr/10 border border-gr/25 text-gr font-barlow text-lg font-black tracking-wide uppercase active:scale-95 transition flex items-center gap-2">
              <CheckCircle2 size={18} />
              TIME
            </button>
          )}
          <button onClick={reset}
                  className="px-6 py-3.5 rounded-xl border border-[var(--ln2)] text-mu font-barlow text-lg font-black tracking-wide uppercase active:scale-95 transition flex items-center gap-2 hover:text-t">
            <RotateCcw size={18} />
            RESET
          </button>
        </div>

        {/* Result panel */}
        {state === 'done' && (
          <div className="mt-6 p-6 rounded-2xl bg-ac/10 border border-ac/20 text-center">
            <div className="font-barlow text-5xl font-black text-ac leading-none">¡Tiempo!</div>
            <div className="text-mu mt-2 text-sm font-semibold">
              {mode === 'fortime' && `Completaste en ${fmt(elapsed)}`}
              {mode === 'amrap' && `${amrapRounds} rondas en ${fmt(totalMs)}`}
              {mode === 'emom' && `${emomRound} rondas EMOM`}
              {mode === 'tabata' && `${cfg.rounds} rondas Tabata`}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function CfgBox({ label, val, onChange, max, min = 0 }: {
  label: string; val: number; max: number; min?: number; onChange: (v: number) => void
}) {
  // Internal string state lets the user clear the field and retype from scratch.
  // We only commit back to the parent (as a number) when the input is valid.
  const [raw, setRaw] = useState<string>(String(val))

  // Keep local in sync if parent resets externally (mode change / reset button)
  useEffect(() => { setRaw(String(val)) }, [val])

  function commit(next: string) {
    // Empty → do not push yet, keep raw empty so the user can type
    if (next === '') { setRaw(''); return }
    // Only digits (and optional leading zero strip for display)
    if (!/^\d+$/.test(next)) return
    setRaw(next)
    const n = Number(next)
    if (Number.isFinite(n)) {
      onChange(Math.max(min, Math.min(max, n)))
    }
  }

  function handleBlur() {
    // On blur, if empty, snap back to min
    if (raw === '') { setRaw(String(min)); onChange(min); return }
    const n = Number(raw)
    const clamped = Math.max(min, Math.min(max, Number.isFinite(n) ? n : min))
    setRaw(String(clamped))
    onChange(clamped)
  }

  return (
    <div className="bg-p border border-[var(--ln)] rounded-2xl p-4 text-center">
      <div className="text-[10px] uppercase tracking-[1.5px] text-mu font-bold mb-2">{label}</div>
      <input
        type="text" inputMode="numeric" pattern="[0-9]*"
        value={raw}
        onChange={e => commit(e.target.value)}
        onBlur={handleBlur}
        onFocus={e => e.currentTarget.select()}
        className="w-full text-center bg-transparent border-0 font-barlow text-4xl font-black text-t outline-none"
      />
    </div>
  )
}
