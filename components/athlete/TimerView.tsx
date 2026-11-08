'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import type { Profile } from '@/lib/types/database'
import { Play, Pause, RotateCcw, Flag, Plus, Minus, Volume2, VolumeX, ClipboardCheck } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export type TimerMode = 'fortime' | 'amrap' | 'emom' | 'tabata'
type TimerState = 'idle' | 'countdown' | 'running' | 'paused' | 'done'

const MODES: { key: TimerMode; label: string; desc: string }[] = [
  { key: 'fortime', label: 'For Time', desc: 'Cronómetro hacia arriba hasta el time cap. Toca “Terminé” al acabar.' },
  { key: 'amrap',   label: 'AMRAP',    desc: 'Cuenta regresiva. Suma una ronda cada vez que la completes.' },
  { key: 'emom',    label: 'EMOM',     desc: 'Una ronda al inicio de cada intervalo, con pitido en cada cambio.' },
  { key: 'tabata',  label: 'Tabata',   desc: 'Trabajo y descanso alternados, con pitido en cada fase.' },
]

const GET_READY_SECS = 3

interface Cfg {
  mins: number; secs: number   // For Time cap / AMRAP duration
  durationMin: number          // EMOM total
  intervalSec: number          // EMOM interval
  work: number; rest: number; rounds: number  // Tabata
}

// ── Beeps via WebAudio: no audio files, works offline in the PWA ─────────────────
function useBeeper() {
  const ctxRef = useRef<AudioContext | null>(null)
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  const unlock = useCallback(() => {
    // Must be created/resumed inside a user gesture on iOS
    if (!ctxRef.current) {
      const Ctor = window.AudioContext ?? (window as any).webkitAudioContext
      if (Ctor) ctxRef.current = new Ctor()
    }
    ctxRef.current?.resume?.()
  }, [])

  const beep = useCallback((kind: 'tick' | 'go' | 'end') => {
    const ctx = ctxRef.current
    if (!ctx || mutedRef.current) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = kind === 'tick' ? 660 : kind === 'go' ? 990 : 520
    const dur = kind === 'end' ? 0.9 : kind === 'go' ? 0.45 : 0.15
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + dur)
  }, [])

  return { beep, unlock, muted, setMuted }
}

// ── Keep the phone screen on while the clock runs ──────────────────────────────
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: any = null
    let cancelled = false
    const acquire = async () => {
      try { lock = await (navigator as any).wakeLock.request('screen') } catch {}
      if (cancelled) lock?.release?.()
    }
    acquire()
    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release?.()
    }
  }, [active])
}

