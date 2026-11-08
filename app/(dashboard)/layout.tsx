import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { buildNotices, type Notice } from '@/lib/utils/notifications'
import type { Box } from '@/lib/types/database'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  if (!profile) redirect('/auth/login')

  // Load all boxes this user belongs to (as owner or member)
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase.from('boxes').select('*').eq('owner_id', user.id),
    supabase.from('box_members').select('box_id, boxes(*)').eq('user_id', user.id).eq('is_active', true),
  ])

  const boxMap = new Map<string, Box>()
  ;(owned ?? []).forEach((b: any) => { if (b?.id) boxMap.set(b.id, b as Box) })
  ;(memberships ?? []).forEach((m: any) => {
    const b = m.boxes
    if (b?.id) boxMap.set(b.id, b as Box)
  })
  const boxes = Array.from(boxMap.values())

  const notices = await loadNotices(supabase, user.id, boxes)

  return <DashboardShell profile={profile as any} boxes={boxes} notices={notices}>{children}</DashboardShell>
}

/** Data for the notification bell. Every query tolerates missing migrations (006/007). */
async function loadNotices(supabase: any, userId: string, boxes: Box[]): Promise<Notice[]> {
  const today = todayISO()
  const tomorrow = addDaysISO(today, 1)
  const boxIds = boxes.map(b => b.id)
  const boxName = (id: string) => boxes.find(b => b.id === id)?.name ?? 'Tu box'

  const wodSelect = (withTime: boolean) => supabase.from('daily_wods')
    .select(`id, box_id, scheduled_for, title${withTime ? ', class_time' : ''}`)
    .in('box_id', boxIds).eq('is_live', true).gte('scheduled_for', today).lte('scheduled_for', tomorrow)

  const [wodsRes, daysRes, goingRes, boxEvRes] = await Promise.all([
    boxIds.length ? wodSelect(true) : Promise.resolve({ data: [], error: null }),
    boxIds.length ? supabase.rpc('box_wod_days', { p_from: tomorrow, p_to: tomorrow }) : Promise.resolve({ data: [], error: null }),
    supabase.from('event_participants').select('events(id, name, starts_on)').eq('user_id', userId),
    boxIds.length
      ? supabase.from('events').select('id, name, starts_on, created_at, box_id, created_by').in('box_id', boxIds)
          .neq('created_by', userId).gte('created_at', new Date(Date.now() - 5 * 86_400_000).toISOString())
      : Promise.resolve({ data: [], error: null }),
  ])

  let wods = (wodsRes.data ?? []) as any[]
  if (wodsRes.error && boxIds.length) wods = ((await wodSelect(false)).data ?? []) as any[]

  const ids = wods.map(w => w.id)
  const { data: mine } = ids.length
    ? await supabase.from('wod_results').select('daily_wod_id').eq('user_id', userId).in('daily_wod_id', ids)
    : { data: [] }
  const logged = new Set(((mine ?? []) as any[]).map(r => r.daily_wod_id))

  const visibleKeys = new Set(wods.map(w => `${w.box_id}|${w.scheduled_for}`))
  const hidden = ((daysRes.error ? [] : daysRes.data ?? []) as any[])
    .filter(d => !visibleKeys.has(`${d.box_id}|${d.scheduled_for}`))
    .map(d => ({ id: `${d.box_id}-${d.scheduled_for}`, date: d.scheduled_for, title: '', classTime: null, boxName: boxName(d.box_id), visible: false, myResult: false }))

  return buildNotices({
    today,
    myEvents: ((goingRes.error ? [] : goingRes.data ?? []) as any[])
      .map(p => p.events).filter(Boolean)
      .map((e: any) => ({ id: e.id, name: e.name, startsOn: e.starts_on })),
    newBoxEvents: ((boxEvRes.error ? [] : boxEvRes.data ?? []) as any[])
      .map(e => ({ id: e.id, name: e.name, startsOn: e.starts_on, createdAt: e.created_at, boxName: boxName(e.box_id) })),
    wods: [
      ...wods.map(w => ({
        id: w.id, date: w.scheduled_for, title: w.title, classTime: w.class_time ?? null,
        boxName: boxName(w.box_id), visible: true, myResult: logged.has(w.id),
      })),
      ...hidden,
    ],
  })
}
