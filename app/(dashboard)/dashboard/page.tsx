import { createClient } from '@/lib/supabase/server'
import { addDaysISO, daysBetween, todayISO } from '@/lib/utils/dates'
import type { Hit } from '@/lib/utils/movement-guide'
import type { TodayWod, GoalProgress } from '@/components/athlete/AthleteDashboard'
import { eventReadiness, type EventCategory, type PrLite } from '@/lib/utils/readiness'
import type { NextEvent } from '@/components/calendar/NextEventCard'
import type { CoachActivity } from '@/components/coach/CoachDashboard'
import { loadChallenges } from '@/lib/utils/challenges'
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
  let coachActivity: CoachActivity = { days: [], inactive: [], classes: [] }

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

      // Today's classes, the roster, and the last 30 days of results for activity + retention.
      const today = todayISO()
      const since30 = addDaysISO(today, -30)
      const wodQ = (cols: string) => supabase.from('daily_wods').select(cols)
        .eq('box_id', (coachBox as Box).id).eq('is_live', true).gte('scheduled_for', since30).lte('scheduled_for', today)
      const [wodsRes, { data: members }] = await Promise.all([
        wodQ('id, title, type, scheduled_for, class_time'),
        supabase.from('box_members').select('user_id, joined_at, profiles(full_name, avatar_url)')
          .eq('box_id', coachBox.id).eq('is_active', true).neq('user_id', user.id).order('joined_at', { ascending: false }),
      ])
      const allMembers = ((members ?? []) as any[]).map(m => ({
        id: m.user_id as string, name: (m.profiles?.full_name as string) ?? 'Atleta', avatar: (m.profiles?.avatar_url as string) ?? null, joinedAt: m.joined_at as string,
      }))
      recentMembers = allMembers.slice(0, 5)
      // Before migration 007 there's no class_time column.
      const wodList = ((wodsRes.error ? (await wodQ('id, title, type, scheduled_for')).data : wodsRes.data) ?? []) as any[]
      const ids = wodList.map(w => w.id)
      const { data: res } = ids.length
        ? await supabase.from('wod_results').select('user_id, daily_wod_id, recorded_at').in('daily_wod_id', ids)
        : { data: [] as any[] }
      const results = (res ?? []) as any[]
      const dayOf = new Map(wodList.map(w => [w.id, w.scheduled_for as string]))

      const todays = wodList.filter(w => w.scheduled_for === today)
        .sort((a, b) => String(a.class_time ?? '').localeCompare(String(b.class_time ?? '')))
      const first = todays[0]
      todayWod = first ? { id: first.id, title: first.title, type: first.type } : null
      todayResults = new Set(results.filter(r => todays.some(t => t.id === r.daily_wod_id)).map(r => r.user_id)).size
      coachActivity.classes = todays.map(t => ({
        id: t.id, title: t.title, time: t.class_time ? String(t.class_time).slice(0, 5) : null,
        count: results.filter(r => r.daily_wod_id === t.id).length,
      }))

      // Athletes per day, last 14 days.
      coachActivity.days = Array.from({ length: 14 }, (_, k) => {
        const d = addDaysISO(today, k - 13)
        return { date: d, athletes: new Set(results.filter(r => dayOf.get(r.daily_wod_id) === d).map(r => r.user_id)).size }
      })
      // Athletes who haven't logged a WOD in 7+ days (or ever, if they joined over a week ago).
      const last = new Map<string, string>()
      for (const r of results) { const d = dayOf.get(r.daily_wod_id) ?? ''; if (d > (last.get(r.user_id) ?? '')) last.set(r.user_id, d) }
      coachActivity.inactive = allMembers
        .map(m => ({ ...m, last: last.get(m.id) ?? null }))
        .filter(m => m.last ? daysBetween(m.last, today) >= 7 : daysBetween(m.joinedAt.slice(0, 10), today) >= 7)
        .map(m => ({ id: m.id, name: m.name, avatar: m.avatar, days: m.last ? daysBetween(m.last, today) : null }))
        .sort((a, b) => (b.days ?? 99) - (a.days ?? 99))
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

  // Box challenges (008) for both homes.
  const challengeBoxes = [...new Set([...myBoxIds, ...(coachBox ? [coachBox.id] : [])])]
  const challenges = await loadChallenges(supabase, user.id, challengeBoxes)

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
      coachActivity={coachActivity}
      challenges={challenges}
      hits={hits}
      goals={goals}
      logDates={logs.map(l => l.logged_on as string)}
      goalsMissing={!!goalsRes.error}
    />
  )
}
