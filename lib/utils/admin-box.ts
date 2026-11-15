// Server-side guard for the administrator area (/manage): who is asking, and which box.
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
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

/** Redirects anyone who doesn't administer a box. `wanted` is the ?box= of the URL. */
export async function requireAdminBox(wanted?: string | null): Promise<{ supabase: any; userId: string; profile: Profile; box: Box; boxes: Box[] }> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const [profile, boxes] = await Promise.all([getProfile(user.id), adminBoxesFor(supabase, user.id)])
  if (!profile) redirect('/auth/login')
  if (!boxes.length) redirect('/dashboard')
  const box = boxes.find(b => b.id === wanted) ?? boxes[0]
  return { supabase, userId: user.id, profile, box, boxes }
}

export interface Person { id: string; name: string; email: string; avatar: string | null; role: string; joinedAt: string; isActive: boolean; leftAt: string | null; isOwner: boolean; birthYear: number | null }

/** Everyone who is or was in the box. Falls back when 010 hasn't run (no left_at column). */
export async function loadPeople(supabase: any, box: Box): Promise<Person[]> {
  const sel = (withLeft: boolean) => supabase.from('box_members')
    .select(`user_id, role, joined_at, is_active${withLeft ? ', left_at' : ''}, profiles(full_name, email, avatar_url)`)
    .eq('box_id', box.id).order('joined_at', { ascending: false })
  let { data, error } = await sel(true)
  if (error) ({ data } = await sel(false))
  return ((data ?? []) as any[]).map(m => ({
    id: m.user_id, name: m.profiles?.full_name ?? 'Sin nombre', email: m.profiles?.email ?? '', avatar: m.profiles?.avatar_url ?? null,
    role: m.user_id === box.owner_id ? 'admin' : m.role, joinedAt: m.joined_at, isActive: m.is_active !== false, leftAt: m.left_at ?? null,
    isOwner: m.user_id === box.owner_id, birthYear: null,
  }))
}

/** Days each person trained: class bookings that count as attended, plus logged WOD results. */
export async function loadAttendance(supabase: any, boxId: string, from: string, today: string): Promise<Map<string, Set<string>>> {
  const [{ data: bookings }, { data: wods }] = await Promise.all([
    supabase.from('class_bookings').select('user_id, class_date, status').eq('box_id', boxId).gte('class_date', from).lte('class_date', today),
    supabase.from('daily_wods').select('id, scheduled_for').eq('box_id', boxId).gte('scheduled_for', from).lte('scheduled_for', today),
  ])
  const days = new Map<string, Set<string>>()
  const add = (u: string, d: string) => { (days.get(u) ?? days.set(u, new Set()).get(u))?.add(d) }
  for (const b of (bookings ?? []) as any[]) {
    if (b.status === 'attended' || (b.status === 'booked' && b.class_date < today)) add(b.user_id, b.class_date)
  }
  const wodDay = new Map(((wods ?? []) as any[]).map(w => [w.id as string, w.scheduled_for as string]))
  if (wodDay.size) {
    const { data: results } = await supabase.from('wod_results').select('user_id, daily_wod_id').in('daily_wod_id', [...wodDay.keys()])
    for (const r of (results ?? []) as any[]) { const d = wodDay.get(r.daily_wod_id); if (d) add(r.user_id, d) }
  }
  return days
}
