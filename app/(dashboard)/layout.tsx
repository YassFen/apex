import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { buildNotices, type Notice } from '@/lib/utils/notifications'
import { isLive, matchesBooking, targetLabel, visibleTo, type ShellAnnouncement } from '@/lib/utils/announcements'
import type { Announcement, Box, ClassSlot } from '@/lib/types/database'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')

  // Everything that only needs the user id goes out at once.
  const [profile, { data: owned }, { data: memberships }, { data: pa, error: paErr }] = await Promise.all([
    getProfile(user.id),
    supabase.from('boxes').select('*').eq('owner_id', user.id),
    supabase.from('box_members').select('box_id, role, boxes(*)').eq('user_id', user.id).eq('is_active', true),
    supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  if (!profile) redirect('/auth/login')

  const boxMap = new Map<string, Box>()
  ;(owned ?? []).forEach((b: any) => { if (b?.id) boxMap.set(b.id, b as Box) })
  ;(memberships ?? []).forEach((m: any) => {
    const b = m.boxes
    if (b?.id) boxMap.set(b.id, b as Box)
  })
  const boxes = Array.from(boxMap.values())
  const adminBoxIds = [...new Set([
    ...((owned ?? []) as any[]).map(b => b.id as string),
    ...((memberships ?? []) as any[]).filter(m => m.role === 'admin').map(m => m.box_id as string),
  ])]
  // Platform administrators (011). The table may not exist yet.
  const isPlatformAdmin = !paErr && !!pa

  const staffBoxIds = new Set([...adminBoxIds, ...((memberships ?? []) as any[]).filter(m => m.role !== 'athlete').map(m => m.box_id as string)])
  const [notices, announcements] = await Promise.all([
    loadNotices(supabase, user.id, boxes),
    loadAnnouncements(supabase, user.id, boxes, staffBoxIds),
  ])

  return <DashboardShell profile={profile as any} boxes={boxes} notices={notices} adminBoxIds={adminBoxIds} isPlatformAdmin={isPlatformAdmin} announcements={announcements}
    coachAllowed={staffBoxIds.size > 0 || (profile.role !== 'athlete' && !(memberships ?? []).length && !(owned ?? []).length)}>{children}</DashboardShell>
}

/** Live announcements of the person's boxes (010). Returns nothing until the migration runs. */
async function loadAnnouncements(supabase: any, userId: string, boxes: Box[], staffBoxIds: Set<string>): Promise<ShellAnnouncement[]> {
  const boxIds = boxes.map(b => b.id)
  if (!boxIds.length) return []
  const today = todayISO()
  const { data, error } = await supabase.from('announcements').select('*').in('box_id', boxIds).lte('starts_on', today).order('created_at', { ascending: false }).limit(40)
  if (error) return []
  const live = ((data ?? []) as Announcement[]).filter(a => isLive(a, today) && visibleTo(a, staffBoxIds.has(a.box_id), userId))
  if (!live.length) return []
  const targeted = live.some(a => a.slot_id || a.weekday !== null)
  const [{ data: reads }, { data: slots }, { data: bookings }] = await Promise.all([
    supabase.from('announcement_reads').select('announcement_id').eq('user_id', userId),
    targeted ? supabase.from('class_slots').select('id, weekday, start_time, name').in('box_id', boxIds) : Promise.resolve({ data: [] }),
    targeted ? supabase.from('class_bookings').select('slot_id, class_date, status').eq('user_id', userId).gte('class_date', today) : Promise.resolve({ data: [] }),
  ])
  const read = new Set(((reads ?? []) as any[]).map(r => r.announcement_id))
  const mine = ((bookings ?? []) as any[]).filter(b => b.status !== 'cancelled')
  return live.map(a => ({
    id: a.id, boxId: a.box_id, boxName: boxes.find(b => b.id === a.box_id)?.name ?? 'Tu box', title: a.title, body: a.body, urgent: a.urgent,
    audience: a.audience, target: targetLabel(a, (slots ?? []) as ClassSlot[]), startsOn: a.starts_on, endsOn: a.ends_on,
    mine: a.author_id === userId, read: read.has(a.id),
    popup: a.urgent || staffBoxIds.has(a.box_id) || matchesBooking(a, mine),
  }))
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

  const [wodsRes, daysRes, goingRes, boxEvRes, repliesRes] = await Promise.all([
    boxIds.length ? wodSelect(true) : Promise.resolve({ data: [], error: null }),
    boxIds.length ? supabase.rpc('box_wod_days', { p_from: tomorrow, p_to: tomorrow }) : Promise.resolve({ data: [], error: null }),
    supabase.from('event_participants').select('events(id, name, starts_on)').eq('user_id', userId),
    boxIds.length
      ? supabase.from('events').select('id, name, starts_on, created_at, box_id, created_by').in('box_id', boxIds)
          .neq('created_by', userId).gte('created_at', new Date(Date.now() - 5 * 86_400_000).toISOString())
      : Promise.resolve({ data: [], error: null }),
    supabase.from('support_tickets').select('id, replied_at').eq('user_id', userId).in('status', ['answered', 'closed']).not('reply', 'is', null).eq('seen_reply', false),
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
    replies: ((repliesRes.error ? [] : repliesRes.data ?? []) as any[]).map(r => ({ id: r.id, date: String(r.replied_at ?? today).slice(0, 10), at: String(r.replied_at ?? '') })),
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
