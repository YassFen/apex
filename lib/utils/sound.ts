// Interface sounds, synthesized with Web Audio (no audio files to download).
// Rules followed (userinterface.wiki): one shared AudioContext, filtered noise for taps,
// oscillators for tones, exponential decay to 0.001, quiet by default, a switch to turn them off,
// silent when the device asks for reduced motion, and never on typing.

export type SoundName = 'tap' | 'tick' | 'toggleOn' | 'toggleOff' | 'open' | 'success' | 'pr' | 'error' | 'plate' | 'start'

export const SOUND_STORAGE_KEY = 'apex.sound'
const VOLUME = 0.3

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

export function soundEnabled(): boolean {
  try { return localStorage.getItem(SOUND_STORAGE_KEY) !== '0' } catch { return true }
}
export function setSoundEnabled(on: boolean) {
  try { localStorage.setItem(SOUND_STORAGE_KEY, on ? '1' : '0') } catch {}
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (!noise) {
    noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.2), c.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return noise
}

/** Short filtered-noise click. */
function click(c: AudioContext, t: number, { freq = 4200, q = 3, dur = 0.012, gain = 0.5, type = 'bandpass' as BiquadFilterType } = {}) {
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c)
  const f = c.createBiquadFilter()
  f.type = type; f.frequency.value = freq; f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(gain * VOLUME, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  src.connect(f).connect(g).connect(c.destination)
  src.start(t); src.stop(t + dur + 0.01)
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect() }
}

/** Sine/triangle note with a quick attack and exponential decay; optional pitch glide. */
function tone(c: AudioContext, t: number, opts: { from?: number; to?: number; dur?: number; gain?: number; wave?: OscillatorType } = {}) {
  const { from = 660, dur = 0.12, gain = 0.5, wave = 'sine' } = opts
  const to = opts.to ?? from
  const o = c.createOscillator()
  o.type = wave
  o.frequency.setValueAtTime(from, t)
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.001, t)
  g.gain.exponentialRampToValueAtTime(gain * VOLUME, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g).connect(c.destination)
  o.start(t); o.stop(t + dur + 0.02)
  o.onended = () => { o.disconnect(); g.disconnect() }
}

const SOUNDS: Record<SoundName, (c: AudioContext, t: number) => void> = {
  // Moving between tabs, picking a chip.
  tap:       (c, t) => click(c, t, { freq: 4200, dur: 0.012, gain: 0.45 }),
  // Steppers and small selections: lighter than a tap.
  tick:      (c, t) => click(c, t, { freq: 5600, q: 4, dur: 0.008, gain: 0.3 }),
  toggleOn:  (c, t) => tone(c, t, { from: 520, to: 780, dur: 0.07, gain: 0.35 }),
  toggleOff: (c, t) => tone(c, t, { from: 620, to: 420, dur: 0.07, gain: 0.3 }),
  // A sheet sliding up: soft low breath.
  open:      (c, t) => click(c, t, { type: 'lowpass', freq: 900, q: 0.7, dur: 0.07, gain: 0.25 }),
  // Saved / logged: two rising notes.
  success:   (c, t) => { tone(c, t, { from: 660, dur: 0.1, gain: 0.4 }); tone(c, t + 0.08, { from: 990, dur: 0.16, gain: 0.4 }) },
  // New record: a bright rising triad, the loudest sound in the app.
  pr:        (c, t) => { [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.07, { from: f, dur: 0.22, gain: 0.5, wave: 'triangle' })) },
  // Something failed: low, short, not harsh.
  error:     (c, t) => { tone(c, t, { from: 220, to: 170, dur: 0.16, gain: 0.45, wave: 'triangle' }) },
  // A plate sliding onto the bar: metal thunk (low body + short clank).
  plate:     (c, t) => { tone(c, t, { from: 120, to: 70, dur: 0.11, gain: 0.6 }); click(c, t, { freq: 2400, q: 6, dur: 0.03, gain: 0.3 }) },
  // Timer start / go.
  start:     (c, t) => tone(c, t, { from: 880, dur: 0.18, gain: 0.45, wave: 'triangle' }),
}

/** Plays an interface sound if sounds are on. Safe to call anywhere on the client. */
export function playSound(name: SoundName) {
  try {
    if (!soundEnabled()) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const c = audio()
    if (!c) return
    SOUNDS[name](c, c.currentTime)
  } catch { /* audio is a nicety: never break the action */ }
}
