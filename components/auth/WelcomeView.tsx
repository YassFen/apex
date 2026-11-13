'use client'
import { Logo } from '@/components/ui/Logo'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { Play } from '@/components/ui/icons'
import { WELCOME_SLIDES } from '@/lib/constants/photos'

/** First screen for people who aren't signed in: full-bleed photos, the pitch, and the two ways in. */
export function WelcomeView() {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const slide = WELCOME_SLIDES[i]

  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => setI(n => (n + 1) % WELCOME_SLIDES.length), 5200)
    return () => clearTimeout(t)
  }, [i, paused])

  const go = (n: number) => setI(k => (k + n + WELCOME_SLIDES.length) % WELCOME_SLIDES.length)

  return (
    <main className="relative min-h-dvh overflow-hidden bg-black text-white flex flex-col">
      {/* Photos crossfade with a slow zoom */}
      <AnimatePresence initial={false}>
        <motion.img key={slide.src} src={slide.src} alt=""
          initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 0.9 }, scale: { duration: 6, ease: 'linear' } }}
          className="absolute inset-0 w-full h-full object-cover" />
      </AnimatePresence>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.55)_0%,rgb(0_0_0/0.05)_30%,rgb(0_0_0/0.25)_55%,rgb(0_0_0/0.92)_100%)]" aria-hidden />

      <motion.div drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2}
        onDragStart={() => setPaused(true)}
        onDragEnd={(_, info) => { if (info.offset.x < -50) go(1); else if (info.offset.x > 50) go(-1) }}
        className="relative flex-1 flex flex-col px-6 pt-[calc(56px+env(safe-area-inset-top))] pb-[calc(28px+env(safe-area-inset-bottom))] max-w-md w-full mx-auto touch-pan-y">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="flex justify-center">
          <Logo size={40} markClassName="text-white" />
        </motion.div>

        <div className="flex-1" />

        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }} className="text-center mb-6">
            <h1 className="font-display text-[32px] leading-[1.05] font-bold tracking-tight text-balance">{slide.title}</h1>
            <p className="text-white/75 text-[15px] mt-2 text-pretty">{slide.body}</p>
          </motion.div>
        </AnimatePresence>

        <div className="flex justify-center gap-2 mb-7" role="tablist" aria-label="Diapositivas">
          {WELCOME_SLIDES.map((s, k) => (
            <button key={s.src} type="button" role="tab" aria-selected={k === i} aria-label={s.title}
              onClick={() => { setPaused(true); setI(k) }}
              className="h-1.5 rounded-full overflow-hidden bg-white/35 transition-all duration-300" style={{ width: k === i ? 22 : 6 }}>
              {k === i && !paused && <motion.span key={i} className="block h-full bg-white" initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 5.2, ease: 'linear' }} />}
              {k === i && paused && <span className="block h-full bg-white" />}
            </button>
          ))}
        </div>

        <Link href="/auth/register"
          className="h-14 rounded-2xl bg-ac text-onac text-[17px] font-semibold grid place-items-center active:scale-[0.98] transition shadow-[0_14px_40px_-12px_rgb(var(--c-ac)/0.8)]">
          Crear cuenta
        </Link>
        <Link href="/auth/login" className="mt-4 text-center text-[15px] text-white/90">
          ¿Ya tienes cuenta? <span className="font-semibold underline underline-offset-4">Inicia sesión</span>
        </Link>
        <a href="/demo" className="mt-5 mx-auto inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-white/10 backdrop-blur text-sm font-medium text-white/90 hover:bg-white/20">
          <Play size={14} weight="fill" /> Ver la demo
        </a>
      </motion.div>
    </main>
  )
}
