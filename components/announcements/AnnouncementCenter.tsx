'use client'
// Announcements inside the shell: urgent ones stay as a strip on top of every screen until
// they end, and anything unread opens once as a sheet.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { Megaphone, CaretRight } from '@/components/ui/icons'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { formatDateOnly } from '@/lib/utils/dates'
import { playSound } from '@/lib/utils/sound'
import type { ShellAnnouncement } from '@/lib/utils/announcements'

const SEEN_KEY = 'apex.annSeen'

export function AnnouncementCenter({ items, userId }: { items: ShellAnnouncement[]; userId: string }) {
  const [read, setRead] = useState<Set<string>>(() => new Set(items.filter(a => a.read).map(a => a.id)))
  const [ready, setReady] = useState(false)
  // Also remembered on this device, so a notice never pops up twice even if saving the read failed.
  useEffect(() => {
    try { const seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); if (Array.isArray(seen) && seen.length) setRead(prev => new Set([...prev, ...seen])) } catch {}
    setReady(true)
  }, [])
  const [open, setOpen] = useState<ShellAnnouncement | null>(null)
  const urgent = items.filter(a => a.urgent && !a.mine)
  // Urgent ones first.
  const queue = items.filter(a => a.popup && !a.mine && !read.has(a.id))
  const pending = !ready ? null : queue.find(a => a.urgent) ?? queue[0] ?? null

  // Open the next unread one a moment after the screen settles.
  useEffect(() => {
    if (!pending || open) return
    const t = setTimeout(() => { setOpen(pending); if (pending.urgent) playSound('error') }, 700)
    return () => clearTimeout(t)
  }, [pending, open])

  function acknowledge(a: ShellAnnouncement) {
    setOpen(null)
    if (read.has(a.id)) return
    const next = new Set(read).add(a.id)
    setRead(next)
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...next].slice(-80))) } catch {}
    void createClient().from('announcement_reads').upsert({ announcement_id: a.id, user_id: userId }, { onConflict: 'announcement_id,user_id' }).then(() => {})
  }

  return (
    <>
      <AnimatePresence initial={false}>
        {urgent.map(a => (
          <motion.button key={a.id} type="button" onClick={() => setOpen(a)}
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="w-full overflow-hidden text-left bg-rd text-white">
            <span className="flex items-center gap-2.5 px-4 lg:px-6 py-2.5 text-sm">
              <span className="relative flex size-2.5 flex-shrink-0"><span className="absolute inset-0 rounded-full bg-white animate-ping opacity-70" /><span className="relative size-2.5 rounded-full bg-white" /></span>
              <span className="font-bold flex-shrink-0">Urgente</span>
              <span className="min-w-0 flex-1 truncate">{a.title}</span>
              <CaretRight size={16} weight="bold" className="flex-shrink-0" aria-hidden />
            </span>
          </motion.button>
        ))}
      </AnimatePresence>

      <Modal open={!!open} onClose={() => open && acknowledge(open)} eyebrow={open ? `${open.urgent ? 'Urgente · ' : ''}${open.boxName}` : undefined} title={open?.title}>
        {open && (
          <div className="flex flex-col gap-4">
            <div className={`size-14 rounded-2xl grid place-items-center animate-pop ${open.urgent ? 'bg-rd/15 text-rd' : 'bg-ac/15 text-ac'}`}><Megaphone size={28} weight="duotone" aria-hidden /></div>
            {open.body && <p className="text-[15px] leading-relaxed whitespace-pre-line text-pretty">{open.body}</p>}
            <p className="text-xs text-mu">
              {open.target ? `${open.target} · ` : ''}
              {open.endsOn ? `Vigente hasta el ${formatDateOnly(open.endsOn, { day: 'numeric', month: 'long' })}` : `Desde el ${formatDateOnly(open.startsOn, { day: 'numeric', month: 'long' })}`}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <Link href="/announcements" onClick={() => acknowledge(open)} className="h-[52px] rounded-full ring-1 ring-inset ring-t/30 font-semibold text-[15px] grid place-items-center">Ver todos</Link>
              <button type="button" onClick={() => acknowledge(open)} className="h-[52px] rounded-full bg-ac text-onac font-semibold text-[15px]">Entendido</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
