'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, Reorder, motion, useDragControls } from 'motion/react'
import { ArrowCounterClockwise, DotsSixVertical, SlidersHorizontal } from '@/components/ui/icons'
import { MorphIcon } from '@/components/ui/MorphIcon'
import { playSound } from '@/lib/utils/sound'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/cn'
import type { Profile } from '@/lib/types/database'

export interface Widget { id: string; label: string; desc: string; render: () => React.ReactNode; defaultOn?: boolean }
type LayoutItem = { id: string; on: boolean }
export type BoardScope = 'athlete' | 'coach'

/**
 * profiles.dashboard_layout holds { athlete: [...], coach: [...] }.
 * Older saves were a bare array for the athlete home.
 */
function savedFor(raw: unknown, scope: BoardScope): unknown {
  if (Array.isArray(raw)) return scope === 'athlete' ? raw : null
  if (raw && typeof raw === 'object') return (raw as Record<string, unknown>)[scope] ?? null
  return null
}

function merge(saved: unknown, widgets: Widget[]): LayoutItem[] {
  const ids = new Set(widgets.map(w => w.id))
  const defaults = widgets.map(w => ({ id: w.id, on: w.defaultOn !== false }))
  if (!Array.isArray(saved)) return defaults
  const known = saved.filter((x: any) => x && ids.has(x.id)).map((x: any) => ({ id: String(x.id), on: x.on !== false }))
  return known.length ? [...known, ...defaults.filter(d => !known.some(k => k.id === d.id))] : defaults
}

/**
 * A home screen made of widgets the person can reorder (drag), hide and restore.
 * Saved to the profile (migration 007) and to this device.
 */
