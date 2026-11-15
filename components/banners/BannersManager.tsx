'use client'
// Create and edit home banners, with a live preview. Used by a box administrator (boxId set)
// and by the application administrator (boxId null: the banner shows in every box).
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field, inputBase, labelCls } from '@/components/ui/Field'
import { Modal, ModalActions } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Switch } from '@/components/ui/Switch'
import { Segmented } from '@/components/ui/motion'
import { useToast } from '@/components/ui/Toast'
import { BannerCard } from '@/components/home/BannerStrip'
import { Plus, PencilSimple, Trash, ArrowUp, ArrowDown, ImageSquare, RectangleDashed } from '@/components/ui/icons'
import { createClient } from '@/lib/supabase/client'
import { uploadPublicImage } from '@/lib/utils/upload-image'
import { BANNER_ICONS, BANNER_LINKS, BANNER_TONES, isBannerLive, safeHref, type Banner, type BannerIcon, type BannerTone } from '@/lib/utils/banners'
import { formatDateOnly } from '@/lib/utils/dates'
import { friendlyError } from '@/lib/utils/errors'
import { cn } from '@/lib/utils/cn'

const selectCls = 'w-full h-12 px-4 rounded-xl bg-p2 text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 appearance-none'

export function BannersManager({ boxId, me, today, banners, missing }: { boxId: string | null; me: string; today: string; banners: Banner[]; missing: boolean }) {
  const router = useRouter()
  const { fire } = useToast()
  const [editing, setEditing] = useState<Banner | 'new' | null>(null)
  const [removing, setRemoving] = useState<Banner | null>(null)
  const [busy, setBusy] = useState(false)
  const sorted = [...banners].sort((a, b) => a.position - b.position || (a.created_at < b.created_at ? 1 : -1))

  async function run(p: PromiseLike<{ error: any }>, ok?: string) {
    setBusy(true)
    const { error } = await p
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return false }
    if (ok) fire(ok, 'ok')
    router.refresh()
    return true
  }
  // Swap places with the neighbour, then store 0..n-1 so positions never tie.
  async function move(i: number, dir: -1 | 1) {
    if (!sorted[i] || !sorted[i + dir]) return
    const order = [...sorted]
    ;[order[i], order[i + dir]] = [order[i + dir], order[i]]
    const supabase = createClient()
    setBusy(true)
    const results = await Promise.all(order.map((x, k) => (x.position !== k ? supabase.from('banners').update({ position: k }).eq('id', x.id) : Promise.resolve({ error: null }))))
    setBusy(false)
    const failed = results.find(r => r.error)
    if (failed?.error) fire(friendlyError(failed.error.message), 'error'); else router.refresh()
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-mu text-pretty">
          {boxId ? 'Aparecen arriba del inicio de tus atletas y coaches. Al tocarlos abren lo que elijas.' : 'Aparecen arriba del inicio de todas las personas, en todos los boxes.'}
        </p>
        <button type="button" disabled={missing} onClick={() => setEditing('new')}
          className="flex-shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-ac text-onac text-sm font-bold disabled:opacity-40"><Plus size={16} weight="bold" aria-hidden /> Nuevo</button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-[20px] bg-p p-8 text-center flex flex-col items-center gap-3">
          <div className="size-14 rounded-2xl bg-ac/15 text-ac grid place-items-center animate-pop"><RectangleDashed size={26} aria-hidden /></div>
          <h2 className="font-display text-xl font-bold tracking-tight">Aún no hay banners</h2>
          <p className="text-sm text-mu max-w-xs text-pretty">Úsalos para lo que quieres que vean primero: una promoción, un evento, la tienda del box, un reto nuevo.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {sorted.map((b, i) => {
            const live = isBannerLive(b, today)
            const ctr = b.views ? Math.round((b.clicks / b.views) * 100) : 0
            return (
              <li key={b.id} className="rounded-[22px] bg-p p-3 flex flex-col gap-3">
                <div className={cn(!live && 'opacity-50')}><BannerCard b={b} preview /></div>
                <div className="flex items-center gap-2 flex-wrap px-1">
                  <span className={cn('text-xs font-semibold', live ? 'text-gr' : 'text-mu')}>
                    {!b.is_active ? 'Apagado' : b.starts_on > today ? `Empieza el ${formatDateOnly(b.starts_on, { day: 'numeric', month: 'short' })}` : b.ends_on && b.ends_on < today ? 'Terminó' : 'Visible'}
                  </span>
                  <span className="text-xs text-mu">· {b.audience === 'all' ? 'Todos' : b.audience === 'athletes' ? 'Atletas' : 'Coaches'}{b.ends_on ? ` · hasta ${formatDateOnly(b.ends_on, { day: 'numeric', month: 'short' })}` : ''}</span>
                  <span className="text-xs text-mu tabular-nums ml-auto">{b.views} vistas · {b.clicks} toques{b.views ? ` · ${ctr}%` : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium mr-auto pl-1">
                    <Switch checked={b.is_active} disabled={busy} label={`Mostrar ${b.title}`} onChange={on => run(createClient().from('banners').update({ is_active: on }).eq('id', b.id))} /> Mostrar
                  </label>
                  <button type="button" aria-label="Subir" disabled={busy || i === 0} onClick={() => move(i, -1)} className="size-10 rounded-full bg-p2 grid place-items-center disabled:opacity-30"><ArrowUp size={16} /></button>
                  <button type="button" aria-label="Bajar" disabled={busy || i === sorted.length - 1} onClick={() => move(i, 1)} className="size-10 rounded-full bg-p2 grid place-items-center disabled:opacity-30"><ArrowDown size={16} /></button>
                  <button type="button" aria-label={`Editar ${b.title}`} onClick={() => setEditing(b)} className="size-10 rounded-full bg-p2 grid place-items-center"><PencilSimple size={16} /></button>
                  <button type="button" aria-label={`Eliminar ${b.title}`} onClick={() => setRemoving(b)} className="size-10 rounded-full bg-rd/15 text-rd grid place-items-center"><Trash size={16} /></button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editing && <BannerSheet key={editing === 'new' ? 'new' : editing.id} boxId={boxId} me={me} today={today} banner={editing === 'new' ? null : editing} nextPosition={sorted.reduce((m, b) => Math.max(m, b.position), -1) + 1} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} busy={busy} danger title="¿Eliminar este banner?" body="Deja de verse y se pierden sus vistas y toques." confirmLabel="Eliminar"
        onConfirm={async () => { if (removing && await run(createClient().from('banners').delete().eq('id', removing.id), 'Banner eliminado')) setRemoving(null) }} />
    </>
  )
}

function BannerSheet({ boxId, me, today, banner, nextPosition, onClose }: { boxId: string | null; me: string; today: string; banner: Banner | null; nextPosition: number; onClose: () => void }) {
  const router = useRouter()
  const { fire } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(banner?.title ?? '')
  const [body, setBody] = useState(banner?.body ?? '')
  const [cta, setCta] = useState(banner?.cta_label ?? '')
  const [tone, setTone] = useState<BannerTone>(banner?.tone ?? 'accent')
  const [icon, setIcon] = useState<string>(banner?.icon ?? 'megaphone')
  const [image, setImage] = useState(banner?.image_url ?? '')
  const preset = BANNER_LINKS.some(l => l.href === banner?.href)
  const [linkKind, setLinkKind] = useState<'none' | 'screen' | 'web'>(!banner?.href ? 'none' : preset ? 'screen' : banner.href.startsWith('/') ? 'screen' : 'web')
  const [screen, setScreen] = useState(banner?.href?.startsWith('/') ? banner.href : BANNER_LINKS[0].href)
  const [web, setWeb] = useState(banner?.href?.startsWith('https://') ? banner.href : '')
  const [audience, setAudience] = useState<Banner['audience']>(banner?.audience ?? 'all')
  const [startsOn, setStartsOn] = useState(banner?.starts_on ?? today)
  const [endsOn, setEndsOn] = useState(banner?.ends_on ?? '')
  const [dismissible, setDismissible] = useState(banner?.dismissible ?? true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  const href = linkKind === 'none' ? null : linkKind === 'screen' ? screen : web.trim()
  const badWeb = linkKind === 'web' && !!web.trim() && !safeHref(web)

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !boxId) return
    setUploading(true)
    try { setImage(await uploadPublicImage(createClient(), 'movement-media', boxId, file)) }
    catch (err) { fire((err as Error).message, 'error') }
    setUploading(false)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (badWeb) return
    setBusy(true)
    const row = {
      title: title.trim(), body: body.trim() || null, cta_label: cta.trim() || null, href: safeHref(href), tone, icon, image_url: image || null,
      audience, starts_on: startsOn, ends_on: endsOn || null, dismissible,
    }
    const supabase = createClient()
    const { error } = banner
      ? await supabase.from('banners').update(row).eq('id', banner.id)
      : await supabase.from('banners').insert({ ...row, box_id: boxId, created_by: me, position: nextPosition, is_active: true })
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire(banner ? 'Banner actualizado' : 'Banner publicado', 'ok'); onClose(); router.refresh()
  }

  return (
    <Modal open onClose={onClose} title={banner ? 'Editar banner' : 'Nuevo banner'}>
      <form onSubmit={save} className="flex flex-col gap-4">
        {/* Live preview: exactly what people will see */}
        <div className="sticky top-0 z-10 -mx-1 px-1 pb-1 bg-inherit">
          <BannerCard preview b={{ title, body: body || null, cta_label: cta || null, href: safeHref(href), tone, icon, image_url: image || null, dismissible }} />
        </div>

        <Field label="Título" required maxLength={60} value={title} onChange={e => setTitle(e.target.value)} placeholder="Reto de noviembre: 500 burpees" />
        <div>
          <label className={labelCls} htmlFor="b-body">Texto (opcional)</label>
          <textarea id="b-body" rows={2} maxLength={140} value={body} onChange={e => setBody(e.target.value)} placeholder="Una línea que dé ganas de tocarlo." className={cn(inputBase, 'py-3 resize-none')} />
        </div>

        <div>
          <span className={labelCls}>Color</span>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(BANNER_TONES) as BannerTone[]).map(t => (
              <button key={t} type="button" onClick={() => setTone(t)} aria-pressed={tone === t} aria-label={BANNER_TONES[t].label} title={BANNER_TONES[t].label}
                className={cn('size-11 rounded-full grid place-items-center ring-2 ring-offset-2 ring-offset-p transition-shadow', tone === t ? 'ring-t' : 'ring-transparent')}>
                <span className={cn('size-9 rounded-full', BANNER_TONES[t].swatch)} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={labelCls}>Ícono</span>
          <div className="grid grid-cols-8 gap-1.5">
            {(Object.keys(BANNER_ICONS) as BannerIcon[]).map(k => {
              const I = BANNER_ICONS[k]
              return (
                <button key={k} type="button" onClick={() => setIcon(k)} aria-pressed={icon === k} aria-label={`Ícono ${k}`}
                  className={cn('aspect-square rounded-xl grid place-items-center transition-colors', icon === k ? 'bg-ac text-onac' : 'bg-p2 text-mu')}><I size={20} weight={icon === k ? 'fill' : 'regular'} /></button>
              )
            })}
          </div>
        </div>

        {boxId && (
          <div>
            <span className={labelCls}>Foto de fondo (opcional)</span>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickImage} />
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}><ImageSquare size={16} /> {uploading ? 'Subiendo…' : image ? 'Cambiar foto' : 'Elegir foto'}</Button>
              {image && <Button variant="ghost" size="sm" onClick={() => setImage('')}>Quitar</Button>}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div>
            <span className={labelCls}>Al tocarlo</span>
            <Segmented id="b-link" value={linkKind} onChange={setLinkKind} options={[['screen', 'Abre una pantalla'], ['web', 'Abre un enlace'], ['none', 'Nada']]} />
          </div>
          {linkKind === 'screen' && (
            <select aria-label="Pantalla" className={selectCls} value={screen} onChange={e => setScreen(e.target.value)}>
              {BANNER_LINKS.map(l => <option key={l.href} value={l.href}>{l.label}</option>)}
              {!BANNER_LINKS.some(l => l.href === screen) && <option value={screen}>{screen}</option>}
            </select>
          )}
          {linkKind === 'web' && (
            <Field label="Dirección" type="url" inputMode="url" value={web} onChange={e => setWeb(e.target.value)} placeholder="https://…"
              hint={badWeb ? <span className="text-rd">Debe empezar con https://</span> : 'Se abre en otra pestaña: tienda, formulario, Instagram…'} />
          )}
          {linkKind !== 'none' && <Field label="Texto del botón" maxLength={24} value={cta} onChange={e => setCta(e.target.value)} placeholder="Ver" />}
        </div>

        <div>
          <span className={labelCls}>Quién lo ve</span>
          <Segmented id="b-aud" value={audience} onChange={setAudience} options={[['all', 'Todos'], ['athletes', 'Atletas'], ['coaches', 'Coaches']]} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde" type="date" required value={startsOn} onChange={e => setStartsOn(e.target.value)} />
          <Field label="Hasta (opcional)" type="date" min={startsOn} value={endsOn} onChange={e => setEndsOn(e.target.value)} />
        </div>
        <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-p2">
          <span className="text-sm"><span className="font-semibold block">Se puede cerrar</span><span className="text-mu text-xs">Cada persona puede ocultarlo con la X.</span></span>
          <Switch checked={dismissible} onChange={setDismissible} label="Se puede cerrar" />
        </label>
        <ModalActions secondary="Cancelar" primary={banner ? 'Guardar' : 'Publicar'} onSecondary={onClose} primaryType="submit" busy={busy} disabled={!title.trim() || badWeb} />
      </form>
    </Modal>
  )
}
