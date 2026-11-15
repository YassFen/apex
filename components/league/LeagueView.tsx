'use client'
// The athlete's progress: league, XP, streak, squads (duplas / cuartetos), app challenges and rankings.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { Avatar, Chips } from '@/components/manage/ui'
import { Flame, Lightning, Trophy, UsersThree, Target, Plus, Check, Share2, CaretDown, ShieldStar, Warning } from '@/components/ui/icons'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/utils/errors'
import { addDaysISO, formatDateOnly } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'
import {
  KIND_LABEL, LEAGUES, METRIC_LABEL, SQUAD_REASON, XP_RULES, leagueFor,
  type ChallengeInfo, type Progress, type RankRow, type SquadInfo,
} from '@/lib/utils/progress'
import type { Profile } from '@/lib/types/database'

type Scope = 'week' | 'all' | 'global'
const inputCls = 'w-full h-12 px-4 rounded-xl bg-p2 text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60'

export function LeagueView({ profile, progress, box, ranking, today }: {
  profile: Profile; progress: Progress | null; box: { id: string; name: string } | null; ranking: RankRow[]; today: string
}) {
  if (!progress) {
    return (
      <>
        <Topbar title="Liga" profile={profile} />
        <div className="p-4 lg:p-6 max-w-2xl w-full">
          <div className="flex gap-2.5 p-3.5 rounded-2xl bg-or/10 text-or text-sm">
            <Warning size={18} className="flex-shrink-0 mt-px" aria-hidden />
            <span className="text-pretty">Las ligas todavía no están disponibles. Muy pronto vas a poder sumar experiencia con cada entreno.</span>
          </div>
        </div>
      </>
    )
  }
  return <Loaded profile={profile} progress={progress} box={box} ranking={ranking} today={today} />
}

