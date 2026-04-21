'use client'
import { Trophy, Heart, Target } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

const WIN_QUOTES = [
  '¡Has superado tus propios límites! Sigue así.',
  'Nuevo techo. Nuevo estándar. Eres imparable.',
  '¡Pura fuerza! Tu esfuerzo acaba de quedar en la historia.',
  'Así se construye un atleta de élite: un récord a la vez.',
]
const EQUAL_QUOTES = [
  'Igualar un máximo también es progreso. Consistencia > todo.',
  'Mantener el estándar es el paso previo a romperlo.',
  'Sólido como siempre. El próximo PR está cerca.',
]
const LOSE_QUOTES = [
  'Un día fuera no te define. Descansa, recupera, vuelve más fuerte.',
  'Los campeones también caen. Lo importante es levantarse más fuerte.',
  'Cada rep cuenta. Mañana es otra oportunidad.',
  'El progreso no es lineal. Confía en el proceso.',
]

export function RmCelebrationModal({ isNew, equalToPrev = false, onClose }: { isNew: boolean; equalToPrev?: boolean; onClose: () => void }) {
  let Icon = Target
  let color = 'text-mu'
  let title = '¡Registro guardado!'
  let quotePool = LOSE_QUOTES
  if (isNew) { Icon = Trophy; color = 'text-ac'; title = '¡NUEVO RÉCORD!'; quotePool = WIN_QUOTES }
  else if (equalToPrev) { Icon = Target; color = 'text-bl'; title = 'Empate con tu máximo'; quotePool = EQUAL_QUOTES }
  else { Icon = Heart; color = 'text-mu'; title = 'Registro guardado'; quotePool = LOSE_QUOTES }
  const quote = quotePool[Math.floor(Math.random() * quotePool.length)]

  return (
    <Modal open onClose={onClose} title={title} subtitle={isNew ? 'Has roto tu máximo anterior' : undefined}>
      <div className="flex flex-col items-center text-center py-4">
        <div className={`w-20 h-20 rounded-full bg-p3 border-2 border-[var(--ln)] grid place-items-center mb-4 ${color} ${isNew ? 'animate-pulse' : ''}`}>
          <Icon size={42} strokeWidth={isNew ? 2.5 : 2} fill={isNew ? 'currentColor' : 'none'} />
        </div>
        <p className={`font-barlow text-xl font-extrabold tracking-wide uppercase ${color} mb-2`}>
          {isNew ? '¡Felicidades!' : equalToPrev ? 'Consistente' : 'Buen trabajo'}
        </p>
        <p className="text-t text-sm leading-relaxed max-w-sm">{quote}</p>
      </div>
      <Button onClick={onClose} className="w-full mt-2">Cerrar</Button>
    </Modal>
  )
}
