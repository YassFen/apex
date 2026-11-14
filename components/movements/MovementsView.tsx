'use client'
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import {
  MagnifyingGlass, ArrowRight, Barbell, PersonSimpleRun, Lightning, Timer, Trophy, YoutubeLogo, Plus, Check, X, Camera,
} from '@/components/ui/icons'
import { Topbar } from '@/components/layout/Topbar'
import { Modal, ModalActions } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { friendlyError, isMissingColumn } from '@/lib/utils/errors'
import { MUSCLE_LABEL, guideFor, youtubeEmbed, youtubeSearch, youtubeThumb, type MuscleGroup } from '@/lib/utils/movement-guide'
import { cn } from '@/lib/utils/cn'
import { uploadPublicImage } from '@/lib/utils/upload-image'
import type { Movement, MovementCategory, Profile } from '@/lib/types/database'

const CATS: { key: MovementCategory | 'all' | 'box'; label: string }[] = [
  { key: 'all', label: 'Todos' }, { key: 'box', label: 'De mi box' }, { key: 'weightlifting', label: 'Fuerza' },
  { key: 'olympic', label: 'Olímpicos' }, { key: 'gymnastics', label: 'Gimnásticos' }, { key: 'cardio', label: 'Motor' },
]
const CAT_LABEL: Record<string, string> = { weightlifting: 'Fuerza', olympic: 'Olímpico', gymnastics: 'Gimnástico', cardio: 'Motor', benchmark: 'Benchmark' }
const CAT_ART: Record<string, { Icon: typeof Barbell; tone: string }> = {
  weightlifting: { Icon: Barbell,         tone: 'from-or/40 to-or/5 text-or' },
  olympic:       { Icon: Lightning,       tone: 'from-ac/40 to-ac/5 text-ac' },
  gymnastics:    { Icon: PersonSimpleRun, tone: 'from-pu/40 to-pu/5 text-pu' },
  cardio:        { Icon: Timer,           tone: 'from-bl/40 to-bl/5 text-bl' },
  benchmark:     { Icon: Trophy,          tone: 'from-rd/40 to-rd/5 text-rd' },
}

function Thumb({ m, className }: { m: Movement; className?: string }) {
  const img = m.image_url || youtubeThumb(m.video_url)
  const art = CAT_ART[m.category] ?? CAT_ART.weightlifting
  if (img) return <img src={img} alt="" className={cn('object-cover bg-p2', className)} loading="lazy" />
  return (
    <span className={cn('grid place-items-center bg-gradient-to-br', art.tone, className)} aria-hidden>
      <art.Icon size={34} weight="duotone" />
    </span>
  )
}

