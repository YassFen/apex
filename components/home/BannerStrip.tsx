'use client'
// Banners on top of the home screen: swipe between them, press to open, close the ones you don't want.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { X, ArrowRight, ArrowSquareOut } from '@/components/ui/icons'
import { createClient } from '@/lib/supabase/client'
import { BANNER_ICONS, BANNER_TONES, isExternal, safeHref, type Banner, type BannerIcon } from '@/lib/utils/banners'
import { playSound } from '@/lib/utils/sound'
import { todayISO } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'

const HIDDEN_KEY = 'apex.bannersHidden'
const SEEN_KEY = 'apex.bannersSeen'

/** One banner. Also used as the live preview in the editor (`preview`). */
export function BannerCard({ b, onOpen, onClose, preview }: { b: Pick<Banner, 'title' | 'body' | 'cta_label' | 'href' | 'tone' | 'icon' | 'image_url' | 'dismissible'>; onOpen?: () => void; onClose?: () => void; preview?: boolean }) {
  const tone = BANNER_TONES[b.tone] ?? BANNER_TONES.accent
  const Icon = BANNER_ICONS[b.icon as BannerIcon] ?? BANNER_ICONS.megaphone
  const href = safeHref(b.href)
  const clickable = !!href && !preview
  return (
    <div className={cn('relative isolate overflow-hidden rounded-[22px] min-h-[104px] flex', tone.card, clickable && 'tap-card cursor-pointer')}
      {...(clickable ? { role: 'link', tabIndex: 0, onClick: onOpen, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } } } : {})}
      data-track={`Banner: ${b.title}`}>
      {b.image_url && (
        <>
          <img src={b.image_url} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
          <span className="absolute inset-0 -z-10 bg-gradient-to-r from-black/75 via-black/45 to-black/10" aria-hidden />
        </>
      )}
      <div className={cn('flex-1 min-w-0 p-4 pr-11 flex items-center gap-3.5', b.image_url && 'text-white')}>
        {!b.image_url && <span className="size-11 rounded-2xl bg-black/10 grid place-items-center flex-shrink-0"><Icon size={24} weight="fill" aria-hidden /></span>}
        <div className="min-w-0 flex-1">
          <div className="font-display text-[17px] font-bold tracking-tight leading-tight text-balance">{b.title || 'Título del banner'}</div>
          {b.body && <div className={cn('text-[13px] leading-snug mt-0.5 text-pretty', b.image_url ? 'text-white/85' : tone.sub)}>{b.body}</div>}
          {href && (
            <span className={cn('mt-2.5 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-bold', b.image_url ? 'bg-white text-black' : tone.cta)}>
              {b.cta_label || 'Ver'} {isExternal(href) ? <ArrowSquareOut size={13} weight="bold" aria-hidden /> : <ArrowRight size={13} weight="bold" aria-hidden />}
            </span>
          )}
        </div>
      </div>
      {b.dismissible && (
        <button type="button" aria-label="Cerrar banner" onClick={e => { e.stopPropagation(); onClose?.() }} disabled={preview}
          className="absolute top-2 right-2 size-8 rounded-full bg-black/15 grid place-items-center hit-44">
          <X size={14} weight="bold" aria-hidden />
        </button>
      )}
    </div>
  )
}

export function BannerStrip({ banners }: { banners: Banner[] }) {
  const router = useRouter()
  const [hidden, setHidden] = useState<string[] | null>(null)
  const [index, setIndex] = useState(0)
  const track = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]'); setHidden(Array.isArray(v) ? v : []) } catch { setHidden([]) }
  }, [])
  const shown = hidden === null ? [] : banners.filter(b => !hidden.includes(b.id))

  // Count each banner once per device per day, when it is actually on screen.
  useEffect(() => {
    const b = shown[index]
    if (!b) return
    try {
      const day = todayISO()
      const seen: Record<string, string> = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}')
      if (seen[b.id] === day) return
      seen[b.id] = day
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
      void createClient().rpc('banner_hit', { p_id: b.id, p_kind: 'view' }).then(() => {})
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, shown.length])

  if (!shown.length) return null

  function open(b: Banner) {
    const href = safeHref(b.href)
    if (!href) return
    playSound('tap')
    void createClient().rpc('banner_hit', { p_id: b.id, p_kind: 'click' }).then(() => {})
    if (isExternal(href)) window.open(href, '_blank', 'noopener,noreferrer')
    else router.push(href)
  }
  function close(b: Banner) {
    const next = [...(hidden ?? []), b.id].slice(-60)
    setHidden(next); setIndex(0)
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)) } catch {}
  }
  function onScroll() {
    const el = track.current
    if (!el) return
    const step = ((el.firstElementChild as HTMLElement | null)?.offsetWidth ?? el.clientWidth) + 12
    setIndex(Math.max(0, Math.min(shown.length - 1, Math.round(el.scrollLeft / Math.max(1, step)))))
  }

  return (
    <section aria-label="Novedades" className="px-4 lg:px-6 pt-1">
      <div ref={track} onScroll={onScroll} className="flex gap-3 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] -mx-4 px-4 lg:mx-0 lg:px-0 max-w-2xl">
        <AnimatePresence initial={false}>
          {shown.map(b => (
            <motion.div key={b.id} layout="position" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.18 }}
              className={cn('snap-center flex-shrink-0', shown.length > 1 ? 'w-[88%] sm:w-[70%]' : 'w-full')}>
              <BannerCard b={b} onOpen={() => open(b)} onClose={() => close(b)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {shown.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2" aria-hidden>
          {shown.map((b, i) => <span key={b.id} className={cn('h-1.5 rounded-full transition-all duration-200', i === index ? 'w-4 bg-t' : 'w-1.5 bg-t/25')} />)}
        </div>
      )}
    </section>
  )
}
