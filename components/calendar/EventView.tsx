'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import {
  Trophy, MapPin, ExternalLink, Pencil, Trash2, CheckCircle2, Timer, AlertCircle, ChevronRight, Users, Medal, Target,
} from '@/components/ui/icons'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal, ModalActions } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { AnimatedNumber, EASE_OUT, Reveal, Segmented } from '@/components/ui/motion'
import { createClient } from '@/lib/supabase/client'
import { WOD_TYPE_META } from '@/lib/utils/wod-types'
import { friendlyError } from '@/lib/utils/errors'
import { daysBetween, formatDateOnly } from '@/lib/utils/dates'
import {
  EVENT_KIND_LABEL, ZONE_META, benchmarkFor, eventReadiness,
  type BenchmarkLite, type EventCategory, type EventKind, type EventWorkout, type MovementAssessment, type PrLite,
} from '@/lib/utils/readiness'
import { cn } from '@/lib/utils/cn'
import type { Profile, Unit } from '@/lib/types/database'

export interface EventDetail {
  id: string; boxId: string | null; boxName: string | null; name: string; kind: EventKind
  startsOn: string; endsOn: string; location: string | null; url: string | null; notes: string | null
  workouts: EventWorkout[]
  participants: { userId: string; category: EventCategory; division: string; name: string; avatar: string | null; finalPlace?: number | null; fieldSize?: number | null }[]
  /** null = event_results table missing (migration 007). */
  results: { workoutId: string; userId: string; name: string; value: string; place: number | null }[] | null
}

const DIVISIONS = [['rx', 'Rx'], ['scaled', 'Scaled'], ['masters', 'Masters'], ['teens', 'Teens']] as const
const CAT_KEY = 'apex.eventCategory'

const showLoad = (lb: number, unit: Unit) => unit === 'kg' ? `${Math.round(lb * 0.453592 * 2) / 2} kg` : `${Math.round(lb)} lb`

function readinessCopy(score: number | null): { title: string; body: string } {
  if (score === null) return { title: 'Faltan datos', body: 'Registra tus récords de los movimientos del evento para calcular tu preparación.' }
  if (score >= 85) return { title: 'Vas listo', body: 'Las cargas están cómodas para ti. Enfócate en ritmo y transiciones.' }
  if (score >= 65) return { title: 'Bien encaminado', body: 'Algunas cargas te exigirán. Planifica cómo partir las series.' }
  if (score >= 45) return { title: 'Va a doler', body: 'Varias cargas están cerca de tu límite. Prioriza fuerza en esos movimientos.' }
  return { title: 'Considera Scaled', body: 'Las cargas Rx están sobre tu nivel actual. Scaled te dejará competir de verdad.' }
}

