import { cookies } from 'next/headers'
import { ACTIVE_BOX_COOKIE } from '@/lib/constants/cookies'
import type { Box } from '@/lib/types/database'

// Boxes where the current user can publish (owner, or coach/admin member).
export async function coachBoxesFor(supabase: any, userId: string): Promise<{ id: string; name: string }[]> {
  return (await coachBoxRows(supabase, userId)).map(b => ({ id: b.id, name: b.name }))
}

/** Full rows of the boxes a person coaches: owned ones first, then where they're coach or admin. */
export async function coachBoxRows(supabase: any, userId: string): Promise<Box[]> {
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase.from('boxes').select('*').eq('owner_id', userId),
    supabase.from('box_members').select('role, boxes(*)').eq('user_id', userId).eq('is_active', true).in('role', ['coach', 'admin']),
  ])
  const map = new Map<string, Box>()
  for (const b of (owned ?? []) as any[]) if (b?.id) map.set(b.id, b as Box)
  for (const m of (memberships ?? []) as any[]) if (m.boxes?.id && !map.has(m.boxes.id)) map.set(m.boxes.id, m.boxes as Box)
  return [...map.values()]
}

/** The box a coach screen works on: ?box=, else the box picked in the app (cookie), else the first one. */
export async function pickCoachBox(supabase: any, userId: string, wanted?: string | null): Promise<{ box: Box | null; boxes: Box[] }> {
  const boxes = await coachBoxRows(supabase, userId)
  let picked = wanted ?? null
  if (!picked) { try { picked = (await cookies()).get(ACTIVE_BOX_COOKIE)?.value ?? null } catch { /* outside a request */ } }
  return { box: boxes.find(b => b.id === picked) ?? boxes[0] ?? null, boxes }
}
