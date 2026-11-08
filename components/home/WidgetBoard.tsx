'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, Reorder, motion, useDragControls } from 'motion/react'
import { ArrowCounterClockwise, DotsSixVertical, SlidersHorizontal, X } from '@/components/ui/icons'
import { Card } from '@/components/ui/Card'
import { Switch } from '@/components/ui/Switch'
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

  return (
    <>
      <div className="px-1 flex items-end justify-between gap-3">
        <div className="min-w-0">{header}</div>
        {!editing && (
          <button type="button" data-tour="personalize" onClick={() => setEditing(true)} aria-label="Personalizar inicio"
            className="flex-shrink-0 h-9 px-3 rounded-full bg-p text-sm font-medium flex items-center gap-1.5 hover:bg-p2">
            <SlidersHorizontal size={16} /> <span className="hidden sm:inline">Personalizar</span>
          </button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div key="edit" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1 gap-3">
              <div>
                <h3 className="font-semibold">Personaliza tu inicio</h3>
                <p className="text-mu text-sm">Arrastra para ordenar. Apaga lo que no uses.</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button type="button" onClick={() => setLayout(merge(null, widgets))} aria-label="Restablecer" className="size-10 rounded-full bg-p grid place-items-center"><ArrowCounterClockwise size={18} /></button>
                <button type="button" onClick={finish} className="h-10 px-5 rounded-full bg-ac text-onac font-semibold">Listo</button>
              </div>
            </div>
            <Reorder.Group axis="y" values={layout} onReorder={setLayout} className="flex flex-col gap-2">
              {layout.filter(l => byId.has(l.id)).map(item => (
                <EditRow key={item.id} item={item} widget={byId.get(item.id) as Widget}
                  onToggle={on => setLayout(l => l.map(x => x.id === item.id ? { ...x, on } : x))} />
              ))}
            </Reorder.Group>
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

function EditRow({ item, widget, onToggle }: { item: LayoutItem; widget: Widget; onToggle: (on: boolean) => void }) {
  const controls = useDragControls()
  return (
    <Reorder.Item value={item} dragListener={false} dragControls={controls}
      whileDrag={{ scale: 1.03, boxShadow: '0 18px 40px -12px rgb(0 0 0 / 0.35)' }}
      className={cn('flex items-center gap-3 p-3 pr-4 rounded-[20px] bg-p select-none', !item.on && 'opacity-60')}>
      <span onPointerDown={e => controls.start(e)} className="size-10 grid place-items-center text-mu cursor-grab active:cursor-grabbing touch-none" aria-label={`Mover ${widget.label}`}>
        <DotsSixVertical size={22} weight="bold" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-[15px]">{widget.label}</span>
        <span className="block text-mu text-[13px] truncate">{widget.desc}</span>
      </span>
      {!item.on && <X size={14} className="text-fa" aria-hidden />}
      <Switch checked={item.on} onChange={onToggle} label={`Mostrar ${widget.label}`} />
    </Reorder.Item>
  )
}
