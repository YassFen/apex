'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { Bell, Trophy, Fire, CalendarDots, CheckCircle, BellSlash } from '@/components/ui/icons'
import { Modal } from '@/components/ui/Modal'
import { useShell } from '@/lib/hooks/useShell'
import { cn } from '@/lib/utils/cn'
import type { Notice, NoticeKind } from '@/lib/utils/notifications'

const READ_KEY = 'apex.noticesRead'
const PUSHED_KEY = 'apex.noticesPushed'
export const NOTICE_PREFS_KEY = 'apex.noticePrefs'

export interface NoticePrefs { system: boolean; kinds: Record<NoticeKind, boolean> }
export const DEFAULT_NOTICE_PREFS: NoticePrefs = { system: false, kinds: { event: true, wod: true, log: true, box_event: true } }

export function readNoticePrefs(): NoticePrefs {
  try {
    const v = JSON.parse(localStorage.getItem(NOTICE_PREFS_KEY) ?? 'null')
    if (v && typeof v === 'object') return { ...DEFAULT_NOTICE_PREFS, ...v, kinds: { ...DEFAULT_NOTICE_PREFS.kinds, ...(v.kinds ?? {}) } }
  } catch {}
  return DEFAULT_NOTICE_PREFS
}

function readSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? '[]')) } catch { return new Set() }
}
function saveSet(key: string, set: Set<string>) {
  // Keep the list short: ids are only meaningful for a few days.
  try { localStorage.setItem(key, JSON.stringify([...set].slice(-200))) } catch {}
}

const KIND_ICON: Record<NoticeKind, { Icon: typeof Bell; tone: string }> = {
  event:     { Icon: Trophy,       tone: 'bg-rd/15 text-rd' },
  box_event: { Icon: CalendarDots, tone: 'bg-pu/15 text-pu' },
  wod:       { Icon: Fire,         tone: 'bg-or/15 text-or' },
  log:       { Icon: CheckCircle,  tone: 'bg-ac/15 text-ac' },
}

export function NotificationBell() {
  const { notices } = useShell()
  const [open, setOpen] = useState(false)
  const [read, setRead] = useState<Set<string>>(new Set())
  const [prefs, setPrefs] = useState<NoticePrefs>(DEFAULT_NOTICE_PREFS)

  useEffect(() => { setRead(readSet(READ_KEY)); setPrefs(readNoticePrefs()) }, [])

  const shown = useMemo(() => notices.filter(n => prefs.kinds[n.kind] !== false), [notices, prefs])
  const unread = shown.filter(n => !read.has(n.id)).length

  // System notification for new notices while the app is open (opt-in in Settings).
  useEffect(() => {
    if (!prefs.system || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const pushed = readSet(PUSHED_KEY)
    const fresh = shown.filter(n => !pushed.has(n.id) && !read.has(n.id))
    if (!fresh.length) return
    navigator.serviceWorker?.getRegistration().then(reg => {
      for (const n of fresh.slice(0, 3)) {
        const opts = { body: n.body, tag: n.id, icon: '/icons/icon-192.png', data: { href: n.href } }
        if (reg) reg.showNotification(n.title, opts)
        else new Notification(n.title, opts)
        pushed.add(n.id)
      }
      saveSet(PUSHED_KEY, pushed)
    }).catch(() => {})
  }, [shown, prefs.system, read])

  function markAll() {
    const next = new Set(read)
    shown.forEach(n => next.add(n.id))
    setRead(next); saveSet(READ_KEY, next)
  }
  function markOne(id: string) {
    const next = new Set(read); next.add(id)
    setRead(next); saveSet(READ_KEY, next)
    setOpen(false)
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={unread ? `Avisos, ${unread} sin leer` : 'Avisos'}
        className="relative size-10 grid place-items-center rounded-full text-t hover:bg-p2 active:scale-95 transition">
        <motion.span
          animate={unread ? { rotate: [0, -14, 12, -8, 5, 0] } : { rotate: 0 }}
          transition={{ duration: 0.9, delay: 0.6, repeat: unread ? 2 : 0, repeatDelay: 4 }}
          className="grid place-items-center origin-top">
          <Bell size={22} weight={unread ? 'fill' : 'regular'} aria-hidden />
        </motion.span>
        {unread > 0 && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rd text-white text-[10px] font-bold grid place-items-center ring-2 ring-bg">
            {unread > 9 ? '9+' : unread}
          </motion.span>
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Avisos" subtitle={shown.length ? undefined : undefined}>
        {shown.length === 0 ? (
          <div className="text-center py-10 flex flex-col items-center gap-3">
            <span className="size-14 rounded-2xl bg-p2 grid place-items-center text-mu"><BellSlash size={26} aria-hidden /></span>
            <div className="font-semibold">Todo al día</div>
            <p className="text-mu text-sm max-w-xs">Aquí te avisamos cuando falte poco para una competencia, haya WOD mañana o te falte registrar uno.</p>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2 stagger">
              {shown.map(n => {
                const { Icon, tone } = KIND_ICON[n.kind]
                const isRead = read.has(n.id)
                return (
                  <li key={n.id}>
                    <Link href={n.href} onClick={() => markOne(n.id)}
                      className={cn('flex items-start gap-3 p-3.5 rounded-2xl transition-colors', isRead ? 'bg-p2/60' : 'bg-p2 hover:bg-p3')}>
                      <span className={cn('size-10 rounded-xl grid place-items-center flex-shrink-0', tone)}><Icon size={20} weight="fill" aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-[15px] leading-snug', isRead ? 'text-mu' : 'font-semibold')}>{n.title}</span>
                        <span className="block text-mu text-[13px] mt-0.5">{n.body}</span>
                      </span>
                      {!isRead && <span className="size-2.5 rounded-full bg-ac mt-1.5 flex-shrink-0" aria-label="Sin leer" />}
                    </Link>
                  </li>
                )
              })}
            </ul>
            <div className="flex items-center justify-between mt-5">
              <Link href="/settings/notifications" onClick={() => setOpen(false)} className="text-sm text-mu hover:text-t">Ajustes de avisos</Link>
              {unread > 0 && <button type="button" onClick={markAll} className="h-10 px-4 rounded-full bg-p2 text-sm font-semibold hover:bg-p3">Marcar todo como leído</button>}
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
