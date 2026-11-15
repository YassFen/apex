import type { SupabaseClient } from '@supabase/supabase-js'

export type JoinResult =
  | { ok: true; boxName: string }
  | { ok: false; reason: 'invalid_code' | 'already_member' | 'removed' | 'error'; boxName?: string; message?: string }

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
    const reason = r.reason === 'invalid_code' || r.reason === 'already_member' || r.reason === 'removed' ? r.reason : 'error'
    return { ok: false, reason, boxName: r.box_name }
  }

  // RPC missing (PGRST202) → legacy path
  if (error && error.code !== 'PGRST202' && !/function .* does not exist|could not find the function/i.test(error.message)) {
    return { ok: false, reason: 'error', message: error.message }
  }

  const { data: box } = await supabase.from('boxes').select('id, name').eq('invite_code', code).maybeSingle()
  if (!box) return { ok: false, reason: 'invalid_code' }

  const { data: existing } = await supabase
    .from('box_members').select('id, is_active').eq('box_id', box.id).eq('user_id', userId).maybeSingle()
  if (existing) return { ok: false, reason: existing.is_active === false ? 'removed' : 'already_member', boxName: box.name }

  const { error: insErr } = await supabase
    .from('box_members').insert({ box_id: box.id, user_id: userId, role: 'athlete', is_active: true })
  if (insErr) return { ok: false, reason: 'error', message: insErr.message }
  return { ok: true, boxName: box.name }
}

/** Plain-Spanish message for a failed join. */
export function joinErrorMessage(res: Extract<JoinResult, { ok: false }>, friendly: (m?: string) => string): string {
  if (res.reason === 'invalid_code') return 'Código de invitación inválido. Revisa que esté escrito correctamente.'
  if (res.reason === 'already_member') return `Ya eres miembro de ${res.boxName ?? 'ese box'}.`
  if (res.reason === 'removed') return 'Este box te dio de baja. Habla con tu coach para volver a entrar.'
  return friendly(res.message)
}