export function EventView({ profile, event, today, prs, benchmarks, canEdit }: {
  profile: Profile; event: EventDetail; today: string; prs: PrLite[]; benchmarks: BenchmarkLite[]; canEdit: boolean
}) {
  const router = useRouter()
  const { fire } = useToast()
  const supabase = createClient()
  const unit: Unit = profile.preferred_unit ?? 'kg'

  const me = event.participants.find(p => p.userId === profile.id)
  const [category, setCategory] = useState<EventCategory>(me?.category ?? profile.sex ?? 'm')
  const [division, setDivision] = useState<string>(me?.division ?? 'rx')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [logFor, setLogFor] = useState<EventWorkout | null>(null)

  // Remember the category the athlete uses, for events they haven't joined yet.
  useEffect(() => {
    if (me || profile.sex) return
    try { const c = localStorage.getItem(CAT_KEY); if (c === 'm' || c === 'f') setCategory(c) } catch {}
  }, [me])

  const readiness = useMemo(() => eventReadiness(event.workouts, category, prs), [event.workouts, category, prs])
  const copy = readinessCopy(readiness.score)
  const days = daysBetween(today, event.startsOn)
  const finished = event.endsOn < today
  const multi = event.endsOn !== event.startsOn

  async function join() {
    setBusy(true)
    try { localStorage.setItem(CAT_KEY, category) } catch {}
    const { error } = await supabase.from('event_participants')
      .upsert({ event_id: event.id, user_id: profile.id, category, division }, { onConflict: 'event_id,user_id' })
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire(me ? 'Inscripción actualizada' : '¡Inscrito! A entrenar.', me ? 'ok' : 'pr')
    router.refresh()
  }

  async function leave() {
    setBusy(true)
    const { error } = await supabase.from('event_participants').delete().eq('event_id', event.id).eq('user_id', profile.id)
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire('Ya no figuras en este evento', 'info')
    router.refresh()
  }

  async function remove() {
    setBusy(true)
    const { data, error } = await supabase.from('events').delete().eq('id', event.id).select('id')
    setBusy(false)
    setConfirmDelete(false)
    if (error || !data?.length) { fire(error ? friendlyError(error.message) : 'No tienes permiso para borrar este evento', 'error'); return }
    fire('Evento eliminado', 'ok')
    router.push('/calendar')
    router.refresh()
  }

  return (
    <>
      <Topbar title="Evento" profile={profile} actions={canEdit && (
        <Link href={`/calendar/event/${event.id}/edit`} aria-label="Editar evento"
          className="inline-flex items-center gap-1.5 h-10 px-3 sm:px-4 rounded-full bg-p2 text-sm font-bold hover:bg-p3 transition">
          <Pencil size={15} aria-hidden /><span className="hidden sm:inline">Editar</span>
        </Link>
      )} />

      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-3xl w-full mx-auto">
        {/* ── Hero ───────────────────────────────── */}
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE_OUT }}
          className="rounded-[28px] bg-p p-1.5 ring-1 ring-t/[.05]">
          <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-rd/20 via-p2 to-p2 p-5 sm:p-6">
            <div className="absolute -right-16 -top-16 size-56 rounded-full bg-[radial-gradient(closest-side,rgb(var(--c-rd)/0.25),transparent)]" aria-hidden />
            <div className="relative flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rd/15 text-rd text-[10px] font-bold uppercase tracking-[1.2px]">
                    <Trophy size={12} aria-hidden /> {EVENT_KIND_LABEL[event.kind] ?? 'Evento'}
                  </span>
                  <span className="text-[11px] text-mu font-semibold">{event.boxName ? event.boxName : 'Personal'}</span>
                </div>
                <h1 className="font-display text-4xl sm:text-5xl font-extrabold leading-[0.95] mt-2 text-balance tracking-tight">{event.name}</h1>
                <div className="text-mu text-sm mt-2 first-letter:uppercase">
                  {formatDateOnly(event.startsOn, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {multi && ` – ${formatDateOnly(event.endsOn, { day: 'numeric', month: 'long' })}`}
                </div>
                <div className="flex flex-wrap gap-3 mt-2 text-sm">
                  {event.location && <span className="flex items-center gap-1 text-mu"><MapPin size={14} aria-hidden />{event.location}</span>}
                  {event.url && (
                    <a href={event.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-ac font-semibold">
                      Sitio del evento <ExternalLink size={13} aria-hidden />
                    </a>
                  )}
                </div>
              </div>
              <div className="text-center flex-shrink-0">
                <div className="font-display text-6xl font-extrabold leading-none tabular-nums tracking-tight">
                  {finished ? <CheckCircle2 size={48} className="text-gr mx-auto" aria-label="Terminado" /> : days <= 0 ? '¡Ya!' : <AnimatedNumber value={days} />}
                </div>
                <div className="text-[10px] uppercase tracking-[1.6px] text-mu font-bold mt-1">
                  {finished ? 'Terminó' : days <= 0 ? 'En curso' : days === 1 ? 'día' : 'días'}
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ── Participation ──────────────────────── */}
        {!finished && (
          <Reveal>
            <Card>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="font-display text-lg font-extrabold tracking-tight">{me ? 'Tu inscripción' : '¿Vas a competir?'}</h2>
                {me && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-ac/15 text-ac text-xs font-bold"><CheckCircle2 size={13} aria-hidden />Vas</span>}
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <Segmented id="ev-cat" value={category} onChange={c => setCategory(c)} options={[['m', 'Masculino'], ['f', 'Femenino']] as const} />
                <Segmented id="ev-div" value={division} onChange={setDivision} options={DIVISIONS} />
              </div>
              <p className="text-mu text-xs mt-2">La categoría define qué carga se compara con tus récords.</p>
              <div className="flex gap-2 mt-3">
                <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={join} disabled={busy || (!!me && me.category === category && me.division === division)}
                  className="flex-1 h-12 rounded-full bg-ac text-onac font-bold disabled:opacity-50">
                  {busy ? 'Un momento…' : me ? 'Guardar cambios' : 'Me inscribo'}
                </motion.button>
                {me && (
                  <button type="button" onClick={leave} disabled={busy} className="h-12 px-5 rounded-full bg-p2 text-mu font-bold hover:text-t">No voy</button>
                )}
              </div>
            </Card>
          </Reveal>
        )}

        {/* ── Readiness ──────────────────────────── */}
        {event.workouts.length > 0 && (
          <Reveal>
            <Card className="flex items-center gap-5">
              <ReadinessRing score={readiness.score} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[1.6px] text-fa font-bold">Preparación</div>
                <div className="font-display text-2xl font-extrabold leading-tight tracking-tight">{copy.title}</div>
                <p className="text-mu text-sm text-pretty mt-0.5">{copy.body}</p>
                <p className="text-fa text-xs mt-1.5">Basado en {readiness.known} de {readiness.total} movimientos · {category === 'f' ? 'cargas femeninas' : 'cargas masculinas'}</p>
              </div>
            </Card>
          </Reveal>
        )}

        {readiness.missing.length > 0 && (
          <Reveal>
            <div className="flex gap-3 p-4 rounded-2xl bg-or/10">
              <AlertCircle size={18} className="text-or flex-shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0">
                <div className="text-sm font-bold text-or">Registra estos récords para afinar el cálculo</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {readiness.missing.map(n => (
                    <Link key={n} href="/prs" className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-p text-xs font-bold hover:bg-p2">
                      {n} <ChevronRight size={12} aria-hidden />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        )}

        {/* ── Workouts ───────────────────────────── */}
        {event.workouts.length === 0 ? (
          <Card className="text-center py-10 flex flex-col items-center gap-3">
            <span className="size-12 rounded-2xl bg-p2 text-mu grid place-items-center"><Target size={22} aria-hidden /></span>
            <div className="font-bold text-sm">Aún no hay workouts anunciados</div>
            <p className="text-mu text-xs max-w-xs text-pretty">Cuando se publiquen, agrégalos y verás cuánto pesa cada carga para ti y cómo partir las series.</p>
            {canEdit && <Link href={`/calendar/event/${event.id}/edit`} className="h-10 px-4 rounded-full bg-ac text-onac text-sm font-bold inline-flex items-center">Agregar workouts</Link>}
          </Card>
        ) : (
          event.workouts.map((w, wi) => (
            <Reveal key={w.id ?? wi} delay={Math.min(wi, 3) * 0.04}>
              <WorkoutCard workout={w} index={wi} assessments={readiness.assessments[wi] ?? []} unit={unit} benchmark={benchmarkFor(w.title, benchmarks)}
                results={event.results?.filter(r => r.workoutId === w.id) ?? null} meId={profile.id}
                canLog={!!me && today >= event.startsOn && event.results !== null} onLog={() => setLogFor(w)} />
            </Reveal>
          ))
        )}

        {/* ── Who's going ────────────────────────── */}
        {event.boxId && event.participants.length > 0 && (
          <Reveal>
            <Card>
              <h2 className="font-display text-lg font-extrabold mb-3 flex items-center gap-2 tracking-tight">
                <Users size={16} className="text-ac" aria-hidden />Van {event.participants.length}
              </h2>
              <ul className="flex flex-wrap gap-2 stagger">
                {event.participants.map(pt => (
                  <li key={pt.userId} className="flex items-center gap-2 h-10 pl-1 pr-3 rounded-full bg-p2">
                    {pt.avatar
                      ? <img src={pt.avatar} alt="" className="size-8 rounded-full object-cover" />
                      : <span className="size-8 rounded-full bg-p3 grid place-items-center text-[11px] font-bold text-mu">{pt.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>}
                    <span className="text-sm font-semibold">{pt.name.split(' ')[0]}</span>
                    <span className="text-[10px] text-mu font-bold uppercase">{pt.division}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>
        )}

        {event.notes && (
          <Reveal>
            <Card>
              <h2 className="font-display text-lg font-extrabold mb-2 tracking-tight">Notas</h2>
              <p className="text-mu text-sm whitespace-pre-line">{event.notes}</p>
            </Card>
          </Reveal>
        )}

        {canEdit && (
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="self-center inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-rd text-sm font-bold hover:bg-rd/10 transition">
            <Trash2 size={15} aria-hidden /> Eliminar evento
          </button>
        )}
      </div>

      <ResultSheet workout={logFor} eventId={event.id} existing={logFor ? event.results?.find(r => r.workoutId === logFor.id && r.userId === profile.id) ?? null : null}
        onClose={() => setLogFor(null)} onSaved={() => { setLogFor(null); fire('Resultado guardado', 'pr'); router.refresh() }} />
      {finished && me && event.results !== null && <FinalPlace eventId={event.id} me={me} />}
      <ConfirmDialog open={confirmDelete} danger busy={busy} title="¿Eliminar el evento?"
        body={event.boxId ? 'Desaparece del calendario de todo el box, con sus workouts e inscripciones.' : 'Se borran el evento y sus workouts.'}
        confirmLabel="Eliminar" onConfirm={remove} onClose={() => setConfirmDelete(false)} />
    </>
  )
}

function ReadinessRing({ score }: { score: number | null }) {
  const r = 42
  const c = 2 * Math.PI * r
  const value = score ?? 0
  const tone = score === null ? 'text-fa' : score >= 85 ? 'text-gr' : score >= 65 ? 'text-bl' : score >= 45 ? 'text-or' : 'text-rd'
  return (
    <div className="relative size-[104px] flex-shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-t/10" />
        <motion.circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" strokeLinecap="round"
          className={cn('stroke-current', tone)}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c * (1 - value / 100) }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: EASE_OUT, delay: 0.15 }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className={cn('font-display text-3xl font-extrabold tabular-nums tracking-tight', tone)}>
          {score === null ? '—' : <><AnimatedNumber value={value} />%</>}
        </span>
      </div>
    </div>
  )
}

function WorkoutCard({ workout, index, assessments, unit, benchmark, results, meId, canLog, onLog }: {
  workout: EventWorkout; index: number; assessments: MovementAssessment[]; unit: Unit; benchmark: BenchmarkLite | null
  results: EventDetail['results']; meId: string; canLog: boolean; onLog: () => void
}) {
  const mine = results?.find(r => r.userId === meId)
  const board = [...(results ?? [])].sort((a, b) => (a.place ?? 999) - (b.place ?? 999))
  const meta = WOD_TYPE_META[workout.type] ?? { label: workout.type, cls: 'text-mu bg-p3' }
  return (
    <Card padding={false} className="overflow-hidden">
      <div className="p-5 pb-3">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className="text-[10px] uppercase tracking-[1.6px] text-fa font-bold">Workout {index + 1}</span>
          <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-bold uppercase', meta.cls)}>{meta.label}</span>
          {workout.time_cap_mins ? <span className="flex items-center gap-1 text-xs text-mu"><Timer size={12} aria-hidden />{workout.type === 'amrap' ? '' : 'Cap '}{workout.time_cap_mins} min</span> : null}
        </div>
        <h3 className="font-display text-3xl font-extrabold leading-none tracking-tight">{workout.title}</h3>
        {workout.description && <p className="text-mu text-sm mt-2 whitespace-pre-line">{workout.description}</p>}
        {benchmark && (
          <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full bg-ac/15 text-ac text-xs font-bold">
            <Medal size={13} aria-hidden /> Tu mejor {benchmark.name}: {benchmark.result}
          </div>
        )}
      </div>
      {assessments.length > 0 && (
        <ul className="flex flex-col">
          {assessments.map((a, i) => <MovementRow key={i} a={a} unit={unit} />)}
        </ul>
      )}
      {(canLog || board.length > 0) && (
        <div className="px-5 py-4 border-t border-[var(--ln)] flex flex-col gap-3">
          {canLog && (
            <button type="button" onClick={onLog}
              className={cn('h-11 rounded-full text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition',
                mine ? 'bg-gr/15 text-gr' : 'bg-t text-bg')}>
              {mine ? <><CheckCircle2 size={16} weight="fill" aria-hidden /> Tu resultado: {mine.value}{mine.place ? ` · #${mine.place}` : ''}</> : 'Registrar mi resultado'}
            </button>
          )}
          {board.length > 1 && (
            <ol className="flex flex-col gap-1">
              {board.map((r, i) => (
                <li key={r.userId} className={cn('flex items-center gap-3 px-3 py-2 rounded-xl text-sm', r.userId === meId ? 'bg-ac/15' : 'bg-p2')}>
                  <span className="w-7 font-display font-bold tabular-nums text-mu">#{r.place ?? i + 1}</span>
                  <span className="flex-1 truncate font-medium">{r.name}</span>
                  <span className="font-display font-bold tabular-nums">{r.value}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  )
}

function MovementRow({ a, unit }: { a: MovementAssessment; unit: Unit }) {
  const zone = ZONE_META[a.zone]
  const pct = a.pct ?? 0
  return (
    <li className="px-5 py-3.5 border-t border-[var(--ln)]">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-xl font-extrabold text-ac tabular-nums min-w-[2.25rem] tracking-tight">{a.movement.reps}</span>
        <span className="font-semibold text-sm flex-1 min-w-0 truncate">{a.movement.name}</span>
        {a.loadLb && <span className="font-display text-lg font-extrabold tabular-nums tracking-tight">{showLoad(a.loadLb, unit)}</span>}
      </div>
      {a.zone !== 'unknown' || a.advice ? (
        <div className="mt-2 pl-[2.75rem]">
          {a.pct !== null && (
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-2 flex-1 rounded-full bg-t/[.08] overflow-hidden">
                <motion.div className={cn('h-full rounded-full', zone.bg)}
                  initial={{ width: 0 }} whileInView={{ width: `${Math.min(100, pct)}%` }} viewport={{ once: true }}
                  transition={{ duration: 0.8, ease: EASE_OUT }} />
              </div>
              <span className={cn('text-xs font-bold tabular-nums w-11 text-right', zone.text)}>{pct}%</span>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-p2', zone.text)}>{zone.label}</span>
            {a.oneRmLb && <span className="text-[11px] text-mu">Tu 1RM{a.estimated ? ' (estimado)' : ''}: <b className="text-t">{showLoad(a.oneRmLb, unit)}</b></span>}
            {a.zone === 'skill' && a.maxReps && <span className="text-[11px] text-mu">Máx: <b className="text-t">{a.maxReps} reps</b></span>}
          </div>
          {a.advice && <p className="text-xs text-mu mt-1.5 text-pretty">{a.advice}</p>}
        </div>
      ) : null}
    </li>
  )
}

/* ── Logging a competition result ─────────────────────────────────────────── */

function ResultSheet({ workout, eventId, existing, onClose, onSaved }: {
  workout: EventWorkout | null; eventId: string
  existing: { value: string; place: number | null } | null
  onClose: () => void; onSaved: () => void
}) {
  const { fire } = useToast()
  const [value, setValue] = useState('')
  const [place, setPlace] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setValue(existing?.value ?? ''); setPlace(existing?.place ? String(existing.place) : '') }, [workout, existing])
  if (!workout) return <Modal open={false} onClose={onClose}>{null}</Modal>

  const hint = workout.type === 'amrap' ? 'Rondas + reps (ej: 7+12)' : workout.type === 'strength' ? 'Carga (ej: 120 kg)' : 'Tiempo (ej: 8:42) o reps si no terminaste'
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim() || !workout?.id) return
    setBusy(true)
    const { error } = await createClient().from('event_results').upsert(
      { workout_id: workout.id, event_id: eventId, result_value: value.trim(), place: place ? Number(place) : null },
      { onConflict: 'workout_id,user_id' })
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    onSaved()
  }
  return (
    <Modal open onClose={onClose} eyebrow="Competencia" title={<>Tu marca en <span className="text-ac">{workout.title}</span></>}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <label className="block">
          <span className="block text-[13px] text-mu font-medium mb-1.5 px-1">Resultado</span>
          <input value={value} onChange={e => setValue(e.target.value)} placeholder={hint} autoFocus
            className="w-full h-14 px-4 rounded-2xl bg-p2 text-2xl font-display font-bold outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 placeholder:text-base placeholder:font-normal placeholder:text-fa" />
        </label>
        <label className="block">
          <span className="block text-[13px] text-mu font-medium mb-1.5 px-1">Puesto en este workout (opcional)</span>
          <input value={place} onChange={e => setPlace(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Ej: 12"
            className="w-full h-12 px-4 rounded-2xl bg-p2 outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 placeholder:text-fa" />
        </label>
        <ModalActions secondary="Cancelar" primary={existing ? 'Actualizar' : 'Guardar'} onSecondary={onClose} primaryType="submit" busy={busy} disabled={!value.trim()} />
      </form>
    </Modal>
  )
}

/** After the event: overall standing, for the progress between competitions. */
function FinalPlace({ eventId, me }: { eventId: string; me: EventDetail['participants'][number] }) {
  const router = useRouter()
  const { fire } = useToast()
  const [place, setPlace] = useState(me.finalPlace ? String(me.finalPlace) : '')
  const [field, setField] = useState(me.fieldSize ? String(me.fieldSize) : '')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    const { error } = await createClient().from('event_participants')
      .update({ final_place: place ? Number(place) : null, field_size: field ? Number(field) : null })
      .eq('event_id', eventId).eq('user_id', me.userId)
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire('Puesto final guardado', 'pr'); router.refresh()
  }
  return (
    <div className="p-4 lg:px-6 max-w-3xl w-full mx-auto -mt-2 mb-6">
      <Card>
        <h2 className="font-semibold mb-1">Tu puesto final</h2>
        <p className="text-mu text-sm mb-3">Con esto calculamos tu progreso entre competencias.</p>
        <div className="flex items-center gap-2">
          <input value={place} onChange={e => setPlace(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Puesto" aria-label="Puesto final"
            className="w-24 h-12 px-3 rounded-2xl bg-p2 text-center text-lg font-bold outline-none focus:ring-2 focus:ring-ac/50" />
          <span className="text-mu">de</span>
          <input value={field} onChange={e => setField(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Total" aria-label="Total de competidores"
            className="w-24 h-12 px-3 rounded-2xl bg-p2 text-center text-lg font-bold outline-none focus:ring-2 focus:ring-ac/50" />
          <button type="button" onClick={save} disabled={busy || !place} className="ml-auto h-12 px-5 rounded-full bg-ac text-onac font-semibold disabled:opacity-50">
            {busy ? '…' : 'Guardar'}
          </button>
        </div>
        <Link href="/competitions" className="inline-flex items-center gap-1 text-sm text-ac font-semibold mt-3">Ver mi progreso en competencias <ChevronRight size={14} /></Link>
      </Card>
    </div>
  )
}
