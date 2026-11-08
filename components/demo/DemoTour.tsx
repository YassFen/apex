'use client'
// DEMO MODE — the bar on top of the demo (mode switch, tour, exit) and a guided tour
// that walks through the app, can be closed at any step and resumed later.
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Compass, X, SignOut, ArrowsLeftRight } from '@/components/ui/icons'
import { useShell, type ViewMode } from '@/lib/hooks/useShell'
import { cn } from '@/lib/utils/cn'

interface Step { path: string; mode: ViewMode; target?: string; title: string; body: string }

const STEPS: Step[] = [
  { path: '/dashboard', mode: 'athlete', title: 'Bienvenido a la demo de APEX',
    body: 'Entraste como Martín, coach de CrossFit Cordillera que además entrena. Todo lo que ves son datos de ejemplo: puedes tocar, registrar y probar sin miedo.' },
  { path: '/dashboard', mode: 'athlete', target: 'demo-mode', title: 'Atleta o coach',
    body: 'Con este botón ves la app como la ve un atleta o como la ve el coach. Puedes cambiar en cualquier momento, también en Configuración.' },
  { path: '/dashboard', mode: 'athlete', target: 'hero', title: 'Tu estado de un vistazo',
    body: 'Desliza el anillo: recuperación de cada músculo, tu semana, tu racha, tus récords. Toca "Editar" para elegir qué fichas mostrar. "Generar WOD" arma un entreno según lo que tienes más descansado.' },
  { path: '/dashboard', mode: 'athlete', target: 'personalize', title: 'Tu inicio, a tu manera',
    body: 'En "Personalizar" ordenas los bloques arrastrándolos y apagas los que no uses: metas, tops, gráfico de fuerza, constancia…' },
  { path: '/wod', mode: 'athlete', title: 'El WOD del día',
    body: 'El WOD aparece apenas el coach lo publica, con pestañas por horario de clase. Toca un movimiento para ver cómo se hace, registra tu resultado y dale fuego a tus compañeros.' },
  { path: '/calendar', mode: 'athlete', title: 'Calendario',
    body: 'WODs programados, competencias y tus días entrenados. Cambia a "Semana por hora" para ver las clases en su horario.' },
  { path: '/calendar/event/ev-throwdown', mode: 'athlete', title: '¿Qué tan preparado vas?',
    body: 'Cada carga de la competencia se compara con tus récords: te dice si es cómoda o pesada, cuántas reps seguidas puedes y cómo partir las series.' },
  { path: '/challenges', mode: 'athlete', title: 'Retos del box',
    body: 'Cualquiera del box crea un reto, como "100 dominadas esta semana". Te unes, sumas lo que haces y subes en el ranking.' },
  { path: '/competitions', mode: 'athlete', title: 'Tu historial de competencias',
    body: 'Puesto final y marca en cada workout, con un gráfico de cómo vas mejorando entre competencias.' },
  { path: '/movements', mode: 'athlete', title: 'Biblioteca de ejercicios',
    body: 'Cómo se hace cada movimiento, qué músculos trabaja, video y tus récords. El coach puede agregar los de su box con foto.' },
  { path: '/calc', mode: 'athlete', title: 'Calculadora',
    body: 'Tu 1RM estimado, los porcentajes, qué discos poner en la barra y una rampa de calentamiento.' },
  { path: '/dashboard', mode: 'coach', title: 'Ahora como coach',
    body: 'El inicio del coach muestra las clases de hoy, la actividad del box, los atletas que hace días no vienen y los retos. También se personaliza.' },
  { path: '/coach/publish-wod', mode: 'coach', title: 'Programar WODs',
    body: 'Elige el día (hasta 2 semanas adelante) y la clase (07:00, 19:00…). Decides si los atletas lo ven desde ya o se revela ese día.' },
  { path: '/coach/athletes', mode: 'coach', title: 'Tus atletas',
    body: 'Quién entrena, cuántos WODs hizo en el mes y quién lleva días sin venir, para escribirle a tiempo.' },
  { path: '/settings', mode: 'coach', title: 'Eso es todo',
    body: 'En Configuración están tu perfil, el box, los avisos y la apariencia. Cierra el recorrido y explora libre; puedes retomarlo con el botón "Recorrido".' },
]

const KEY = 'apex.demoTour'
type TourState = { step: number; open: boolean; seen: boolean }

function load(): TourState {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (v && typeof v.step === 'number') return v } catch {}
  return { step: 0, open: true, seen: false }
}

/** Sticky orange bar: mode switch, tour and exit. */
export function DemoBar({ onTour }: { onTour: () => void }) {
  const { viewMode, setViewMode } = useShell()
  return (
    <div className="relative z-30 bg-or text-white pt-[env(safe-area-inset-top)]">
      <div className="h-11 px-3 flex items-center gap-2 text-xs font-semibold">
        <span className="hidden sm:inline">Demo con datos de ejemplo</span>
        <span className="sm:hidden">Demo</span>
        <div data-tour="demo-mode" className="ml-auto grid grid-cols-2 p-0.5 rounded-full bg-white/20">
          {(['athlete', 'coach'] as const).map(m => (
            <button key={m} type="button" onClick={() => setViewMode(m)} aria-pressed={viewMode === m}
              className={cn('relative isolate h-8 px-3 rounded-full flex items-center gap-1', viewMode === m ? 'text-or' : 'text-white')}>
              {viewMode === m && <motion.span layoutId="demo-mode-pill" className="absolute inset-0 -z-10 rounded-full bg-white" transition={{ type: 'spring', stiffness: 500, damping: 34 }} />}
              {m === 'athlete' ? 'Atleta' : 'Coach'}
            </button>
          ))}
        </div>
        <button type="button" onClick={onTour} className="h-8 px-3 rounded-full bg-white/20 flex items-center gap-1"><Compass size={15} weight="bold" />Recorrido</button>
        <a href="/demo/exit" aria-label="Salir de la demo" className="h-8 w-8 rounded-full bg-white/20 grid place-items-center"><SignOut size={15} weight="bold" /></a>
      </div>
    </div>
  )
}

