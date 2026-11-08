import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'

// The dashboard layout and the page both need the user and the profile during the same
// request. React's cache() makes those two lookups run once per request instead of twice.
export const getUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

export const getProfile = cache(async (id: string): Promise<Profile | null> => {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
  return (data as Profile | null) ?? null
})