function Loaded({ profile, progress, box, ranking, today }: {
  profile: Profile; progress: Progress; box: { id: string; name: string } | null; ranking: RankRow[]; today: string
}) {
  const router = useRouter()
  const { fire } = useToast()
  const { league, next, pct, toNext } = leagueFor(progress.total)
  const [isPublic, setIsPublic] = useState(progress.public)
  const [rules, setRules] = useState(false)
  const [scope, setScope] = useState<Scope>(box ? 'week' : 'global')
  const [rows, setRows] = useState<Record<string, RankRow[]>>({ [box ? 'week' : 'global']: ranking })
  const [loadingRank, setLoadingRank] = useState(false)
  const [sheet, setSheet] = useState<null | 'create' | 'join'>(null)

  const days = new Set(progress.days)
  const last28 = Array.from({ length: 28 }, (_, i) => addDaysISO(today, i - 27))

  async function pickScope(s: Scope) {
    setScope(s)
    if (rows[s]) return
    setLoadingRank(true)
    const supabase = createClient()
    const { data } = s === 'global' || !box
      ? await supabase.rpc('xp_ranking', { p_scope: 'global', p_id: null, p_period: 'week' })
      : await supabase.rpc('xp_ranking', { p_scope: 'box', p_id: box.id, p_period: s })
    setRows(r => ({ ...r, [s]: (Array.isArray(data) ? data : []) as RankRow[] }))
    setLoadingRank(false)
  }

  async function togglePublic(v: boolean) {
    setIsPublic(v)
    const { error } = await createClient().from('profiles').update({ league_public: v }).eq('id', profile.id)
    if (error) { setIsPublic(!v); fire(friendlyError(error.message), 'error'); return }
    fire(v ? 'Tu liga ahora es pública.' : 'Tu liga ahora es privada.', 'ok')
  }

  const list = rows[scope] ?? []
  return (
    <>
      <Topbar title="Liga" profile={profile} />
      <div className="p-4 lg:p-6 grid grid-cols-1 gap-4 max-w-2xl w-full pb-[calc(96px+env(safe-area-inset-bottom))] lg:pb-6">
        {/* League */}
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <span className={cn('size-16 rounded-2xl grid place-items-center flex-shrink-0 animate-pop', league.ring, league.tone)}>
              <ShieldStar size={36} weight="fill" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-mu">Tu liga</div>
              <div className={cn('font-display text-3xl font-bold tracking-tight leading-none', league.tone)}>{league.name}</div>
              <div className="text-sm text-mu mt-1 tabular-nums">{progress.total.toLocaleString('es-CL')} XP en total</div>
            </div>
          </div>
          <div>
            <div className="h-2.5 rounded-full bg-p3 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance a la próxima liga">
              <div className="h-full rounded-full bg-ac transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-xs text-mu mt-1.5">
              {next ? <>Te faltan <span className="text-t font-semibold tabular-nums">{toNext.toLocaleString('es-CL')} XP</span> para {next.name}</> : 'Estás en la liga más alta.'}
            </div>
          </div>
          <div className="flex gap-1.5">
            {LEAGUES.map(l => (
              <div key={l.key} className={cn('flex-1 min-w-0 rounded-lg py-1.5 text-center text-[11px] font-semibold truncate', l.key === league.key ? cn(l.ring, l.tone) : progress.total >= l.min ? 'bg-p2 text-mu' : 'bg-p2 text-fa')}>{l.name}</div>
            ))}
          </div>
        </Card>

        {/* Streak + today */}
        <div className="grid grid-cols-3 gap-3">
          <Tile icon={<Flame size={18} weight="fill" aria-hidden />} tone="text-or" value={progress.streak} label={progress.streak === 1 ? 'día de racha' : 'días de racha'} />
          <Tile icon={<Lightning size={18} weight="fill" aria-hidden />} tone="text-ac" value={progress.week} label="XP esta semana" />
          <Tile icon={<Trophy size={18} weight="fill" aria-hidden />} tone="text-pu" value={progress.best_streak} label="mejor racha" />
        </div>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold text-mu">Últimas 4 semanas</h2>
            <span className={cn('text-xs font-semibold', progress.trained_today ? 'text-gr' : 'text-or')}>
              {progress.trained_today ? `Hoy sumaste ${progress.today} XP` : progress.streak > 0 ? 'Entrena hoy o mañana para seguir la racha' : 'Entrena hoy y empieza tu racha'}
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1.5" aria-label="Días entrenados">
            {last28.map(d => (
              <div key={d} title={formatDateOnly(d, { day: 'numeric', month: 'short' })}
                className={cn('h-7 rounded-md grid place-items-center text-[10px] tabular-nums', days.has(d) ? 'bg-ac text-onac font-bold' : d === today ? 'bg-p3 text-t ring-1 ring-inset ring-ac/50' : 'bg-p2 text-fa')}>
                {Number(d.slice(8))}
              </div>
            ))}
          </div>
          <p className="text-xs text-fa text-pretty">Un día de descanso no corta la racha. Dos seguidos, sí.</p>
        </Card>

        {/* Squads */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold tracking-tight">Duplas y cuartetos</h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSheet('join')} className="h-9 px-3.5 rounded-full bg-p text-xs font-semibold text-mu">Tengo un código</button>
              <button type="button" onClick={() => setSheet('create')} className="h-9 px-3.5 rounded-full bg-ac text-onac text-xs font-bold flex items-center gap-1"><Plus size={14} weight="bold" aria-hidden /> Crear</button>
            </div>
          </div>
          {progress.squads.length === 0 && (
            <Card className="flex items-start gap-3">
              <span className="size-11 rounded-2xl bg-bl/15 text-bl grid place-items-center flex-shrink-0"><UsersThree size={24} weight="duotone" aria-hidden /></span>
              <p className="text-sm text-mu text-pretty">Arma una dupla o un cuarteto. Cada día que <span className="text-t font-semibold">todos</span> entrenan, la racha del equipo crece y cada uno gana 15 XP extra.</p>
            </Card>
          )}
          {progress.squads.map(s => <SquadCard key={s.id} squad={s} me={profile.id} onChanged={() => router.refresh()} />)}
        </section>

        {/* App challenges */}
        {progress.challenges.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-bold tracking-tight">Retos de APEX</h2>
            {progress.challenges.map(c => <ChallengeCard key={c.id} c={c} today={today} />)}
          </section>
        )}

        {/* Ranking */}
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold tracking-tight">Ranking</h2>
          <Chips<Scope> label="Ranking" value={scope} onChange={pickScope}
            options={[...(box ? [{ key: 'week' as const, label: 'Mi box · semana' }, { key: 'all' as const, label: 'Mi box · total' }] : []), { key: 'global' as const, label: 'Todos · semana' }]} />
          <Card padding={false} className="overflow-hidden">
            {loadingRank && <div className="p-4 flex flex-col gap-2"><div className="skeleton h-10 rounded-xl" /><div className="skeleton h-10 rounded-xl" /><div className="skeleton h-10 rounded-xl" /></div>}
            {!loadingRank && list.length === 0 && <p className="p-5 text-sm text-mu">Todavía nadie sumó puntos aquí. Registra tu entreno y abre el marcador.</p>}
            {!loadingRank && list.length > 0 && (
              <ol>
                {list.map((r, i) => {
                  const mine = r.user_id === profile.id
                  const lg = leagueFor(Number(r.total)).league
                  return (
                    <li key={r.user_id} className={cn('flex items-center gap-3 px-4 py-3', mine && 'bg-ac/10', i > 0 && 'border-t border-[var(--ln)]')}>
                      <span className={cn('w-6 text-center font-display font-bold tabular-nums', i < 3 ? 'text-ac' : 'text-fa')}>{i + 1}</span>
                      <Avatar name={r.full_name} src={r.avatar_url} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{mine ? 'Tú' : r.full_name}</div>
                        <div className={cn('text-[11px] font-semibold', lg.tone)}>{lg.name}</div>
                      </div>
                      <span className="font-display font-bold tabular-nums">{Number(scope === 'all' ? r.total : r.xp).toLocaleString('es-CL')}<span className="text-xs text-fa font-sans font-normal"> XP</span></span>
                    </li>
                  )
                })}
              </ol>
            )}
          </Card>
          <label className="flex items-center gap-3 p-4 rounded-2xl bg-p">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Aparecer en los rankings</div>
              <div className="text-xs text-mu text-pretty">{isPublic ? 'Los demás ven tu liga y tus puntos.' : 'Tu liga es privada: solo tú la ves. Sigues sumando igual.'}</div>
            </div>
            <Switch checked={isPublic} onChange={togglePublic} label="Aparecer en los rankings" />
          </label>
        </section>

        {/* How XP works */}
        <Card padding={false}>
          <button type="button" onClick={() => setRules(v => !v)} aria-expanded={rules} className="w-full flex items-center justify-between gap-3 p-4 text-left">
            <span className="text-sm font-semibold">Cómo se gana experiencia</span>
            <CaretDown size={16} className={cn('text-mu transition-transform duration-200', rules && 'rotate-180')} aria-hidden />
          </button>
          {rules && (
            <ul className="px-4 pb-4 flex flex-col gap-2 animate-fade-up">
              {XP_RULES.map(r => (
                <li key={r.kind} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-mu text-pretty">{r.label}</span>
                  <span className="font-semibold tabular-nums flex-shrink-0 text-ac">{r.points}</span>
                </li>
              ))}
              <li className="text-xs text-fa text-pretty pt-1">La constancia es lo que más suma: las rachas largas dan los bonus más grandes. Los récords cuentan hasta 3 por día, y lo que registres con más de 7 días de atraso no suma.</li>
            </ul>
          )}
        </Card>

        {/* Recent */}
        {progress.recent.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-mu">Lo último que sumaste</h2>
            <ul className="rounded-[20px] bg-p overflow-hidden">
              {progress.recent.slice(0, 10).map((e, i) => (
                <li key={i} className={cn('flex items-center justify-between gap-3 px-4 py-3 text-sm', i > 0 && 'border-t border-[var(--ln)]')}>
                  <span className="min-w-0 truncate">{KIND_LABEL[e.kind] ?? e.kind}</span>
                  <span className="text-xs text-fa flex-shrink-0">{formatDateOnly(e.day, { day: 'numeric', month: 'short' })}</span>
                  <span className="font-semibold tabular-nums text-ac flex-shrink-0 w-14 text-right">+{e.points}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <SquadSheet mode={sheet} onClose={() => setSheet(null)} onDone={() => { setSheet(null); router.refresh() }} />
    </>
  )
}

function Tile({ icon, tone, value, label }: { icon: React.ReactNode; tone: string; value: number; label: string }) {
  return (
    <Card padding={false} className="p-4 min-w-0">
      <div className={cn('flex items-center gap-1.5', tone)}>{icon}<span className="font-display text-3xl font-bold tabular-nums leading-none tracking-tight">{value.toLocaleString('es-CL')}</span></div>
      <div className="text-xs text-mu mt-1.5 leading-tight">{label}</div>
    </Card>
  )
}

function ChallengeCard({ c, today }: { c: ChallengeInfo; today: string }) {
  const pct = Math.min(100, Math.round((c.progress / c.target) * 100))
  const upcoming = c.starts_on > today, over = c.ends_on < today
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className={cn('size-11 rounded-2xl grid place-items-center flex-shrink-0', c.done ? 'bg-gr/15 text-gr' : 'bg-pu/15 text-pu')}>
          {c.done ? <Check size={22} weight="bold" aria-hidden /> : <Target size={22} weight="duotone" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-pretty">{c.title}</div>
          {c.description && <div className="text-sm text-mu text-pretty">{c.description}</div>}
        </div>
        <span className="text-xs font-bold text-ac flex-shrink-0 tabular-nums">+{c.reward} XP</span>
      </div>
      <div>
        <div className="h-2 rounded-full bg-p3 overflow-hidden"><div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', c.done ? 'bg-gr' : 'bg-pu')} style={{ width: `${pct}%` }} /></div>
        <div className="flex justify-between gap-3 text-xs text-mu mt-1.5">
          <span className="tabular-nums">{(METRIC_LABEL[c.metric] ?? (n => String(n)))(Math.min(c.progress, c.target))} de {c.target}</span>
          <span>{c.done ? 'Completado' : upcoming ? `Empieza el ${formatDateOnly(c.starts_on, { day: 'numeric', month: 'short' })}` : over ? 'Terminó' : `Hasta el ${formatDateOnly(c.ends_on, { day: 'numeric', month: 'short' })}`}</span>
        </div>
      </div>
    </Card>
  )
}

function SquadCard({ squad, me, onChanged }: { squad: SquadInfo; me: string; onChanged: () => void }) {
  const { fire } = useToast()
  const [leaving, setLeaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const missing = squad.size - squad.members.length
  const all = missing === 0 && squad.members.every(m => m.trained_today)

  async function share() {
    const text = `Únete a mi ${squad.size === 2 ? 'dupla' : 'cuarteto'} "${squad.name}" en APEX. Entra a Liga → Tengo un código y escribe: ${squad.code}`
    if (navigator.share) { try { await navigator.share({ text }) } catch { /* cancelled */ } }
    else { try { await navigator.clipboard.writeText(text); fire('Invitación copiada.', 'ok') } catch {} }
  }
  async function leave() {
    setBusy(true)
    const { error } = await createClient().rpc('leave_squad', { p_squad: squad.id })
    setBusy(false); setLeaving(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire('Saliste del equipo.', 'ok'); onChanged()
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{squad.name}</div>
          <div className="text-xs text-mu">{squad.size === 2 ? 'Dupla' : 'Cuarteto'} · mejor racha {squad.best}</div>
        </div>
        <div className="flex items-center gap-1 text-or flex-shrink-0"><Flame size={18} weight="fill" aria-hidden /><span className="font-display text-2xl font-bold tabular-nums leading-none">{squad.streak}</span></div>
      </div>
      <ul className="flex flex-col gap-2">
        {squad.members.map(m => (
          <li key={m.id} className="flex items-center gap-3">
            <Avatar name={m.name} src={m.avatar} size={32} />
            <span className="text-sm min-w-0 flex-1 truncate">{m.id === me ? 'Tú' : m.name}</span>
            <span className={cn('text-xs font-semibold flex items-center gap-1', m.trained_today ? 'text-gr' : 'text-fa')}>
              {m.trained_today ? <><Check size={13} weight="bold" aria-hidden /> Entrenó hoy</> : 'Falta hoy'}
            </span>
          </li>
        ))}
        {Array.from({ length: missing }, (_, i) => (
          <li key={`e${i}`} className="flex items-center gap-3 text-fa">
            <span className="size-8 rounded-full bg-p2 grid place-items-center"><Plus size={14} aria-hidden /></span>
            <span className="text-sm">Lugar libre</span>
          </li>
        ))}
      </ul>
      <p className={cn('text-xs text-pretty', all ? 'text-gr' : 'text-mu')}>
        {missing > 0 ? `Invita a ${missing === 1 ? 'una persona' : `${missing} personas`} más para empezar la racha del equipo.`
          : all ? 'Todos entrenaron hoy: la racha del equipo sigue y cada uno ganó 15 XP.' : 'Cuando todos entrenen hoy, cada uno gana 15 XP extra.'}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={share} className="flex-1 h-10 rounded-full bg-p2 text-sm font-semibold flex items-center justify-center gap-2">
          <Share2 size={15} aria-hidden /> Código <span className="font-display tracking-widest text-ac">{squad.code}</span>
        </button>
        <button type="button" onClick={() => setLeaving(true)} className="h-10 px-4 rounded-full bg-p2 text-sm font-semibold text-mu">Salir</button>
      </div>
      <ConfirmDialog open={leaving} danger busy={busy} title={`¿Salir de ${squad.name}?`} body="El equipo pierde un integrante y su racha se detiene hasta que alguien ocupe tu lugar."
        confirmLabel="Salir del equipo" onConfirm={leave} onClose={() => setLeaving(false)} />
    </Card>
  )
}

function SquadSheet({ mode, onClose, onDone }: { mode: null | 'create' | 'join'; onClose: () => void; onDone: () => void }) {
  const { fire } = useToast()
  const [name, setName] = useState('')
  const [size, setSize] = useState<2 | 4>(2)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const supabase = createClient()
    const { data, error } = mode === 'create'
      ? await supabase.rpc('create_squad', { p_name: name.trim(), p_size: size })
      : await supabase.rpc('join_squad', { p_code: code.trim().toUpperCase() })
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    const res = (data ?? {}) as { ok?: boolean; reason?: string; code?: string }
    if (!res.ok) { fire(SQUAD_REASON[res.reason ?? ''] ?? 'No se pudo. Inténtalo de nuevo.', 'error'); return }
    fire(mode === 'create' ? 'Equipo creado. Comparte el código para que se unan.' : 'Ya estás en el equipo.', 'ok')
    setName(''); setCode(''); onDone()
  }

  return (
    <Modal open={mode !== null} onClose={onClose} title={mode === 'create' ? 'Nuevo equipo' : 'Unirme a un equipo'}
      subtitle={mode === 'create' ? 'Elige con quién vas a entrenar en racha.' : 'Escribe el código que te pasaron.'}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {mode === 'create' ? (
          <>
            <div>
              <label htmlFor="sq-name" className="block text-[13px] text-mu font-medium mb-1.5 px-1">Nombre del equipo</label>
              <input id="sq-name" value={name} onChange={e => setName(e.target.value)} maxLength={40} required className={inputCls} placeholder="Los del turno de las 7" />
            </div>
            <div role="radiogroup" aria-label="Tamaño" className="grid grid-cols-2 gap-2">
              {([2, 4] as const).map(n => (
                <button key={n} type="button" role="radio" aria-checked={size === n} onClick={() => setSize(n)}
                  className={cn('rounded-2xl p-4 text-left', size === n ? 'bg-ac/15 ring-1 ring-inset ring-ac/60' : 'bg-p2')}>
                  <div className="font-display text-xl font-bold tracking-tight">{n === 2 ? 'Dupla' : 'Cuarteto'}</div>
                  <div className="text-xs text-mu">{n} personas</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div>
            <label htmlFor="sq-code" className="block text-[13px] text-mu font-medium mb-1.5 px-1">Código del equipo</label>
            <input id="sq-code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={8} required autoCapitalize="characters" autoComplete="off"
              className={cn(inputCls, 'font-display tracking-widest text-center text-lg')} placeholder="ABCD1234" />
          </div>
        )}
        <button type="submit" disabled={busy} className="h-12 rounded-full bg-ac text-onac font-bold disabled:opacity-50">
          {busy ? 'Un momento…' : mode === 'create' ? 'Crear equipo' : 'Unirme'}
        </button>
      </form>
    </Modal>
  )
}
