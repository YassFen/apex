// Boxes where the current user can publish (owner, or coach/admin member).
export async function coachBoxesFor(supabase: any, userId: string): Promise<{ id: string; name: string }[]> {
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase.from('boxes').select('id, name').eq('owner_id', userId),
    supabase.from('box_members').select('role, boxes(id, name)').eq('user_id', userId).eq('is_active', true).in('role', ['coach', 'admin']),
  ])
  const map = new Map<string, { id: string; name: string }>()
  for (const b of (owned ?? []) as any[]) map.set(b.id, { id: b.id, name: b.name })
  for (const m of (memberships ?? []) as any[]) if (m.boxes?.id) map.set(m.boxes.id, { id: m.boxes.id, name: m.boxes.name })
  return [...map.values()]
}
