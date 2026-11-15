import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { AnnouncementsView } from '@/components/announcements/AnnouncementsView'
import { addDaysISO, todayISO } from '@/lib/utils/dates'
import { visibleTo } from '@/lib/utils/announcements'
import { isMissingTable } from '@/lib/utils/errors'
import { selectAll } from '@/lib/utils/admin-box'
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

  const [annRes, slotsRes, membersRes] = await Promise.all([
    boxIds.length ? supabase.from('announcements').select('*').in('box_id', boxIds).or(`ends_on.is.null,ends_on.gte.${addDaysISO(today, -60)}`).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    boxIds.length ? supabase.from('class_slots').select('*').in('box_id', boxIds).eq('is_active', true).order('start_time') : Promise.resolve({ data: [] }),
    boxIds.length ? selectAll(() => supabase.from('box_members').select('box_id, user_id, role').in('box_id', boxIds).eq('is_active', true).order('user_id')) : Promise.resolve({ data: [] }),
  ])
  const list = ((annRes.data ?? []) as Announcement[]).filter(a => visibleTo(a, roles.get(a.box_id)?.role !== 'athlete', user.id))

  // Who is in each box (owners count as staff even without a member row).
  const staffOf = new Map<string, Set<string>>(), athletesOf = new Map<string, Set<string>>()
  const put = (m: Map<string, Set<string>>, box: string, id: string) => { (m.get(box) ?? m.set(box, new Set()).get(box))?.add(id) }
  for (const m of (membersRes.data ?? []) as any[]) put(m.role === 'athlete' ? athletesOf : staffOf, m.box_id, m.user_id)
  for (const r of roles.values()) if (r.box.owner_id) { athletesOf.get(r.box.id)?.delete(r.box.owner_id); put(staffOf, r.box.id, r.box.owner_id) }
  const audienceOf = (a: Announcement): Set<string> => {
    const staff = staffOf.get(a.box_id) ?? new Set<string>(), athletes = athletesOf.get(a.box_id) ?? new Set<string>()
    const set = new Set(a.audience === 'coaches' ? staff : a.audience === 'athletes' ? athletes : [...staff, ...athletes])
    set.delete(a.author_id)
    return set
  }

  // Reads only of the listed announcements, page by page.
  const ids = list.map(a => a.id)
  const readRows: { announcement_id: string; user_id: string }[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const { data } = await selectAll(() => supabase.from('announcement_reads').select('announcement_id, user_id').in('announcement_id', chunk).order('announcement_id').order('user_id'))
    readRows.push(...(data as any[]))
  }
  const byId = new Map(list.map(a => [a.id, a]))
  const audiences = new Map<string, Set<string>>()
  const reads: Record<string, number> = {}
  const myReads: string[] = []
  for (const r of readRows) {
    if (r.user_id === user.id) myReads.push(r.announcement_id)
    const a = byId.get(r.announcement_id)
    if (!a) continue
    const aud = audiences.get(a.id) ?? audiences.set(a.id, audienceOf(a)).get(a.id)
    if (aud?.has(r.user_id)) reads[a.id] = (reads[a.id] ?? 0) + 1
  }
  // Audience size per announcement, to show "Leído por 12 de 40".
  const size: Record<string, number> = {}
  for (const a of list) size[a.id] = (audiences.get(a.id) ?? audienceOf(a)).size

  // Who already passed each administration notice on to the athletes.
  const relayAuthors = [...new Set(list.filter(a => a.parent_id).map(a => a.author_id))]
  const { data: authorRows } = relayAuthors.length
    ? await supabase.from('profiles').select('id, full_name').in('id', relayAuthors)
    : { data: [] as any[] }
  const nameOf = new Map(((authorRows ?? []) as any[]).map(p => [p.id as string, (p.full_name as string | null) ?? null]))
  const relayedBy: Record<string, string[]> = {}
  for (const a of list) {
    if (!a.parent_id) continue
    const who = a.author_id === user.id ? 'ti' : nameOf.get(a.author_id)?.split(' ')[0] ?? 'un coach'
    relayedBy[a.parent_id] = [...(relayedBy[a.parent_id] ?? []), who]
  }

  return (
    <AnnouncementsView profile={profile} me={user.id} today={today}
      boxes={[...roles.values()].map(r => ({ id: r.box.id, name: r.box.name, role: r.role }))}
      items={list} slots={(slotsRes.data ?? []) as ClassSlot[]} reads={reads} myReads={myReads} size={size} relayedBy={relayedBy} missing={isMissingTable(annRes.error)} />
  )
}