/** Highlights the step's target element with a ring that follows it. */
function Spotlight({ selector }: { selector?: string }) {
  const [box, setBox] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    if (!selector) { setBox(null); return }
    let raf = 0, tries = 0
    const find = () => {
      const el = document.querySelector(`[data-tour="${selector}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        const update = () => setBox(el.getBoundingClientRect())
        update()
        const t = setInterval(update, 250)
        window.addEventListener('scroll', update, { passive: true })
        return () => { clearInterval(t); window.removeEventListener('scroll', update) }
      }
      if (tries++ < 40) raf = requestAnimationFrame(find)
    }
    const cleanup = find()
    return () => { cancelAnimationFrame(raf); cleanup?.() }
  }, [selector])
  if (!box) return null
  return (
    <motion.div className="fixed z-[55] pointer-events-none rounded-[24px] ring-4 ring-or shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]"
      initial={{ opacity: 0 }} animate={{ opacity: 1, top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }} />
  )
}

export function DemoTour() {
  const router = useRouter()
  const pathname = usePathname()
  const { viewMode, setViewMode } = useShell()
  const [state, setState] = useState<TourState | null>(null)

  useEffect(() => { setState(load()) }, [])
  const save = useCallback((next: TourState) => {
    setState(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
  }, [])

  const goTo = useCallback((n: number) => {
    const step = STEPS[Math.max(0, Math.min(STEPS.length - 1, n))]
    if (step.mode !== viewMode) setViewMode(step.mode)
    if (step.path !== pathname) router.push(step.path)
    save({ step: STEPS.indexOf(step), open: true, seen: true })
  }, [viewMode, setViewMode, pathname, router, save])

  // Resume: go back to the page where the person left the tour.
  const resume = () => goTo(state?.step ?? 0)

  if (!state) return null
  const step = STEPS[state.step]
  const onPage = step.path === pathname
  const last = state.step === STEPS.length - 1

  return (
    <>
      <DemoBarPortal onTour={resume} />
      <AnimatePresence>
        {state.open && (
          <>
            {onPage && <Spotlight key={`${state.step}-${step.target}`} selector={step.target} />}
            <motion.div key="card" role="dialog" aria-label="Recorrido de la demo"
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              className="fixed z-[56] inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] lg:bottom-6 lg:left-auto lg:right-6 lg:w-[400px] rounded-[28px] bg-t text-bg p-5 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.55)]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold text-bg/60 tabular-nums">{state.step + 1} de {STEPS.length}</span>
                <div className="flex-1 h-1 rounded-full bg-bg/15 overflow-hidden">
                  <motion.div className="h-full bg-or rounded-full" animate={{ width: `${((state.step + 1) / STEPS.length) * 100}%` }} transition={{ duration: 0.4 }} />
                </div>
                <button type="button" onClick={() => save({ ...state, open: false })} aria-label="Cerrar recorrido"
                  className="size-8 rounded-full grid place-items-center hover:bg-bg/10"><X size={16} weight="bold" /></button>
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={state.step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
                  <h2 className="font-display text-xl font-bold tracking-tight">{step.title}</h2>
                  <p className="text-[15px] text-bg/80 mt-1.5 text-pretty">{step.body}</p>
                </motion.div>
              </AnimatePresence>
              {!onPage && <p className="text-xs text-bg/60 mt-2">Estás en otra pantalla. “Siguiente” te lleva donde corresponde.</p>}
              <div className="flex items-center gap-2 mt-4">
                {state.step > 0 && (
                  <button type="button" onClick={() => goTo(state.step - 1)} className="h-11 px-4 rounded-full ring-1 ring-inset ring-bg/30 font-semibold flex items-center gap-1.5">
                    <ArrowLeft size={16} weight="bold" />Atrás
                  </button>
                )}
                <button type="button" onClick={() => last ? save({ ...state, open: false }) : goTo(onPage ? state.step + 1 : state.step)}
                  className="ml-auto h-11 px-5 rounded-full bg-or text-white font-semibold flex items-center gap-1.5 active:scale-95 transition">
                  {last ? 'Explorar libre' : onPage ? 'Siguiente' : 'Ir ahí'} {!last && <ArrowRight size={16} weight="bold" />}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Closed: a pill to pick up where you left off */}
      <AnimatePresence>
        {!state.open && (
          <motion.button key="resume" type="button" onClick={resume}
            initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}
            className="fixed z-[56] right-3 bottom-[calc(84px+env(safe-area-inset-bottom))] lg:bottom-6 lg:right-6 h-11 pl-3 pr-4 rounded-full bg-or text-white text-sm font-semibold flex items-center gap-1.5 shadow-lg">
            <Compass size={18} weight="fill" />
            {state.step > 0 ? `Continuar recorrido · ${state.step + 1}/${STEPS.length}` : 'Ver recorrido'}
          </motion.button>
        )}
      </AnimatePresence>
    </>
  )
}

// The bar lives at the top of the page content; rendered from here so it shares the tour state.
function DemoBarPortal({ onTour }: { onTour: () => void }) {
  return <DemoBar onTour={onTour} />
}
