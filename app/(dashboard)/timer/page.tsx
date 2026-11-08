import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/session'
import { redirect } from 'next/navigation'
import { TimerView, type TimerMode } from '@/components/athlete/TimerView'
import type { Profile } from '@/lib/types/database'

const MODES: TimerMode[] = ['fortime', 'amrap', 'emom', 'tabata']

// /timer?mode=amrap&mins=12&wod=Cindy preloads the timer from the WOD of the day.
export default async function TimerPage({ searchParams }: { searchParams: Promise<{ mode?: string; mins?: string; wod?: string }> }) {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const p = await getProfile(user.id)
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  const sp = await searchParams
  const mode = MODES.includes(sp.mode as TimerMode) ? (sp.mode as TimerMode) : undefined
  const mins = sp.mins ? Math.min(99, Math.max(1, parseInt(sp.mins, 10) || 0)) : undefined

  return <TimerView profile={profile} initialMode={mode} initialMins={mins} wodTitle={sp.wod?.slice(0, 80)} />
}