/** Exercise library: every movement with how it's done, muscles, video and your records. Coaches add their own. */
export function MovementsView({ profile, movements, records, coachBoxes }: {
  profile: Profile; movements: Movement[]; records: Record<string, { metric: string; valueLb: number }[]>
  coachBoxes: { id: string; name: string }[]
}) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<(typeof CATS)[number]['key']>('all')
  const [open, setOpen] = useState<Movement | null>(null)
  const [creating, setCreating] = useState(false)

  const list = useMemo(() => {
    const query = q.trim().toLowerCase()
    return movements
      .filter(m => cat === 'all' || (cat === 'box' ? !!m.box_id : m.category === cat))
      .filter(m => !query || m.name.toLowerCase().includes(query))
  }, [movements, q, cat])
  const boxOnes = movements.filter(m => m.box_id)

  return (
    <>
      <Topbar title="Ejercicios" profile={profile} />
      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-3xl w-full mx-auto pb-28">
        <label className="relative block">
          <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-fa" aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar ejercicio" aria-label="Buscar ejercicio"
            className="w-full h-12 pl-11 pr-4 rounded-2xl bg-p text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 placeholder:text-fa" />
        </label>

        <div className="-mx-4 px-4 flex gap-1.5 overflow-x-auto scrollbar-none border-b border-[var(--ln)]">
          {CATS.filter(c => c.key !== 'box' || boxOnes.length > 0).map(c => (
            <button key={c.key} type="button" onClick={() => setCat(c.key)}
              className={cn('relative flex-shrink-0 h-11 px-3 text-sm font-semibold transition-colors', cat === c.key ? 'text-t' : 'text-mu hover:text-t')}>
              {c.label}
              {cat === c.key && <motion.span layoutId="mov-tab" className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-t" />}
            </button>
          ))}
        </div>

        <div className="text-xs text-mu font-semibold px-1">{list.length} ejercicios</div>
        <ul className="flex flex-col gap-2.5 stagger">
          {list.map(m => {
            const g = guideFor(m.name, m.category)
            return (
              <li key={m.id}>
                <button type="button" onClick={() => setOpen(m)}
                  className="tap-card w-full flex items-stretch rounded-[20px] bg-p overflow-hidden text-left">
                  <span className="flex-1 min-w-0 p-4">
                    <span className="block font-display text-xl font-bold tracking-tight truncate">{m.name}</span>
                    <span className="block text-mu text-sm leading-snug mt-0.5">
                      {CAT_LABEL[m.category] ?? m.category}{g.muscles.filter(x => !(x === 'motor' && m.category === 'cardio')).length ? ` · ${g.muscles.filter(x => !(x === 'motor' && m.category === 'cardio')).map(x => MUSCLE_LABEL[x]).join(', ')}` : ''}
                    </span>
                    <span className="mt-3 block h-1 w-24 rounded-full bg-t/10 overflow-hidden">
                      <span className="block h-full bg-ac rounded-full" style={{ width: records[m.name]?.length ? '100%' : '0%' }} />
                    </span>
                    {m.box_id && <span className="inline-block mt-2 text-[11px] font-semibold text-ac">Del box</span>}
                  </span>
                  <Thumb m={m} className="w-28 sm:w-36 flex-shrink-0" />
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {coachBoxes.length > 0 && (
        <div className="fixed bottom-[calc(92px+env(safe-area-inset-bottom))] lg:bottom-8 inset-x-0 lg:left-[240px] flex justify-center z-30 pointer-events-none">
          <motion.button type="button" onClick={() => setCreating(true)} whileTap={{ scale: 0.95 }}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 28, delay: 0.3 }}
            className="pointer-events-auto h-12 pl-5 pr-4 rounded-full bg-t text-bg font-semibold flex items-center gap-2 shadow-e2">
            Crear ejercicio <ArrowRight size={18} weight="bold" />
          </motion.button>
        </div>
      )}

      <MovementDetail movement={open} onClose={() => setOpen(null)} records={open ? records[open.name] ?? [] : []} unit={profile.preferred_unit}
        canEditPhoto={!!open?.box_id && coachBoxes.some(b => b.id === open.box_id)} />
      <CreateMovement open={creating} onClose={() => setCreating(false)} boxes={coachBoxes} userId={profile.id} />
    </>
  )
}

export function MovementDetail({ movement: m, onClose, records, unit, canEditPhoto = false }: {
  movement: Movement | null; onClose: () => void; records: { metric: string; valueLb: number }[]; unit: 'kg' | 'lb'; canEditPhoto?: boolean
}) {
  const router = useRouter()
  const { fire } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  if (!m) return <Modal open={false} onClose={onClose}>{null}</Modal>

  async function changePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !m?.box_id) return
    setUploading(true)
    try {
      const supabase = createClient()
      const url = await uploadPublicImage(supabase, 'movement-media', m.box_id, file)
      const { error } = await supabase.from('movements').update({ image_url: url }).eq('id', m.id)
      if (error) throw new Error(friendlyError(error.message))
      fire('Foto actualizada', 'ok'); onClose(); router.refresh()
    } catch (err) { fire((err as Error).message, 'error') }
    setUploading(false)
  }
  const g = guideFor(m.name, m.category)
  const cues = (m.cues?.split('\n').map(s => s.trim()).filter(Boolean)) ?? []
  const allCues = cues.length ? cues : g.cues
  const muscles = (m.muscles?.length ? m.muscles : g.muscles) as MuscleGroup[]
  const embed = youtubeEmbed(m.video_url)
  const fmt = (r: { metric: string; valueLb: number }) => r.metric === 'max_reps' ? `${Math.round(r.valueLb)} reps`
    : r.metric === 'time' ? `${Math.floor(r.valueLb / 60)}:${String(Math.round(r.valueLb % 60)).padStart(2, '0')}`
    : unit === 'kg' ? `${Math.round(r.valueLb * 0.453592)} kg` : `${Math.round(r.valueLb)} lb`

  return (
    <Modal open onClose={onClose} eyebrow={CAT_LABEL[m.category] ?? 'Ejercicio'} title={m.name}>
      <div className="flex flex-col gap-5">
        {embed ? (
          <div className="aspect-video rounded-[20px] overflow-hidden bg-p2">
            <iframe src={embed} title={`Video de ${m.name}`} className="w-full h-full" allow="encrypted-media; picture-in-picture" allowFullScreen />
          </div>
        ) : (
          <div className="relative">
            <Thumb m={m} className="w-full h-44 rounded-[20px]" />
            {canEditPhoto && (
              <>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="absolute bottom-3 right-3 h-10 px-4 rounded-full bg-t text-bg text-sm font-semibold flex items-center gap-2 shadow-e2 disabled:opacity-60">
                  <Camera size={18} weight="fill" />{uploading ? 'Subiendo…' : 'Cambiar foto'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={changePhoto} className="hidden" />
              </>
            )}
          </div>
        )}
        {(m.description || g.desc) && <p className="text-[15px] text-pretty">{m.description || g.desc}</p>}
        {muscles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {muscles.map(x => <span key={x} className="h-8 px-3 rounded-full bg-p2 text-sm font-medium grid place-items-center">{MUSCLE_LABEL[x] ?? x}</span>)}
          </div>
        )}
        {allCues.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2">Cómo hacerlo</h3>
            <ol className="flex flex-col gap-2">
              {allCues.map((c, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}
                  className="flex gap-3 items-start">
                  <span className="size-6 rounded-full bg-ac text-onac text-xs font-bold grid place-items-center flex-shrink-0 mt-px">{i + 1}</span>
                  <span className="text-[15px]">{c}</span>
                </motion.li>
              ))}
            </ol>
          </div>
        )}
        {records.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2">Tus récords</h3>
            <div className="flex flex-wrap gap-2">
              {records.map((r, i) => (
                <span key={i} className="px-3 py-2 rounded-2xl bg-ac/15 text-sm">
                  <span className="text-mu uppercase text-[11px] font-semibold mr-1.5">{r.metric.replace('_', ' ')}</span>
                  <span className="font-display font-bold">{fmt(r)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        <a href={m.video_url || youtubeSearch(m.name)} target="_blank" rel="noopener noreferrer"
          className="h-12 rounded-full ring-1 ring-inset ring-t/25 font-semibold flex items-center justify-center gap-2 hover:bg-p2">
          <YoutubeLogo size={20} weight="fill" className="text-rd" /> {m.video_url ? 'Ver video' : 'Buscar video de la técnica'}
        </a>
      </div>
    </Modal>
  )
}

const MUSCLES = Object.keys(MUSCLE_LABEL) as MuscleGroup[]

function CreateMovement({ open, onClose, boxes, userId }: { open: boolean; onClose: () => void; boxes: { id: string; name: string }[]; userId: string }) {
  const router = useRouter()
  const { fire } = useToast()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<MovementCategory>('weightlifting')
  const [description, setDescription] = useState('')
  const [cues, setCues] = useState('')
  const [muscles, setMuscles] = useState<MuscleGroup[]>([])
  const [video, setVideo] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const supabase = createClient()
    let imageUrl: string | null = null
    if (photo) {
      try { imageUrl = await uploadPublicImage(supabase, 'movement-media', boxes[0].id, photo) }
      catch (err) { setBusy(false); fire((err as Error).message, 'error'); return }
    }
    const { error } = await supabase.from('movements').insert({
      name: name.trim(), category, description: description.trim() || null, cues: cues.trim() || null,
      muscles: muscles.length ? muscles : null, video_url: video.trim() || null, image_url: imageUrl,
      box_id: boxes[0].id, created_by: userId,
    })
    setBusy(false)
    if (error) {
      fire(isMissingColumn(error) ? 'Falta aplicar la migración 007 en Supabase.'
        : /duplicate|unique/i.test(error.message) ? 'Ya existe un ejercicio con ese nombre.' : friendlyError(error.message), 'error')
      return
    }
    fire('Ejercicio creado. Tus atletas ya lo ven.', 'pr')
    setName(''); setDescription(''); setCues(''); setMuscles([]); setVideo(''); setPhoto(null)
    onClose(); router.refresh()
  }

  const input = 'w-full h-12 px-4 rounded-2xl bg-p2 text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 placeholder:text-fa'
  return (
    <Modal open={open} onClose={onClose} eyebrow={boxes[0]?.name} title={<>Nuevo <span className="text-ac">ejercicio</span></>}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre (ej: Devil Press)" aria-label="Nombre" required className={input} />
        <div className="flex flex-wrap gap-1.5">
          {(['weightlifting', 'olympic', 'gymnastics', 'cardio'] as MovementCategory[]).map(c => (
            <button key={c} type="button" onClick={() => setCategory(c)}
              className={cn('h-9 px-3.5 rounded-full text-sm font-medium', category === c ? 'bg-t text-bg' : 'bg-p2 text-mu')}>{CAT_LABEL[c]}</button>
          ))}
        </div>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Qué es, en una frase" aria-label="Descripción"
          className="w-full px-4 py-3 rounded-2xl bg-p2 text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 placeholder:text-fa resize-none" />
        <textarea value={cues} onChange={e => setCues(e.target.value)} rows={4} placeholder={'Cómo hacerlo, un paso por línea\nEj: Pecho al suelo\nSalta con las mancuernas sobre la cabeza'} aria-label="Pasos"
          className="w-full px-4 py-3 rounded-2xl bg-p2 text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 placeholder:text-fa resize-none" />
        <div>
          <div className="text-[13px] text-mu font-medium mb-1.5 px-1">Músculos</div>
          <div className="flex flex-wrap gap-1.5">
            {MUSCLES.map(x => {
              const on = muscles.includes(x)
              return (
                <button key={x} type="button" onClick={() => setMuscles(ms => on ? ms.filter(y => y !== x) : [...ms, x])}
                  className={cn('h-9 px-3.5 rounded-full text-sm font-medium flex items-center gap-1', on ? 'bg-ac text-onac' : 'bg-p2 text-mu')}>
                  {on ? <Check size={13} weight="bold" /> : <Plus size={13} />}{MUSCLE_LABEL[x]}
                </button>
              )
            })}
          </div>
        </div>
        <input value={video} onChange={e => setVideo(e.target.value)} type="url" placeholder="Link de YouTube (opcional)" aria-label="Video" className={input} />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="relative h-40 rounded-[20px] bg-p2 border-2 border-dashed border-[var(--ln2)] overflow-hidden grid place-items-center text-mu hover:text-t transition-colors">
          {preview
            ? <img src={preview} alt="Foto elegida" className="absolute inset-0 w-full h-full object-cover" />
            : <span className="flex flex-col items-center gap-2 text-sm font-medium"><Camera size={28} weight="duotone" />Tomar o elegir una foto (opcional)</span>}
          {preview && <span className="absolute bottom-2 right-2 h-8 px-3 rounded-full bg-t text-bg text-xs font-semibold grid place-items-center">Cambiar</span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] ?? null)} className="hidden" />
        <ModalActions secondary="Cancelar" primary="Crear" onSecondary={onClose} primaryType="submit" busy={busy} disabled={!name.trim()} />
      </form>
      <button type="button" onClick={onClose} className="sr-only"><X /></button>
    </Modal>
  )
}
