'use client'
import { useMemo } from 'react'
import { Trophy, Target, Check, Sparkles } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Confetti } from '@/components/ui/Confetti'
import { cn } from '@/lib/utils/cn'

export type CelebrationKind = 'new' | 'first' | 'equal' | 'saved'

export interface Celebration {
  kind: CelebrationKind
  movement: string
  value: string        // already formatted, e.g. "102.5 kg" or "3:45"
  diff?: string | null // e.g. "+5 kg" or "−0:12"
}

const QUOTES: Record<CelebrationKind, string[]> = {
  new: [
    'Nuevo techo, nuevo estándar.',
    'Ese es el resultado de todas las sesiones que nadie vio.',
    'Un récord a la vez. Así se construye un atleta.',
  ],
  first: [
    'Primer registro: ahora tienes contra quién competir. Contra ti.',
    'Todo progreso empieza con una primera marca.',
  ],
  equal: [
    'Igualar tu máximo también es progreso. El próximo cae.',
    'Consistencia antes que intensidad. Vas bien.',
  ],
  saved: [
    'Registrado. No todos los días son de récord, y está bien.',
    'Cada registro cuenta para ver tu progreso real.',
  ],
}

const META: Record<CelebrationKind, { title: string; Icon: typeof Trophy; tone: string }> = {
  new:   { title: '¡Nuevo récord!',     Icon: Trophy,   tone: 'text-ac bg-ac/15' },
  first: { title: 'Primer registro',    Icon: Sparkles, tone: 'text-ac bg-ac/15' },
  equal: { title: 'Igualaste tu récord', Icon: Target,  tone: 'text-bl bg-bl/15' },
  saved: { title: 'Registro guardado',  Icon: Check,    tone: 'text-gr bg-gr/15' },
}

export function RmCelebrationModal({ celebration, onClose }: { celebration: Celebration; onClose: () => void }) {
  const { kind, movement, value, diff } = celebration
  const { title, Icon, tone } = META[kind]
  const quote = useMemo(() => QUOTES[kind][Math.floor(Math.random() * QUOTES[kind].length)], [kind])
  const party = kind === 'new' || kind === 'first'

  return (
    <Modal open onClose={onClose}>
      <div className="relative flex flex-col items-center text-center pt-4 pb-2">
        {party && <Confetti />}
        <div className={cn('relative size-20 rounded-full grid place-items-center mb-5 animate-pop', tone)}>
          {party && <span className="absolute inset-0 rounded-full bg-ac/20 animate-ping-slow" aria-hidden />}
          <Icon size={38} strokeWidth={2.2} aria-hidden />
        </div>
        <h2 className="font-barlow text-3xl font-black tracking-wide uppercase animate-fade-up">{title}</h2>
        <p className="text-mu text-sm mt-1 animate-fade-up [animation-delay:60ms]">{movement}</p>
        <div className="mt-4 font-barlow text-6xl font-black tabular-nums leading-none animate-fade-up [animation-delay:120ms]">{value}</div>
        {diff && (
          <div className="mt-3 px-3 py-1 rounded-full bg-gr/15 text-gr text-sm font-bold tabular-nums animate-fade-up [animation-delay:180ms]">
            {diff} vs tu récord anterior
          </div>
        )}
        <p className="text-mu text-sm leading-relaxed max-w-xs mt-5 text-pretty animate-fade-up [animation-delay:240ms]">{quote}</p>
      </div>
      <Button onClick={onClose} size="lg" className="w-full mt-5">
        {party ? 'Seguir entrenando' : 'Listo'}
      </Button>
    </Modal>
  )
}