function fmt(ms: number) {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(sec / 60); const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function TimerView({ profile, initialMode, initialMins, wodTitle }: {
  profile: Profile
  initialMode?: TimerMode
  initialMins?: number
  wodTitle?: string
}) {
  const [mode, setMode]       = useState<TimerMode>(initialMode ?? 'fortime')
  const [state, setState]     = useState<TimerState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [getReady, setGetReady] = useState(GET_READY_SECS)
  const [cfg, setCfg] = useState<Cfg>(() => {
    const mins = initialMins && initialMins > 0 ? initialMins : 12
    return { mins, secs: 0, durationMin: initialMins && initialMode === 'emom' ? initialMins : 10, intervalSec: 60, work: 20, rest: 10, rounds: 8 }
  })
  const [amrapRounds, setAmrapRounds] = useState(0)

  const { beep, unlock, muted, setMuted } = useBeeper()
  useWakeLock(state === 'running' || state === 'countdown')

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef    = useRef(0)
  const pausedAtRef = useRef(0)
  const lastSecRef  = useRef(-1)

  const totalMs =
    mode === 'fortime' || mode === 'amrap' ? (cfg.mins * 60 + cfg.secs) * 1000
    : mode === 'emom' ? cfg.durationMin * 60 * 1000
    : cfg.rounds * (cfg.work + cfg.rest) * 1000

  // Refs so the interval callback never reads stale config
  const live = useRef({ mode, cfg, totalMs })
  live.current = { mode, cfg, totalMs }

  const stopInterval = () => { if (intervalRef.current) clearInterval(intervalRef.current); intervalRef.current = null }

  const tick = useCallback(() => {
    const { mode, cfg, totalMs } = live.current
    const now = Date.now() - startRef.current
    const sec = Math.floor(now / 1000)

    if (now >= totalMs) {
      stopInterval()
      setElapsed(totalMs)
      setState('done')
      beep('end')
      return
    }
    setElapsed(now)

    if (sec === lastSecRef.current) return
    lastSecRef.current = sec

    // Boundary beeps: last 3 s of each interval + "go" on the change
    if (mode === 'emom') {
      const into = sec % cfg.intervalSec
      if (into === 0 && sec > 0) beep('go')
      else if (cfg.intervalSec - into <= 3) beep('tick')
    } else if (mode === 'tabata') {
      const cycle = cfg.work + cfg.rest
      const into = sec % cycle
      if ((into === 0 && sec > 0) || into === cfg.work) beep('go')
      else if ((into < cfg.work && cfg.work - into <= 3) || (into >= cfg.work && cycle - into <= 3)) beep('tick')
    } else {
      const left = Math.ceil((totalMs - now) / 1000)
      if (left <= 3) beep('tick')
    }
  }, [beep])

  function beginRunning() {
    startRef.current = Date.now()
    lastSecRef.current = -1
    setElapsed(0); setAmrapRounds(0)
    setState('running')
    beep('go')
    intervalRef.current = setInterval(tick, 100)
  }

  function start() {
    unlock()
    if (state === 'paused') {
      // shift the origin by however long we were paused
      startRef.current += Date.now() - pausedAtRef.current
      setState('running')
      intervalRef.current = setInterval(tick, 100)
      return
    }
    setState('countdown')
    setGetReady(GET_READY_SECS)
    beep('tick')
    let n = GET_READY_SECS
    intervalRef.current = setInterval(() => {
      n -= 1
      if (n <= 0) { stopInterval(); beginRunning(); return }
      setGetReady(n)
      beep('tick')
    }, 1000)
  }

  function pause() {
    stopInterval()
    pausedAtRef.current = Date.now()
    setState('paused')
  }

  function reset() {
    stopInterval()
    setState('idle'); setElapsed(0); setAmrapRounds(0); setGetReady(GET_READY_SECS)
  }

  function finishNow() {
    stopInterval()
    setState('done')
    beep('end')
  }

  useEffect(() => () => stopInterval(), [])
  useEffect(() => { reset() }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const sec = Math.floor(elapsed / 1000)
  const emomTotalRounds = Math.max(1, Math.floor((cfg.durationMin * 60) / cfg.intervalSec))
  const emomRound = Math.min(emomTotalRounds, Math.floor(sec / cfg.intervalSec) + 1)
  const cycle = cfg.work + cfg.rest
  const tabataRound = Math.min(cfg.rounds, Math.floor(sec / cycle) + 1)
  const tabataPhase: 'work' | 'rest' = sec % cycle < cfg.work ? 'work' : 'rest'
  const tabataPhaseLeft = tabataPhase === 'work' ? cfg.work - (sec % cycle) : cycle - (sec % cycle)
  const emomIntervalLeft = cfg.intervalSec - (sec % cfg.intervalSec)

  // For Time counts up (you read your own time); everything else counts down.
  const displayMs = mode === 'fortime' ? elapsed : Math.max(totalMs - elapsed, 0)

  const running = state === 'running'
  const isRest = mode === 'tabata' && running && tabataPhase === 'rest'
  const currentMode = MODES.find(m => m.key === mode)!

  const resultLine =
    mode === 'fortime' ? (elapsed >= totalMs ? `Time cap ${fmt(totalMs)}` : `Tu tiempo: ${fmt(elapsed)}`)
    : mode === 'amrap' ? `${amrapRounds} ronda${amrapRounds === 1 ? '' : 's'} completas`
    : mode === 'emom' ? `${emomTotalRounds} rondas EMOM`
    : `${cfg.rounds} rondas Tabata`

  return (
    <>
      <Topbar title="Timer" profile={profile} />

      <div className="p-4 lg:p-6 max-w-2xl mx-auto w-full">
        {wodTitle && (
          <div className="mb-4 text-center text-sm text-mu">
            WOD de hoy: <span className="text-t font-semibold">{wodTitle}</span>
          </div>
        )}

        {/* Mode selector — segmented control */}
        <div role="tablist" aria-label="Tipo de timer" className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-p mb-3">
          {MODES.map(m => (
            <button
              key={m.key} role="tab" aria-selected={mode === m.key}
              onClick={() => setMode(m.key)}
              disabled={running || state === 'countdown'}
              className={cn(
                'h-11 rounded-xl font-barlow font-extrabold text-base tracking-wide uppercase transition-colors disabled:opacity-40',
                mode === m.key ? 'bg-p3 text-t' : 'text-mu hover:text-t',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-center text-mu text-sm mb-6 text-pretty">{currentMode.desc}</p>

        {/* Config */}
        {state === 'idle' && (
          <div className={cn('grid gap-3 mb-6', mode === 'tabata' ? 'grid-cols-3' : 'grid-cols-2')}>
            {(mode === 'fortime' || mode === 'amrap') && (
              <>
                <CfgBox label={mode === 'fortime' ? 'Cap · min' : 'Minutos'} val={cfg.mins} max={99}
                  onChange={v => setCfg(c => ({ ...c, mins: v }))} />
                <CfgBox label="Segundos" val={cfg.secs} max={59}
                  onChange={v => setCfg(c => ({ ...c, secs: v }))} />
              </>
            )}
            {mode === 'emom' && (
              <>
                <CfgBox label="Cada (seg)" val={cfg.intervalSec} max={300} min={10}
                  onChange={v => setCfg(c => ({ ...c, intervalSec: v }))} />
                <CfgBox label="Total (min)" val={cfg.durationMin} max={60} min={1}
                  onChange={v => setCfg(c => ({ ...c, durationMin: v }))} />
              </>
            )}
            {mode === 'tabata' && (
              <>
                <CfgBox label="Trabajo (s)" val={cfg.work} max={120} min={5}
                  onChange={v => setCfg(c => ({ ...c, work: v }))} />
                <CfgBox label="Descanso (s)" val={cfg.rest} max={120} min={0}
                  onChange={v => setCfg(c => ({ ...c, rest: v }))} />
                <CfgBox label="Rondas" val={cfg.rounds} max={30} min={1}
                  onChange={v => setCfg(c => ({ ...c, rounds: v }))} />
              </>
            )}
          </div>
        )}

        {/* Round / phase line */}
        <div className="h-8 text-center font-barlow text-xl tracking-[2px] uppercase tabular-nums" aria-live="polite">
          {mode === 'emom' && (running || state === 'paused') && (
            <span className="text-mu">Ronda <span className="text-t">{emomRound}</span> / {emomTotalRounds}</span>
          )}
          {mode === 'tabata' && (running || state === 'paused') && (
            <>
              <span className={isRest ? 'text-bl' : 'text-ac'}>{tabataPhase === 'work' ? 'Trabajo' : 'Descanso'}</span>
              <span className="text-fa mx-2">·</span>
              <span className="text-mu">Ronda {tabataRound}/{cfg.rounds}</span>
            </>
          )}
          {mode === 'fortime' && state !== 'idle' && state !== 'countdown' && (
            <span className="text-mu">Cap {fmt(totalMs)}</span>
          )}
        </div>

        {/* Big clock */}
        <div className="text-center my-2">
          <div
            className={cn(
              'font-barlow font-black leading-none tabular-nums transition-colors duration-200',
              state === 'done' ? 'text-gr' : state === 'countdown' ? 'text-or' : running ? (isRest ? 'text-bl' : 'text-ac') : 'text-t',
            )}
            style={{ fontSize: 'clamp(84px, 26vw, 160px)', letterSpacing: '-0.02em' }}
            aria-live="off"
          >
            {state === 'countdown' ? getReady : fmt(displayMs)}
          </div>
          <div className="h-9 mt-1 font-barlow text-2xl font-black text-mu tabular-nums">
            {state === 'countdown' && <span className="text-xl tracking-[2px] uppercase">Prepárate</span>}
            {mode === 'tabata' && running && `${String(tabataPhaseLeft).padStart(2, '0')}s`}
            {mode === 'emom' && running && `${String(emomIntervalLeft).padStart(2, '0')}s`}
          </div>
        </div>

        {/* AMRAP rounds counter */}
        {mode === 'amrap' && state !== 'idle' && state !== 'countdown' && (
          <div className="my-6 text-center">
            <div className="text-[11px] uppercase tracking-[1.6px] text-mu font-bold mb-3">Rondas completadas</div>
            <div className="flex items-center gap-6 justify-center">
              <button onClick={() => setAmrapRounds(r => Math.max(0, r - 1))} aria-label="Restar una ronda"
                className="size-16 rounded-full bg-p2 text-t grid place-items-center active:scale-[0.96] transition-transform">
                <Minus size={24} strokeWidth={2.5} aria-hidden />
              </button>
              <div className="font-barlow text-7xl font-black leading-none text-t min-w-[96px] tabular-nums" aria-live="polite">
                {amrapRounds}
              </div>
              <button onClick={() => setAmrapRounds(r => r + 1)} aria-label="Sumar una ronda"
                className="size-16 rounded-full bg-ac text-onac grid place-items-center active:scale-[0.96] transition-transform">
                <Plus size={24} strokeWidth={3} aria-hidden />
              </button>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3 justify-center items-center flex-wrap mt-6">
          {state === 'countdown' ? (
            <button onClick={reset} className="h-14 px-8 rounded-full bg-p2 text-t font-barlow text-lg font-black tracking-wide uppercase active:scale-[0.96] transition-transform">
              Cancelar
            </button>
          ) : !running ? (
            <button onClick={start} disabled={state === 'done'}
              className="h-14 px-9 rounded-full bg-ac text-onac font-barlow text-lg font-black tracking-wide uppercase active:scale-[0.96] transition-transform flex items-center gap-2 min-w-[160px] justify-center disabled:opacity-40">
              <Play size={18} fill="currentColor" aria-hidden />
              {state === 'paused' ? 'Continuar' : 'Iniciar'}
            </button>
          ) : (
            <button onClick={pause}
              className="h-14 px-9 rounded-full bg-p2 text-t font-barlow text-lg font-black tracking-wide uppercase active:scale-[0.96] transition-transform flex items-center gap-2 min-w-[160px] justify-center">
              <Pause size={18} fill="currentColor" aria-hidden />
              Pausa
            </button>
          )}
          {mode === 'fortime' && running && (
            <button onClick={finishNow}
              className="h-14 px-7 rounded-full bg-gr/15 text-gr font-barlow text-lg font-black tracking-wide uppercase active:scale-[0.96] transition-transform flex items-center gap-2">
              <Flag size={18} aria-hidden />
              Terminé
            </button>
          )}
          {(state === 'paused' || state === 'done') && (
            <button onClick={reset} aria-label="Reiniciar timer"
              className="size-14 rounded-full bg-p2 text-mu hover:text-t grid place-items-center active:scale-[0.96] transition-transform">
              <RotateCcw size={20} aria-hidden />
            </button>
          )}
          <button onClick={() => { unlock(); setMuted(m => !m) }} aria-label={muted ? 'Activar sonido' : 'Silenciar'} aria-pressed={muted}
            className="size-14 rounded-full bg-p2 text-mu hover:text-t grid place-items-center active:scale-[0.96] transition-transform">
            {muted ? <VolumeX size={20} aria-hidden /> : <Volume2 size={20} aria-hidden />}
          </button>
        </div>

        {/* Result panel */}
        {state === 'done' && (
          <div className="mt-8 p-6 rounded-2xl bg-p text-center" role="status">
            <div className="font-barlow text-4xl font-black text-gr leading-none">¡Tiempo!</div>
            <div className="text-t mt-2 text-lg font-semibold tabular-nums">{resultLine}</div>
            {(mode === 'fortime' || mode === 'amrap') && (
              <Link href="/wod" className="mt-5 inline-flex items-center gap-2 h-12 px-6 rounded-full bg-ac text-onac font-bold active:scale-[0.96] transition-transform">
                <ClipboardCheck size={18} aria-hidden />
                Registrar en el WOD del día
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function CfgBox({ label, val, onChange, max, min = 0 }: {
  label: string; val: number; max: number; min?: number; onChange: (v: number) => void
}) {
  // Local string state lets the user clear the field and retype from scratch.
  const [raw, setRaw] = useState<string>(String(val))
  useEffect(() => { setRaw(String(val)) }, [val])

  function commit(next: string) {
    if (next === '') { setRaw(''); return }
    if (!/^\d+$/.test(next)) return
    setRaw(next)
    // Don't clamp mid-typing: "15" passes through "1", which is below a min of 10.
    // Only push values already in range; blur clamps the rest.
    const n = Number(next)
    if (n >= min && n <= max) onChange(n)
  }

  function handleBlur() {
    if (raw === '') { setRaw(String(min)); onChange(min); return }
    const clamped = Math.max(min, Math.min(max, Number(raw) || min))
    setRaw(String(clamped))
    onChange(clamped)
  }

  return (
    <label className="block bg-p rounded-2xl p-4 text-center cursor-text focus-within:ring-1 focus-within:ring-ac/60">
      <span className="block text-[11px] uppercase tracking-[1.4px] text-mu font-bold mb-2">{label}</span>
      <input
        type="text" inputMode="numeric" pattern="[0-9]*"
        value={raw}
        onChange={e => commit(e.target.value)}
        onBlur={handleBlur}
        onFocus={e => e.currentTarget.select()}
        className="w-full text-center bg-transparent border-0 font-barlow text-4xl font-black text-t outline-none tabular-nums"
      />
    </label>
  )
}