export function WidgetBoard({ scope, profile, widgets, header }: { scope: BoardScope; profile: Profile; widgets: Widget[]; header?: React.ReactNode }) {
  const router = useRouter()
  const params = useSearchParams()
  const { fire } = useToast()
  const key = `apex.homeLayout.${scope}`
  const [layout, setLayout] = useState<LayoutItem[]>(() => merge(savedFor(profile.dashboard_layout, scope), widgets))
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (savedFor(profile.dashboard_layout, scope)) return
    try {
      const v = localStorage.getItem(key) ?? (scope === 'athlete' ? localStorage.getItem('apex.homeLayout') : null)
      if (v) setLayout(merge(JSON.parse(v), widgets))
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (params.get('edit') === '1') setEditing(true) }, [params])

  async function finish() {
    setEditing(false)
    try { localStorage.setItem(key, JSON.stringify(layout)) } catch {}
    const prev = profile.dashboard_layout
    const base = Array.isArray(prev) ? { athlete: prev } : (prev && typeof prev === 'object' ? prev : {})
    await createClient().from('profiles').update({ dashboard_layout: { ...(base as object), [scope]: layout } }).eq('id', profile.id)
    fire('Inicio guardado', 'ok')
    if (params.get('edit')) router.replace('/dashboard', { scroll: false })
  }

  const byId = new Map(widgets.map(w => [w.id, w]))
  const visible = layout.filter(l => l.on && byId.has(l.id))
  const hidden = layout.filter(l => !l.on && byId.has(l.id))

  return (
    <>
      <div className="px-1 flex items-end justify-between gap-3">
        <div className="min-w-0">{header}</div>
        {!editing && (
          <button type="button" data-tour="personalize" onClick={() => setEditing(true)} aria-label="Personalizar inicio"
            className="flex-shrink-0 h-9 px-3 rounded-full bg-p text-sm font-medium flex items-center gap-1.5 hover:bg-p2">
            <SlidersHorizontal size={16} /> Personalizar
          </button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div key="edit" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="flex flex-col gap-3">
            <div className="sticky top-[72px] z-10 flex items-center justify-between gap-3 p-2 pl-4 rounded-full glass-bar">
              <p className="text-sm font-semibold min-w-0">Arrastra para ordenar</p>
              <div className="flex gap-2 flex-shrink-0">
                <button type="button" onClick={() => setLayout(merge(null, widgets))} aria-label="Restablecer" className="size-10 rounded-full bg-p2 grid place-items-center"><ArrowCounterClockwise size={18} /></button>
                <button type="button" onClick={finish} className="h-10 px-5 rounded-full bg-ac text-onac font-semibold">Listo</button>
              </div>
            </div>

            {/* The real widgets, shortened, each with a grab bar and a remove button */}
            <Reorder.Group axis="y" values={visible} onReorder={next => setLayout([...(next as LayoutItem[]), ...layout.filter(l => !l.on)])} className="flex flex-col gap-3">
              {visible.map(item => (
                <EditCard key={item.id} item={item} widget={byId.get(item.id) as Widget}
                  onHide={() => { playSound('toggleOff'); setLayout(l => l.map(x => x.id === item.id ? { ...x, on: false } : x)) }} />
              ))}
            </Reorder.Group>

            {hidden.length > 0 && (
              <div className="rounded-[24px] bg-p p-4">
                <p className="text-xs font-semibold text-mu mb-2.5">Agregar al inicio</p>
                <div className="flex flex-wrap gap-2">
                  {hidden.map(item => (
                    <button key={item.id} type="button"
                      onClick={() => { playSound('toggleOn'); setLayout(l => [...l.filter(x => x.on), { ...item, on: true }, ...l.filter(x => !x.on && x.id !== item.id)]) }}
                      className="h-10 pl-2 pr-4 rounded-full bg-p2 hover:bg-p3 text-sm font-semibold flex items-center gap-2">
                      <span className="size-6 rounded-full bg-ac text-onac grid place-items-center"><MorphIcon icon="plus" size={12} strokeWidth={2.4} /></span>
                      {byId.get(item.id)?.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
            {visible.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i, 4) * 0.04, ease: [0.22, 1, 0.36, 1] }}>
                {byId.get(item.id)?.render()}
              </motion.div>
            ))}
            {visible.length === 0 && (
              <Card className="text-center py-10">
                <p className="text-mu">Tu inicio está vacío.</p>
                <button type="button" onClick={() => setEditing(true)} className="mt-3 h-10 px-5 rounded-full bg-ac text-onac font-semibold">Agregar widgets</button>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function EditCard({ item, widget, onHide }: { item: LayoutItem; widget: Widget; onHide: () => void }) {
  const controls = useDragControls()
  return (
    <Reorder.Item value={item} dragListener={false} dragControls={controls}
      onDragStart={() => playSound('tick')} onDragEnd={() => playSound('tap')}
      whileDrag={{ scale: 1.02, zIndex: 20 }} transition={{ type: 'spring', stiffness: 500, damping: 34 }}
      className="relative rounded-[24px] bg-p select-none overflow-hidden">
      <div className="flex items-center gap-1 h-12 pl-1 pr-2">
        <span onPointerDown={e => controls.start(e)} aria-label={`Mover ${widget.label}`}
          className="flex-1 min-w-0 h-full flex items-center gap-1.5 px-2 cursor-grab active:cursor-grabbing touch-none">
          <DotsSixVertical size={22} weight="bold" className="text-mu flex-shrink-0" />
          <span className="font-semibold text-sm truncate">{widget.label}</span>
        </span>
        <button type="button" onClick={onHide} aria-label={`Quitar ${widget.label}`}
          className="size-8 rounded-full bg-p3 grid place-items-center flex-shrink-0"><MorphIcon icon="minus" size={14} strokeWidth={2.2} /></button>
      </div>
      {/* Shortened live preview: you see what you are moving, but it can't be tapped */}
      <div className="relative max-h-[120px] overflow-hidden pointer-events-none px-2" aria-hidden>
        <div className="origin-top scale-[0.94]">{widget.render()}</div>
        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-bg/90 to-transparent" />
      </div>
    </Reorder.Item>
  )
}
