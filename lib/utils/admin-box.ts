// Server-side guard for the administrator area (/manage): who is asking, and which box.
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { ACTIVE_BOX_COOKIE } from '@/lib/constants/cookies'
import type { Box, Profile } from '@/lib/types/database'

/** Boxes the person administers: the ones they own, plus the ones where they are 'admin'. */
export async function adminBoxesFor(supabase: any, userId: string): Promise<Box[]> {
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase.from('boxes').select('*').eq('owner_id', userId),
    supabase.from('box_members').select('role, boxes(*)').eq('user_id', userId).eq('is_active', true).eq('role', 'admin'),
  ])
  const map = new Map<string, Box>()
  for (const b of (owned ?? []) as any[]) if (b?.id) map.set(b.id, b as Box)
  for (const m of (memberships ?? []) as any[]) if (m.boxes?.id) map.set(m.boxes.id, m.boxes as Box)
  return [...map.values()]
}

async function cookieBox(): Promise<string | null> {
  try { return (await cookies()).get(ACTIVE_BOX_COOKIE)?.value ?? null } catch { return null }
}

/** Redirects anyone who doesn't administer a box. `wanted` is the ?box= of the URL; without it, the box picked in the app. */
export async function requireAdminBox(wanted?: string | null): Promise<{ supabase: any; userId: string; profile: Profile; box: Box; boxes: Box[] }> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const [profile, boxes, picked] = await Promise.all([getProfile(user.id), adminBoxesFor(supabase, user.id), cookieBox()])
  if (!profile) redirect('/auth/login')
  if (!boxes.length) redirect('/dashboard')
  const box = boxes.find(b => b.id === wanted) ?? boxes.find(b => b.id === picked) ?? boxes[0]
  return { supabase, userId: user.id, profile, box, boxes }
}

/**
 * Reads every row of a query, 1000 at a time (the API never returns more in one go).
 * `build` must return a fresh, ordered query each time.
 */
export async function selectAll<T = any>(build: () => any, page = 1000, max = 50000): Promise<{ data: T[]; error: any }> {
  const out: T[] = []
  for (let from = 0; from < max; from += page) {
    const q = build()
    // The demo client has no range(): it returns everything at once.
    if (typeof q?.range !== 'function') { const { data, error } = await q; return { data: (data ?? []) as T[], error } }
    const { data, error } = await q.range(from, from + page - 1)
    if (error) return { data: out, error }
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < page) break
  }
  return { data: out, error: null }
}

export interface Person { id: string; name: string; email: string; avatar: string | null; role: string; joinedAt: string; isActive: boolean; leftAt: string | null; isOwner: boolean; birthYear: number | null }

/** Everyone who is or was in the box. Falls back when 010 hasn't run (no left_at column). */
export async function loadPeople(supabase: any, box: Box): Promise<Person[]> {
  const sel = (withLeft: boolean) => () => supabase.from('box_members')
    .select(`user_id, role, joined_at, is_active${withLeft ? ', left_at' : ''}, profiles(full_name, email, avatar_url)`)
    .eq('box_id', box.id).order('joined_at', { ascending: false }).order('user_id')
  let { data, error } = await selectAll(sel(true))
  if (error) ({ data } = await selectAll(sel(false)))
  return ((data ?? []) as any[]).map(m => ({
    id: m.user_id, name: m.profiles?.full_name ?? 'Sin nombre', email: m.profiles?.email ?? '', avatar: m.profiles?.avatar_url ?? null,
    role: m.user_id === box.owner_id ? 'admin' : m.role, joinedAt: m.joined_at, isActive: m.is_active !== false, leftAt: m.left_at ?? null,
    isOwner: m.user_id === box.owner_id, birthYear: null,
  }))
}

/** Days each person trained: class bookings that count as attended, plus logged WOD results. */
export async function loadAttendance(supabase: any, boxId: string, from: string, today: string): Promise<Map<string, Set<string>>> {
  const days = new Map<string, Set<string>>()
  const add = (u: string, d: string) => { (days.get(u) ?? days.set(u, new Set()).get(u))?.add(d) }

  // Computed in the database (016): one value, no row limit.
  const { data: agg, error: aggErr } = await supabase.rpc('box_attendance', { p_box: boxId, p_from: from, p_to: today })
  if (!aggErr && agg && typeof agg === 'object' && !Array.isArray(agg)) {
    for (const [u, list] of Object.entries(agg as Record<string, unknown>)) {
      if (Array.isArray(list)) for (const d of list) if (typeof d === 'string') add(u, d.slice(0, 10))
    }
    return days
  }

  // Before 016: read everything page by page.
  const [{ data: bookings }, { data: wods }] = await Promise.all([
    selectAll(() => supabase.from('class_bookings').select('id, user_id, class_date, status').eq('box_id', boxId).gte('class_date', from).lte('class_date', today).in('status', ['attended', 'booked']).order('id')),
    selectAll(() => supabase.from('daily_wods').select('id, scheduled_for').eq('box_id', boxId).gte('scheduled_for', from).lte('scheduled_for', today).order('id')),
  ])
  for (const b of bookings as any[]) {
    if (b.status === 'attended' || (b.status === 'booked' && b.class_date < today)) add(b.user_id, b.class_date)
  }
  const wodDay = new Map((wods as any[]).map(w => [w.id as string, w.scheduled_for as string]))
  const ids = [...wodDay.keys()]
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const { data: results } = await selectAll(() => supabase.from('wod_results').select('id, user_id, daily_wod_id').in('daily_wod_id', chunk).order('id'))
    for (const r of results as any[]) { const d = wodDay.get(r.daily_wod_id); if (d) add(r.user_id, d) }
  }
  return days
}
