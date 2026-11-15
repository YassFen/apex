import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { AnnouncementsView } from '@/components/announcements/AnnouncementsView'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { visibleTo } from '@/lib/utils/announcements'
import { isMissingTable } from '@/lib/utils/errors'
import type { Announcement, Box, ClassSlot } from '@/lib/types/database'

export default async function AnnouncementsPage() {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const profile = await getProfile(user.id)
  if (!profile) redirect('/auth/login')

  const [{ data: owned }, { data: mine }] = await Promise.all([
    supabase.from('boxes').select('*').eq('owner_id', user.id),
    supabase.from('box_members').select('role, boxes(*)').eq('user_id', user.id).eq('is_active', true),
  ])
  const roles = new Map<string, { box: Box; role: 'athlete' | 'coach' | 'admin' }>()
  for (const m of (mine ?? []) as any[]) if (m.boxes?.id) roles.set(m.boxes.id, { box: m.boxes as Box, role: m.role })
  for (const b of (owned ?? []) as any[]) if (b?.id) roles.set(b.id, { box: b as Box, role: 'admin' })
  const boxIds = [...roles.keys()]
  const today = todayISO()

  const [annRes, slotsRes, readsRes, membersRes] = await Promise.all([
    boxIds.length ? supabase.from('announcements').select('*').in('box_id', boxIds).or(`ends_on.is.null,ends_on.gte.${addDaysISO(today, -60)}`).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    boxIds.length ? supabase.from('class_slots').select('*').in('box_id', boxIds).eq('is_active', true).order('start_time') : Promise.resolve({ data: [] }),
    supabase.from('announcement_reads').select('announcement_id, user_id'),
    boxIds.length ? supabase.from('box_members').select('box_id, role').in('box_id', boxIds).eq('is_active', true) : Promise.resolve({ data: [] }),
  ])
  const list = ((annRes.data ?? []) as Announcement[]).filter(a => visibleTo(a, roles.get(a.box_id)?.role !== 'athlete', user.id))
  const reads: Record<string, number> = {}
  const myReads: string[] = []
  for (const r of (readsRes.data ?? []) as any[]) {
    reads[r.announcement_id] = (reads[r.announcement_id] ?? 0) + 1
    if (r.user_id === user.id) myReads.push(r.announcement_id)
  }
  // Audience size per box, to show "leído por 12 de 40".
  const size: Record<string, { coaches: number; all: number }> = {}
  for (const m of (membersRes.data ?? []) as any[]) {
    const s = (size[m.box_id] ??= { coaches: 0, all: 0 })
    s.all++; if (m.role !== 'athlete') s.coaches++
  }

  return (
    <AnnouncementsView profile={profile} me={user.id} today={today}
      boxes={[...roles.values()].map(r => ({ id: r.box.id, name: r.box.name, role: r.role }))}
      items={list} slots={(slotsRes.data ?? []) as ClassSlot[]} reads={reads} myReads={myReads} size={size} missing={isMissingTable(annRes.error)} />
  )
}
