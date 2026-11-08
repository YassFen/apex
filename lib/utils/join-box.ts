import type { SupabaseClient } from '@supabase/supabase-js'

export type JoinResult =
  | { ok: true; boxName: string }
  | { ok: false; reason: 'invalid_code' | 'already_member' | 'error'; boxName?: string; message?: string }

/**
 * Joins the current user to a box by invite code. Uses the `join_box_by_code`
 * RPC (migration 004), which validates the code server-side. Falls back to the
 * old client-side lookup + insert while that migration is not applied.
 */
export async function joinBoxByCode(supabase: SupabaseClient, rawCode: string, userId: string): Promise<JoinResult> {
  const code = rawCode.trim().toUpperCase()
  if (!code) return { ok: false, reason: 'invalid_code' }

  const { data, error } = await supabase.rpc('join_box_by_code', { p_code: code })
  if (!error && data) {
    const r = data as { ok: boolean; reason?: string; box_name?: string }
    if (r.ok) return { ok: true, boxName: r.box_name ?? 'tu box' }
    return { ok: false, reason: (r.reason as 'invalid_code' | 'already_member') ?? 'error', boxName: r.box_name }
  }

  // RPC missing (PGRST202) → legacy path
  if (error && error.code !== 'PGRST202' && !/function .* does not exist|could not find the function/i.test(error.message)) {
    return { ok: false, reason: 'error', message: error.message }
  }

  const { data: box } = await supabase.from('boxes').select('id, name').eq('invite_code', code).maybeSingle()
  if (!box) return { ok: false, reason: 'invalid_code' }

  const { data: existing } = await supabase
    .from('box_members').select('id').eq('box_id', box.id).eq('user_id', userId).maybeSingle()
  if (existing) return { ok: false, reason: 'already_member', boxName: box.name }

  const { error: insErr } = await supabase
    .from('box_members').insert({ box_id: box.id, user_id: userId, role: 'athlete', is_active: true })
  if (insErr) return { ok: false, reason: 'error', message: insErr.message }
  return { ok: true, boxName: box.name }
}
