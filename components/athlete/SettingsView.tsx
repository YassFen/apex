'use client'
import { useState, useRef } from 'react'
import { roleLabel } from '@/lib/utils/cn'
import { useRouter } from 'next/navigation'
import { SECTION_TITLE, type SettingsSection } from '@/lib/constants/settings'
import { Upload, Globe, Lock, Building2, LogOut, Copy, Check, Trophy } from '@/components/ui/icons'
import { Segmented } from '@/components/ui/motion'
import { Switch } from '@/components/ui/Switch'
import { NotificationSettings } from '@/components/settings/NotificationSettings'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { AthleteRadar } from '@/components/athlete/AthleteRadar'
import { AppearancePicker } from '@/components/ui/AppearancePicker'
import { PasswordField, Alert } from '@/components/ui/Field'
import { friendlyError, isMissingColumn } from '@/lib/utils/errors'
import { joinBoxByCode } from '@/lib/utils/join-box'
import type { Profile, Movement, Box } from '@/lib/types/database'

interface Props {
  section: SettingsSection
  profile: Profile
  memberships: any[]
  movements: Movement[]
  ownedBox: Box | null
  prs?: any[]
}

export function SettingsView({ section, profile, memberships, movements, ownedBox, prs = [] }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef   = useRef<HTMLInputElement>(null)

  const [name, setName]   = useState(profile.full_name)
  const [city, setCity]   = useState(profile.city ?? '')
  const [bio, setBio]     = useState(profile.bio ?? '')
  const [unit, setUnit]   = useState<'kg' | 'lb'>(profile.preferred_unit)
  const [sex, setSex]     = useState<'' | 'm' | 'f'>(profile.sex ?? '')
  const [favMov, setFavMov] = useState(profile.favorite_movement ?? '')
  const [profilePublic, setProfilePublic]   = useState(profile.profile_public ?? false)
  const [showPrsPublic, setShowPrsPublic]   = useState(profile.show_prs_public ?? false)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [profileErr, setProfileErr] = useState('')

  const [boxName, setBoxName]         = useState(ownedBox?.name ?? '')
  const [boxCity, setBoxCity]         = useState(ownedBox?.city ?? '')
  const [boxCountry, setBoxCountry]   = useState(ownedBox?.country ?? '')
  const [boxDesc, setBoxDesc]         = useState(ownedBox?.description ?? '')
  const [boxWebsite, setBoxWebsite]   = useState(ownedBox?.website_url ?? '')
  const [boxInstagram, setBoxInstagram] = useState(ownedBox?.instagram ?? '')
  const [boxWhatsapp, setBoxWhatsapp] = useState(ownedBox?.whatsapp ?? '')
  const [boxSchedule, setBoxSchedule] = useState(ownedBox?.schedule ?? '')
  const [boxDisciplines, setBoxDisciplines] = useState<string[]>(ownedBox?.disciplines ?? [])
  const [boxLogoUrl, setBoxLogoUrl]   = useState(ownedBox?.logo_url ?? '')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [boxSaving, setBoxSaving]     = useState(false)
  const [boxSaved, setBoxSaved]       = useState(false)
  const [boxErr, setBoxErr]           = useState('')
  const [codeCopied, setCodeCopied]   = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [pwSaving, setPwSaving]       = useState(false)
  const [pwMsg, setPwMsg]             = useState('')
  const [pwErr, setPwErr]             = useState('')

  const DISCIPLINES = ['CrossFit', 'Weightlifting', 'Gymnastics', 'Endurance', 'HIIT', 'Yoga', 'Functional Fitness']

  function toggleDiscipline(d: string) {
    setBoxDisciplines(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    )
  }

  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining]       = useState(false)
  const [joinMsg, setJoinMsg]       = useState('')
  const [joinErr, setJoinErr]       = useState('')

  const [signingOut, setSigningOut] = useState(false)

  const boxes = memberships.map(m => m.boxes).filter(Boolean)
  const publicProfileUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/athlete/${profile.id}`
    : `/athlete/${profile.id}`

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { setProfileErr('La imagen debe pesar menos de 3MB'); return }
    setUploadingAvatar(true); setProfileErr('')

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('avatars').upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) { setUploadingAvatar(false); setProfileErr(upErr.message.includes("Bucket not found") ? "El almacenamiento de fotos no está activado. Falta aplicar la migración 004." : friendlyError(upErr.message)); return }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const newUrl = pub.publicUrl
    const { error: updErr } = await supabase
      .from('profiles').update({ avatar_url: newUrl }).eq('id', profile.id)

    setUploadingAvatar(false)
    if (updErr) { setProfileErr(friendlyError(updErr.message)); return }
    setAvatarUrl(newUrl)
    router.refresh()
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !ownedBox) return
    if (file.size > 3 * 1024 * 1024) { setBoxErr('La imagen debe pesar menos de 3MB'); return }
    setUploadingLogo(true); setBoxErr('')

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${ownedBox.id}/logo-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('box-logos').upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) { setUploadingLogo(false); setBoxErr(upErr.message.includes("Bucket not found") ? "El almacenamiento de logos no está activado. Falta aplicar la migración 004." : friendlyError(upErr.message)); return }

    const { data: pub } = supabase.storage.from('box-logos').getPublicUrl(path)
    const newUrl = pub.publicUrl
    const { error: updErr } = await supabase
      .from('boxes').update({ logo_url: newUrl }).eq('id', ownedBox.id)

    setUploadingLogo(false)
    if (updErr) { setBoxErr(friendlyError(updErr.message)); return }
    setBoxLogoUrl(newUrl)
    router.refresh()
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setProfileErr(''); setSavedOk(false)
    const base = {
      full_name: name.trim(),
      city: city.trim() || null,
      bio: bio.trim() || null,
      preferred_unit: unit,
      favorite_movement: favMov.trim() || null,
      profile_public: profilePublic,
      show_prs_public: showPrsPublic,
    }
    let { error } = await supabase.from('profiles').update({ ...base, sex: sex || null }).eq('id', profile.id)
    // Before migration 007 there's no sex column.
    if (error && isMissingColumn(error)) ({ error } = await supabase.from('profiles').update(base).eq('id', profile.id))
    setSaving(false)
    if (error) { setProfileErr(friendlyError(error.message)); return }
    setSavedOk(true)
    setTimeout(() => setSavedOk(false), 3000)
    router.refresh()
  }

  async function handleSaveBox(e: React.FormEvent) {
    e.preventDefault()
    if (!ownedBox) return
    setBoxSaving(true); setBoxErr(''); setBoxSaved(false)
    const { error } = await supabase
      .from('boxes')
      .update({
        name:        boxName.trim(),
        city:        boxCity.trim(),
        country:     boxCountry.trim(),
        description: boxDesc.trim() || null,
        website_url: boxWebsite.trim() || null,
        instagram:   boxInstagram.trim().replace('@', '') || null,
        whatsapp:    boxWhatsapp.trim() || null,
        schedule:    boxSchedule.trim() || null,
        disciplines: boxDisciplines.length > 0 ? boxDisciplines : null,
      })
      .eq('id', ownedBox.id)
    setBoxSaving(false)
    if (error) { setBoxErr(friendlyError(error.message)); return }
    setBoxSaved(true)
    setTimeout(() => setBoxSaved(false), 3000)
    router.refresh()
  }

  async function handleJoinBox(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteCode.trim()) return
    setJoining(true); setJoinErr(''); setJoinMsg('')
    const res = await joinBoxByCode(supabase, inviteCode, profile.id)
    setJoining(false)
    if (!res.ok) {
      setJoinErr(
        res.reason === 'invalid_code' ? 'Código de invitación inválido. Revisa que esté escrito correctamente.'
        : res.reason === 'already_member' ? `Ya eres miembro de ${res.boxName}.`
        : friendlyError(res.message)
      )
      return
    }
    setJoinMsg(`Te uniste a ${res.boxName}.`)
    setInviteCode('')
    setTimeout(() => router.refresh(), 1200)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg(''); setPwErr('')
    if (newPassword.length < 8) { setPwErr('Usa al menos 8 caracteres.'); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwSaving(false)
    if (error) { setPwErr(friendlyError(error.message)); return }
    setNewPassword('')
    setPwMsg('Contraseña actualizada.')
  }

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 1800)
    })
  }

  const initials = profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  const show = (s: SettingsSection) => section === s
  const saveBtn = (
    <Button type="submit" disabled={saving} className="self-start px-6">
      {saving ? 'Guardando…' : savedOk ? 'Guardado' : 'Guardar cambios'}
    </Button>
  )
  const inputCls = 'w-full px-4 h-12 rounded-2xl bg-p2 text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 transition'
  const labelCls = 'block text-[13px] text-mu font-medium mb-1.5 px-1'

  return (
    <>
      <Topbar title={SECTION_TITLE[section]} profile={profile} backHref="/settings" />

      <div className="p-4 lg:p-6 flex flex-col gap-5 max-w-2xl w-full mx-auto">
        {profileErr && <Alert tone="error">{profileErr}</Alert>}

        {show('profile') && (
          <Card>
            <div className="flex items-center gap-4 mb-6">
              <div className="relative">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-20 h-20 rounded-[22px] object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-[22px] bg-gradient-to-br from-ac to-bl grid place-items-center font-bold text-2xl text-onac">
                    {initials}
                  </div>
                )}
                <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}
                  className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-ac text-onac grid place-items-center ring-4 ring-p hover:scale-105 transition-transform disabled:opacity-50"
                  aria-label="Cambiar foto">
                  <Upload size={14} weight="bold" />
                </button>
                <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-xl font-bold truncate tracking-tight">{profile.full_name}</div>
                <div className="text-mu text-sm">{roleLabel(profile.role)} · {profile.email}</div>
                {uploadingAvatar && <div className="text-ac text-xs mt-1">Subiendo imagen…</div>}
              </div>
            </div>
            <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
              <div>
                <label className={labelCls}>Nombre completo</label>
                <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} placeholder="Tu nombre" />
              </div>
              <div>
                <label className={labelCls}>Ciudad</label>
                <input value={city} onChange={e => setCity(e.target.value)} className={inputCls} placeholder="Santiago, Lima, CDMX…" />
              </div>
              <div>
                <label className={labelCls}>Bio <span className="text-fa">(opcional)</span></label>
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={280}
                  className="w-full px-4 py-3 rounded-2xl bg-p2 text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 resize-none"
                  placeholder="Cuéntanos un poco de ti, tu historial en CrossFit…" />
                <div className="text-right text-[11px] text-fa mt-1">{bio.length}/280</div>
              </div>
              <div>
                <label className={labelCls}>Ejercicio favorito</label>
                <select value={favMov} onChange={e => setFavMov(e.target.value)} className={inputCls}>
                  <option value="">Selecciona uno</option>
                  {movements.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              {saveBtn}
            </form>
          </Card>
        )}

        {show('training') && (
          <form onSubmit={handleSaveProfile} className="flex flex-col gap-5">
            <Card>
              <h2 className="font-semibold mb-1">Unidad de peso</h2>
              <p className="text-mu text-sm mb-3">Récords, calculadora y cargas de competencias se muestran en esta unidad.</p>
              <Segmented id="set-unit" value={unit} onChange={setUnit} options={[['kg', 'Kilos (kg)'], ['lb', 'Libras (lb)']] as const} />
            </Card>
            <Card>
              <h2 className="font-semibold mb-1">Categoría</h2>
              <p className="text-mu text-sm mb-3">Define qué carga (masculina o femenina) usamos al medir tu preparación para una competencia.</p>
              <Segmented id="set-sex" value={sex || 'none'} onChange={v => setSex(v === 'none' ? '' : v as 'm' | 'f')}
                options={[['m', 'Masculino'], ['f', 'Femenino'], ['none', 'Sin definir']] as const} />
            </Card>
            {saveBtn}
          </form>
        )}

        {show('privacy') && (
          <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
            <Card padding={false} className="divide-y divide-[var(--ln)]">
              <ToggleRow icon={profilePublic ? <Globe size={20} /> : <Lock size={20} />} title="Perfil público"
                body="Otros atletas y coaches pueden ver tu perfil, bio y ejercicio favorito."
                checked={profilePublic} onChange={setProfilePublic} />
              <ToggleRow icon={<Trophy size={20} />} title="Mostrar mis RMs" body="Requiere perfil público. Verán tus máximos levantados."
                checked={showPrsPublic} disabled={!profilePublic} onChange={setShowPrsPublic} />
            </Card>
            {profilePublic && (
              <div className="p-4 rounded-2xl bg-ac/10 text-sm">
                <div className="font-semibold text-ac mb-1">Tu enlace público</div>
                <div className="font-mono text-[12px] break-all">{publicProfileUrl}</div>
              </div>
            )}
            {saveBtn}
          </form>
        )}

        {show('box') && ownedBox && (
          <Card>
            <div className="flex items-center gap-4 mb-5">
              <div className="relative">
                {boxLogoUrl ? (
                  <img src={boxLogoUrl} alt="" className="w-20 h-20 rounded-[22px] object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-[22px] bg-p2 grid place-items-center"><Building2 size={32} className="text-fa" /></div>
                )}
                <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}
                  className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-ac text-onac grid place-items-center ring-4 ring-p hover:scale-105 transition-transform disabled:opacity-50"
                  aria-label="Cambiar logo">
                  <Upload size={14} weight="bold" />
                </button>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-xl font-bold truncate tracking-tight">{ownedBox.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-mu">Código</span>
                  <span className="font-display text-sm font-extrabold tracking-widest text-ac">{ownedBox.invite_code}</span>
                  <button type="button" onClick={() => copyCode(ownedBox.invite_code)} className="text-fa hover:text-ac transition-colors" aria-label="Copiar código">
                    {codeCopied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                {uploadingLogo && <div className="text-ac text-xs mt-1">Subiendo logo…</div>}
              </div>
            </div>
            {boxSaved && <div className="mb-4"><Alert tone="success">Box actualizado</Alert></div>}
            {boxErr && <div className="mb-4"><Alert tone="error">{boxErr}</Alert></div>}
            <form onSubmit={handleSaveBox} className="flex flex-col gap-4">
              <div>
                <label className={labelCls}>Nombre del box</label>
                <input value={boxName} onChange={e => setBoxName(e.target.value)} required className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Ciudad</label><input value={boxCity} onChange={e => setBoxCity(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>País</label><input value={boxCountry} onChange={e => setBoxCountry(e.target.value)} className={inputCls} /></div>
              </div>
              <div>
                <label className={labelCls}>Descripción <span className="text-fa">(opcional)</span></label>
                <textarea value={boxDesc} onChange={e => setBoxDesc(e.target.value)} rows={3} maxLength={320}
                  className="w-full px-4 py-3 rounded-2xl bg-p2 text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 resize-none"
                  placeholder="Tu filosofía, tu comunidad…" />
              </div>
              <div>
                <label className={labelCls}>Disciplinas</label>
                <div className="flex flex-wrap gap-2">
                  {DISCIPLINES.map(d => (
                    <button key={d} type="button" onClick={() => toggleDiscipline(d)}
                      className={`h-9 px-3.5 rounded-full text-xs font-semibold transition-colors ${boxDisciplines.includes(d) ? 'bg-ac text-onac' : 'bg-p2 text-mu hover:text-t'}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Horario de clases</label>
                <textarea value={boxSchedule} onChange={e => setBoxSchedule(e.target.value)} rows={2}
                  className="w-full px-4 py-3 rounded-2xl bg-p2 text-t text-base sm:text-sm outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 resize-none"
                  placeholder="Lun-Vie: 7:00, 9:00, 18:00, 20:00 · Sáb: 10:00" />
              </div>
              <div><label className={labelCls}>Sitio web</label><input value={boxWebsite} onChange={e => setBoxWebsite(e.target.value)} className={inputCls} placeholder="https://mibox.com" type="url" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Instagram</label><input value={boxInstagram} onChange={e => setBoxInstagram(e.target.value.replace('@', ''))} className={inputCls} placeholder="mibox_cf" /></div>
                <div><label className={labelCls}>WhatsApp</label><input value={boxWhatsapp} onChange={e => setBoxWhatsapp(e.target.value)} className={inputCls} placeholder="+56 9 1234 5678" type="tel" /></div>
              </div>
              <Button type="submit" disabled={boxSaving} className="self-start px-6">{boxSaving ? 'Guardando…' : 'Guardar box'}</Button>
            </form>
          </Card>
        )}

        {show('boxes') && (
          <>
            <Card padding={false} className="divide-y divide-[var(--ln)]">
              {boxes.length === 0 && <p className="text-mu text-sm p-5">No perteneces a ningún box todavía.</p>}
              {boxes.map((box: any) => (
                <div key={box.id} className="flex items-center gap-3 p-4">
                  {box.logo_url
                    ? <img src={box.logo_url} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                    : <div className="w-11 h-11 rounded-xl bg-p2 grid place-items-center flex-shrink-0"><Building2 size={20} className="text-fa" /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[15px] truncate">{box.name}</div>
                    <div className="text-mu text-xs truncate">{box.city}{box.city && box.country ? ', ' : ''}{box.country}</div>
                  </div>
                  {box.invite_code && <div className="font-display text-sm font-extrabold tracking-widest text-ac">{box.invite_code}</div>}
                </div>
              ))}
            </Card>
            <Card>
              <h2 className="font-semibold mb-1">Unirse a otro box</h2>
              <p className="text-mu text-sm mb-4">Puedes estar en varios boxes. Pídele el código a tu coach.</p>
              {joinMsg && <div className="mb-4"><Alert tone="success">{joinMsg}</Alert></div>}
              {joinErr && <div className="mb-4"><Alert tone="error">{joinErr}</Alert></div>}
              <form onSubmit={handleJoinBox} className="flex gap-3">
                <input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} maxLength={8} placeholder="XXXXXXXX" aria-label="Código de invitación"
                  className="flex-1 min-w-0 px-4 h-12 rounded-2xl bg-p2 text-t outline-none ring-1 ring-inset ring-transparent focus:ring-ac/60 uppercase tracking-widest font-display font-bold text-lg" />
                <Button type="submit" size="lg" disabled={joining || !inviteCode.trim()}>{joining ? 'Uniendo…' : 'Unirme'}</Button>
              </form>
            </Card>
          </>
        )}

        {show('athletic') && (
          <Card>
            <h2 className="font-semibold mb-1">Perfil atlético</h2>
            <p className="text-mu text-sm mb-4">Tu fuerza relativa en cada categoría según tus RMs registrados.</p>
            {prs.length > 0 ? <AthleteRadar prs={prs} /> : <p className="text-mu text-sm">Registra algunos RMs para ver tu perfil.</p>}
          </Card>
        )}

        {show('appearance') && (
          <Card>
            <p className="text-mu text-sm mb-4">Modo claro u oscuro y el color de acento. Se guarda en este dispositivo.</p>
            <AppearancePicker />
          </Card>
        )}

        {show('notifications') && <NotificationSettings />}

        {show('security') && (
          <Card>
            <h2 className="font-semibold mb-1">Contraseña</h2>
            <p className="text-mu text-sm mb-4">{profile.email}</p>
            <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
              <PasswordField label="Nueva contraseña" name="new-password" autoComplete="new-password" minLength={8}
                value={newPassword} onChange={e => setNewPassword(e.target.value)} hint="Mínimo 8 caracteres." />
              {pwErr && <Alert tone="error">{pwErr}</Alert>}
              {pwMsg && <Alert tone="success">{pwMsg}</Alert>}
              <Button type="submit" variant="secondary" disabled={pwSaving || !newPassword} className="self-start">
                {pwSaving ? 'Guardando…' : 'Cambiar contraseña'}
              </Button>
            </form>
            <div className="mt-6 pt-5 border-t border-[var(--ln)]">
              <Button variant="danger" disabled={signingOut} onClick={handleSignOut}>
                <LogOut size={16} />
                {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}

function ToggleRow({ icon, title, body, checked, onChange, disabled }: {
  icon: React.ReactNode; title: string; body: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <label className={`flex items-center gap-3.5 p-4 cursor-pointer ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <span className="size-10 rounded-xl bg-p2 grid place-items-center text-t flex-shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-[15px]">{title}</span>
        <span className="block text-mu text-[13px]">{body}</span>
      </span>
      <Switch checked={checked} onChange={onChange} label={title} />
    </label>
  )
}
