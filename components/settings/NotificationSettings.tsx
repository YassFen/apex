'use client'
import { useEffect, useState } from 'react'
import { Bell, Trophy, Fire, CheckCircle, CalendarDots } from '@/components/ui/icons'
import { Card } from '@/components/ui/Card'
import { Switch } from '@/components/ui/Switch'
import { useToast } from '@/components/ui/Toast'
import { DEFAULT_NOTICE_PREFS, NOTICE_PREFS_KEY, readNoticePrefs, type NoticePrefs } from '@/components/layout/NotificationBell'
import type { NoticeKind } from '@/lib/utils/notifications'

const KINDS: { kind: NoticeKind; Icon: typeof Bell; title: string; body: string }[] = [
  { kind: 'event',     Icon: Trophy,       title: 'Cuenta regresiva de competencias', body: 'A 7, 3 y 1 día, y el mismo día.' },
  { kind: 'wod',       Icon: Fire,         title: 'WOD de mañana',                    body: 'Con la hora de tu clase, si el coach la definió.' },
  { kind: 'log',       Icon: CheckCircle,  title: 'Registrar resultado',              body: 'Si hoy hay WOD y aún no anotas tu marca.' },
  { kind: 'box_event', Icon: CalendarDots, title: 'Eventos nuevos del box',           body: 'Cuando tu coach publica una competencia.' },
]

export function NotificationSettings() {
  const { fire } = useToast()
  const [prefs, setPrefs] = useState<NoticePrefs>(DEFAULT_NOTICE_PREFS)
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default')

  useEffect(() => {
    setPrefs(readNoticePrefs())
    setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  }, [])

  function save(next: NoticePrefs) {
    setPrefs(next)
    try { localStorage.setItem(NOTICE_PREFS_KEY, JSON.stringify(next)) } catch {}
  }

  async function toggleSystem(on: boolean) {
    if (!on) { save({ ...prefs, system: false }); return }
    if (perm === 'unsupported') { fire('Este navegador no permite notificaciones', 'error'); return }
    const p = perm === 'granted' ? 'granted' : await Notification.requestPermission()
    setPerm(p)
    if (p !== 'granted') { fire('Activa las notificaciones de APEX en los ajustes del navegador', 'error'); return }
    save({ ...prefs, system: true })
    fire('Listo. Te avisaremos en este dispositivo.', 'ok')
  }

  return (
    <>
      <Card padding={false}>
        <label className="flex items-center gap-3.5 p-4 cursor-pointer">
          <span className="size-10 rounded-xl bg-ac/15 text-ac grid place-items-center flex-shrink-0"><Bell size={20} weight="fill" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-[15px]">Notificaciones del sistema</span>
            <span className="block text-mu text-[13px]">
              {perm === 'denied' ? 'Bloqueadas en el navegador. Actívalas en sus ajustes.' : 'Aparecen en tu celular mientras APEX esté abierta o instalada.'}
            </span>
          </span>
          <Switch checked={prefs.system && perm === 'granted'} onChange={toggleSystem} label="Notificaciones del sistema" />
        </label>
      </Card>

      <div>
        <div className="text-[13px] text-mu font-medium px-1 mb-2">Qué te avisamos</div>
        <Card padding={false} className="divide-y divide-[var(--ln)]">
          {KINDS.map(({ kind, Icon, title, body }) => (
            <label key={kind} className="flex items-center gap-3.5 p-4 cursor-pointer">
              <span className="size-10 rounded-xl bg-p2 grid place-items-center flex-shrink-0"><Icon size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[15px]">{title}</span>
                <span className="block text-mu text-[13px]">{body}</span>
              </span>
              <Switch checked={prefs.kinds[kind]} label={title}
                onChange={v => save({ ...prefs, kinds: { ...prefs.kinds, [kind]: v } })} />
            </label>
          ))}
        </Card>
      </div>
    </>
  )
}
