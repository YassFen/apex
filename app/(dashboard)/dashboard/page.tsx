import { createClient } from '@/lib/supabase/server'
import { addDaysISO, daysBetween, todayISO } from '@/lib/utils/dates'
import type { Hit } from '@/lib/utils/movement-guide'
import type { TodayWod, GoalProgress } from '@/components/athlete/AthleteDashboard'
import { eventReadiness, type EventCategory, type PrLite } from '@/lib/utils/readiness'
import type { NextEvent } from '@/components/calendar/NextEventCard'
import { redirect } from 'next/navigation'
import { DashboardDispatcher } from '@/components/layout/DashboardDispatcher'
import type { Profile, Box, Movement } from '@/lib/types/database'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = p as Profile | null
  if (!profile) redirect('/auth/login')

  // Fetch coach box + stats
  let coachBox: Box | null = null
  let athleteCount = 0
  let todayWod: { id: string; title: string; type: string } | null = null
  let todayResults = 0
  let recentMembers: { id: string; name: string; avatar: string | null; joinedAt: string }[] = []

  if (profile.role === 'coach' || profile.role === 'admin') {
    const { data: b } = await supabase
      .from('boxes').select('*').eq('owner_id', user.id).maybeSingle()
    coachBox = b as Box | null

    if (coachBox) {
      // Count active athletes
      const { count } = await supabase
        .from('box_members')
        .select('*', { count: 'exact', head: true })
        .eq('box_id', coachBox.id)
        .eq('is_active', true)
        .neq('user_id', user.id) // the coach is a member of their own box; don't count them
      athleteCount = count ?? 0

      // Today's WOD
      const today = todayISO()
      const [{ data: wod }, { data: members }] = await Promise.all([
        supabase
          .from('daily_wods')
          .select('id, title, type')
          .eq('box_id', coachBox.id)
          .eq('scheduled_for', today)
          .eq('is_live', true)
          .order('published_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('box_members')
          .select('user_id, joined_at, profiles(full_name, avatar_url)')
          .eq('box_id', coachBox.id)
          .eq('is_active', true)
          .neq('user_id', user.id)
          .order('joined_at', { ascending: false })
          .limit(5),
      ])
      todayWod = (wod as any) ?? null
      recentMembers = ((members ?? []) as any[]).map(m => ({
        id: m.user_id, name: m.profiles?.full_name ?? 'Atleta', avatar: m.profiles?.avatar_url ?? null, joinedAt: m.joined_at,
      }))

      if (todayWod) {
        const { count: rc } = await supabase
          .from('wod_results')
          .select('*', { count: 'exact', head: true })
          .eq('daily_wod_id', todayWod.id)
        todayResults = rc ?? 0
      }
    }
  }

  // Fetch athlete PRs (for athlete mode — even coaches have their own PRs)
  const { data: rawPrs } = await supabase
    .from('pr_records')
    .select('*, movements(name, category)')
    .eq('user_id', user.id)
    .order('recorded_at', { ascending: false })
    .limit(50)

  // Athlete home: today's WOD in any of my boxes, and whether I already logged it.
  const { data: myBoxes } = await supabase
    .from('box_members').select('box_id').eq('user_id', user.id).eq('is_active', true)
  const myBoxIds = ((myBoxes ?? []) as any[]).map(m => m.box_id as string)
  let athleteToday: TodayWod | null = null
  if (myBoxIds.length > 0) {
    const q = (cols: string) => supabase.from('daily_wods').select(cols)
      .in('box_id', myBoxIds).eq('scheduled_for', todayISO()).eq('is_live', true)
    let { data: ws, error: wErr } = await q('id, title, type, duration_mins, class_time')
    if (wErr) ({ data: ws } = await q('id, title, type, duration_mins'))
    // Several classes today: show the next one still to come.
    const nowHm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' }).format(new Date())
    const list = ((ws ?? []) as any[]).sort((a, b) => String(a.class_time ?? '').localeCompare(String(b.class_time ?? '')))
    const w = list.find(x => !x.class_time || String(x.class_time).slice(0, 5) >= nowHm) ?? list[list.length - 1]
    if (w) {
      const { data: r } = await supabase
        .from('wod_results').select('result_value').eq('daily_wod_id', w.id).eq('user_id', user.id).maybeSingle()
      athleteToday = {
        title: w.title, type: w.type, durationMins: w.duration_mins, myResult: (r as any)?.result_value ?? null,
        classTime: w.class_time ? String(w.class_time).slice(0, 5) : null, count: list.length,
      }
    }
  }

  // Muscle recovery inputs (last 10 days): WOD movements I did, my own logs and lifts.
  const since10 = new Date(Date.now() - 10 * 86_400_000).toISOString()
  const [{ data: recentRes }, logsRes, goalsRes] = await Promise.all([
    supabase.from('wod_results').select('recorded_at, daily_wods(movements)').eq('user_id', user.id).gte('recorded_at', since10),
    supabase.from('personal_logs').select('id, logged_on, movement, sets, reps, distance_m, load_lb, created_at')
      .eq('user_id', user.id).gte('logged_on', addDaysISO(todayISO(), -120)).order('logged_on', { ascending: false }),
    supabase.from('goals').select('id, movement, target, unit, period, starts_on').eq('user_id', user.id).eq('archived', false),
  ])
  const logs = (logsRes.error ? [] : logsRes.data ?? []) as any[]
  const hits: Hit[] = [
    ...((recentRes ?? []) as any[]).flatMap(r => ((r.daily_wods?.movements ?? []) as any[]).map(m => ({ at: r.recorded_at, movement: String(m.name ?? '') }))),
    ...logs.map(l => ({ at: `${l.logged_on}T12:00:00`, movement: l.movement })),
    ...((rawPrs ?? []) as any[]).filter(p => p.recorded_at >= since10).map(p => ({ at: p.recorded_at, movement: p.movements?.name ?? '' })),
  ]
  const goals: GoalProgress[] = ((goalsRes.error ? [] : goalsRes.data ?? []) as any[]).map(g => {
    const from = g.period === 'today' || g.period === 'daily' ? todayISO()
      : g.period === 'week' || g.period === 'weekly' ? addDaysISO(todayISO(), -((new Date().getDay() + 6) % 7)) : g.starts_on
    const done = logs.filter(l => l.logged_on >= from && l.movement.toLowerCase() === String(g.movement).toLowerCase())
      .reduce((s, l) => s + (l.sets ?? 1) * (l.reps ?? l.distance_m ?? 0), 0)
    return { id: g.id, movement: g.movement, target: g.target, unit: g.unit, period: g.period, done }
  })

  // Days with a logged WOD result (last 60), for the streak and the week strip.
  const { data: rawResultDays } = await supabase
    .from('wod_results')
    .select('recorded_at')
    .eq('user_id', user.id)
    .gte('recorded_at', new Date(Date.now() - 60 * 86_400_000).toISOString())
  const resultDates = ((rawResultDays ?? []) as any[]).map(r => r.recorded_at as string)

  // Next competition the athlete is going to (or their box's), with readiness from their records.
  const today = todayISO()
  let nextEvent: NextEvent | null = null
  const { data: rawEvents, error: evErr } = await supabase
    .from('events')
    .select('id, name, kind, starts_on, ends_on, box_id, created_by, event_workouts(position, title, type, time_cap_mins, description, movements), event_participants(user_id, category)')
    .gte('starts_on', today)
    .order('starts_on')
    .limit(10)
  if (!evErr) {
    const evs = (rawEvents ?? []) as any[]
    const mineOf = (e: any) => (e.event_participants ?? []).find((x: any) => x.user_id === user.id)
    const pick = evs.find(e => mineOf(e)) ?? evs.find(e => e.box_id) ?? evs[0]
    if (pick) {
      const me = mineOf(pick)
      const prLite: PrLite[] = ((rawPrs ?? []) as any[])
        .filter(r => r.is_pr && r.movements?.name)
        .map(r => ({ movement: r.movements.name, metric: r.metric, valueLb: Number(r.value_lb) }))
      const workouts = ((pick.event_workouts ?? []) as any[]).map(w => ({ ...w, movements: Array.isArray(w.movements) ? w.movements : [] }))
      const rd = workouts.length ? eventReadiness(workouts, (me?.category ?? profile.sex ?? 'm') as EventCategory, prLite) : null
      nextEvent = {
        id: pick.id, name: pick.name, kind: pick.kind, startsOn: pick.starts_on,
        days: daysBetween(today, pick.starts_on), readiness: rd?.score ?? null, going: !!me,
      }
    }
  }

  // All movements — used by AthleteDashboard for KPI customization picker
  // so the user can choose any movement, not just ones they've already PR'd.
  const { data: rawMovs } = await supabase
    .from('movements')
    .select('*')
    .order('category')
    .order('name')
  const allMovements = (rawMovs ?? []) as Movement[]

  return (
    <DashboardDispatcher
      profile={profile}
      coachBox={coachBox}
      prs={(rawPrs ?? []) as any[]}
      movements={allMovements}
      athleteCount={athleteCount}
      todayWod={todayWod}
      todayResults={todayResults}
      recentMembers={recentMembers}
      athleteToday={athleteToday}
      hasBox={myBoxIds.length > 0}
      resultDates={resultDates}
      nextEvent={nextEvent}
      hits={hits}
      goals={goals}
      logDates={logs.map(l => l.logged_on as string)}
      goalsMissing={!!goalsRes.error}
    />
  )
}
