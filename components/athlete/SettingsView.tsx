'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Globe, Lock, User as UserIcon, Building2, LogOut, Copy, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { AthleteRadar } from '@/components/athlete/AthleteRadar'
import type { Profile, Movement, Box } from '@/lib/types/database'

interface Props {
  profile: Profile
  memberships: any[]
  movements: Movement[]
  ownedBox: Box | null
  prs?: any[]
}

export function SettingsView({ profile, memberships, movements, ownedBox, prs = [] }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef   = useRef<HTMLInputElement>(null)

  const [name, setName]   = useState(profile.full_name)
  const [city, setCity]   = useState(profile.city ?? '')
  const [bio, setBio]     = useState(profile.bio ?? '')
  const [unit, setUnit]   = useState<'kg' | 'lb'>(profile.preferred_unit)
  const [favMov, setFavMov] = useState(profile.favorite_movement ?? '')
  const [profilePublic, setProfilePublic]   = useState(profile.profile_public ?? false)
  const [showPrsPublic, setShowPrsPublic]   = useState(profile.show_prs_public ?? false)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [profileErr, setProfileErr] = useState('')

  const [boxName, setBoxName]     = useState(ownedBox?.name ?? '')
  const [boxCity, setBoxCity]     = useState(ownedBox?.city ?? '')
  const [boxCountry, setBoxCountry] = useState(ownedBox?.country ?? '')
  const [boxLogoUrl, setBoxLogoUrl] = useState(ownedBox?.logo_url ?? '')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [boxSaving, setBoxSaving] = useState(false)
  const [boxSaved, setBoxSaved]   = useState(false)
  const [boxErr, setBoxErr]       = useState('')
  const [codeCopied, setCodeCopied] = useState(false)

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

    if (upErr) { setUploadingAvatar(false); setProfileErr(upErr.message); return }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const newUrl = pub.publicUrl
    const { error: updErr } = await supabase
      .from('profiles').update({ avatar_url: newUrl }).eq('id', profile.id)

    setUploadingAvatar(false)
    if (updErr) { setProfileErr(updErr.message); return }
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

    if (upErr) { setUploadingLogo(false); setBoxErr(upErr.message); return }

    const { data: pub } = supabase.storage.from('box-logos').getPublicUrl(path)
    const newUrl = pub.publicUrl
    const { error: updErr } = await supabase
      .from('boxes').update({ logo_url: newUrl }).eq('id', ownedBox.id)

    setUploadingLogo(false)
    if (updErr) { setBoxErr(updErr.message); return }
    setBoxLogoUrl(newUrl)
    router.refresh()
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setProfileErr(''); setSavedOk(false)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: name.trim(),
        city: city.trim() || null,
        bio: bio.trim() || null,
        preferred_unit: unit,
        favorite_movement: favMov.trim() || null,
        profile_public: profilePublic,
        show_prs_public: showPrsPublic,
      })
      .eq('id', profile.id)
    setSaving(false)
    if (error) { setProfileErr(error.message); return }
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
      .update({ name: boxName.trim(), city: boxCity.trim(), country: boxCountry.trim() })
      .eq('id', ownedBox.id)
    setBoxSaving(false)
    if (error) { setBoxErr(error.message); return }
    setBoxSaved(true)
    setTimeout(() => setBoxSaved(false), 3000)
    router.refresh()
  }

  async function handleJoinBox(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteCode.trim()) return
    setJoining(true); setJoinErr(''); setJoinMsg('')

    const code = inviteCode.trim().toUpperCase()
    const { data: box } = await supabase
      .from('boxes').select('id, name').eq('invite_code', code).single()

    if (!box) {
      setJoinErr('Código de invitación inválido. Revisa que esté escrito correctamente.')
      setJoining(false); return
    }

    const { data: existing } = await supabase
      .from('box_members').select('id').eq('box_id', box.id).eq('user_id', profile.id).maybeSingle()

    if (existing) {
      setJoinErr(`Ya eres miembro de ${box.name}.`)
      setJoining(false); return
    }

    const { error } = await supabase.from('box_members').insert({
      box_id: box.id, user_id: profile.id, role: 'athlete', is_active: true,
    })
    setJoining(false)
    if (error) { setJoinErr(error.message); return }
    setJoinMsg(`¡Te uniste a ${box.name}! 🎉`)
    setInviteCode('')
    setTimeout(() => router.refresh(), 1200)
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

  return (
    <>
      <Topbar title="Mi Perfil" profile={profile} />

      <div className="p-4 lg:p-6 flex flex-col gap-5 max-w-2xl">

        <Card>
          <div className="flex items-center gap-4 mb-5">
            <div className="relative">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-20 h-20 rounded-2xl object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-ac to-bl grid place-items-center font-black text-2xl text-bg">
                  {initials}
                </div>
              )}
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-ac text-bg grid place-items-center border-2 border-bg hover:scale-105 transition-transform disabled:opacity-50"
                aria-label="Cambiar foto"
              >
                <Upload size={13} strokeWidth={2.5} />
              </button>
              <input
                ref={avatarInputRef} type="file" accept="image/*"
                onChange={handleAvatarUpload} className="hidden"
              />
            </div>
            <div className="min-w-0">
              <div className="font-barlow text-xl font-black tracking-wide uppercase truncate">{profile.full_name}</div>
              <div className="text-mu text-sm capitalize">{profile.role}</div>
              {uploadingAvatar && <div className="text-ac text-xs mt-1">Subiendo imagen…</div>}
            </div>
          </div>

          <h2 className="font-barlow text-lg font-black tracking-wide mb-4">INFORMACIÓN PERSONAL</h2>

          {savedOk && (
            <div className="mb-4 p-3 rounded-xl bg-ac/10 border border-ac/20 text-ac text-sm font-semibold">
              ✅ Perfil actualizado correctamente
            </div>
          )}
          {profileErr && (
            <div className="mb-4 p-3 rounded-xl bg-rd/10 border border-rd/20 text-rd text-sm font-semibold">
              {profileErr}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
            <div>
              <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Nombre completo</label>
              <input value={name} onChange={e => setName(e.target.value)} required
                className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac transition-colors"
                placeholder="Tu nombre" />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Ciudad</label>
              <input value={city} onChange={e => setCity(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac transition-colors"
                placeholder="Santiago, Lima, CDMX…" />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Bio <span className="text-fa normal-case">(opcional)</span></label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={280}
                className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac transition-colors resize-none"
                placeholder="Cuéntanos un poco de ti, tu historial en CrossFit…" />
              <div className="text-right text-[10px] text-fa mt-1">{bio.length}/280</div>
            </div>

            {profile.role === 'athlete' && (
              <div>
                <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Ejercicio favorito</label>
                <select value={favMov} onChange={e => setFavMov(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac transition-colors">
                  <option value="">— Selecciona uno —</option>
                  {movements.map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-2">Unidad preferida</label>
              <div className="flex rounded-xl border border-[var(--ln)] overflow-hidden w-fit">
                {(['kg', 'lb'] as const).map(u => (
                  <button key={u} type="button" onClick={() => setUnit(u)}
                    className={`px-6 py-2.5 text-sm font-bold transition-colors ${unit === u ? 'bg-ac text-bg' : 'bg-p3 text-mu hover:text-t'}`}>
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {profile.role === 'athlete' && (
              <div className="pt-2 border-t border-[var(--ln)] flex flex-col gap-3">
                <div className="text-[10px] uppercase tracking-[1.8px] text-mu font-bold">Privacidad</div>

                <label className="flex items-start gap-3 p-3 rounded-xl bg-p3 border border-[var(--ln)] cursor-pointer hover:border-ac/30 transition-colors">
                  <input type="checkbox" checked={profilePublic}
                    onChange={e => setProfilePublic(e.target.checked)}
                    className="mt-0.5 accent-ac w-4 h-4" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      {profilePublic ? <Globe size={14} /> : <Lock size={14} />}
                      Perfil público
                    </div>
                    <div className="text-mu text-xs mt-0.5">
                      Otros atletas y coaches podrán ver tu perfil, bio y ejercicio favorito.
                    </div>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-xl bg-p3 border border-[var(--ln)] cursor-pointer hover:border-ac/30 transition-colors ${!profilePublic ? 'opacity-50' : ''}`}>
                  <input type="checkbox" checked={showPrsPublic} disabled={!profilePublic}
                    onChange={e => setShowPrsPublic(e.target.checked)}
                    className="mt-0.5 accent-ac w-4 h-4" />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">Mostrar mis RMs en el perfil público</div>
                    <div className="text-mu text-xs mt-0.5">
                      Requiere que tu perfil sea público. Podrán ver tus máximos levantados.
                    </div>
                  </div>
                </label>

                {profilePublic && (
                  <div className="p-3 rounded-xl bg-ac/8 border border-ac/20 text-xs text-ac">
                    <div className="font-bold mb-1">Tu enlace público:</div>
                    <div className="font-mono text-[11px] break-all text-t">{publicProfileUrl}</div>
                  </div>
                )}
              </div>
            )}

            <Button type="submit" disabled={saving} className="self-start px-6">
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </form>
        </Card>

        {profile.role === 'coach' && ownedBox && (
          <Card>
            <div className="flex items-center gap-4 mb-5">
              <div className="relative">
                {boxLogoUrl ? (
                  <img src={boxLogoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover border border-[var(--ln)]" />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-p3 border border-[var(--ln)] grid place-items-center">
                    <Building2 size={32} className="text-fa" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-ac text-bg grid place-items-center border-2 border-bg hover:scale-105 transition-transform disabled:opacity-50"
                  aria-label="Cambiar logo"
                >
                  <Upload size={13} strokeWidth={2.5} />
                </button>
                <input
                  ref={logoInputRef} type="file" accept="image/*"
                  onChange={handleLogoUpload} className="hidden"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-barlow text-xl font-black tracking-wide uppercase truncate">{ownedBox.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-fa uppercase tracking-wide font-bold">Código</span>
                  <span className="font-barlow text-sm font-black tracking-widest text-ac">{ownedBox.invite_code}</span>
                  <button type="button" onClick={() => copyCode(ownedBox.invite_code)}
                    className="text-fa hover:text-ac transition-colors" aria-label="Copiar código">
                    {codeCopied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
                {uploadingLogo && <div className="text-ac text-xs mt-1">Subiendo logo…</div>}
              </div>
            </div>

            <h2 className="font-barlow text-lg font-black tracking-wide mb-4">DETALLES DEL BOX</h2>

            {boxSaved && (
              <div className="mb-4 p-3 rounded-xl bg-ac/10 border border-ac/20 text-ac text-sm font-semibold">
                ✅ Box actualizado correctamente
              </div>
            )}
            {boxErr && (
              <div className="mb-4 p-3 rounded-xl bg-rd/10 border border-rd/20 text-rd text-sm font-semibold">
                {boxErr}
              </div>
            )}

            <form onSubmit={handleSaveBox} className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Nombre del box</label>
                <input value={boxName} onChange={e => setBoxName(e.target.value)} required
                  className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">Ciudad</label>
                  <input value={boxCity} onChange={e => setBoxCity(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">País</label>
                  <input value={boxCountry} onChange={e => setBoxCountry(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac" />
                </div>
              </div>
              <Button type="submit" disabled={boxSaving} className="self-start px-6">
                {boxSaving ? 'Guardando…' : 'Guardar box'}
              </Button>
            </form>
          </Card>
        )}

        {profile.role !== 'coach' && (
          <Card>
            <h2 className="font-barlow text-lg font-black tracking-wide mb-4">MI BOX</h2>

            {boxes.length === 0 ? (
              <p className="text-mu text-sm">No perteneces a ningún box todavía.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {boxes.map((box: any) => (
                  <div key={box.id} className="flex items-center justify-between p-3.5 rounded-xl bg-p3 border border-[var(--ln)]">
                    <div className="flex items-center gap-3 min-w-0">
                      {box.logo_url ? (
                        <img src={box.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-p2 border border-[var(--ln)] grid place-items-center flex-shrink-0">
                          <Building2 size={18} className="text-fa" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{box.name}</div>
                        <div className="text-mu text-[11px] mt-0.5 truncate">{box.city}{box.city && box.country ? ', ' : ''}{box.country}</div>
                      </div>
                    </div>
                    {box.invite_code && (
                      <div className="text-right flex-shrink-0">
                        <div className="text-[10px] text-fa uppercase tracking-wide font-bold mb-0.5">Código</div>
                        <div className="font-barlow text-base font-black tracking-widest text-ac">{box.invite_code}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {profile.role === 'athlete' && (
          <Card>
            <h2 className="font-barlow text-lg font-black tracking-wide mb-1">UNIRSE A UN BOX</h2>
            <p className="text-mu text-sm mb-4">Pídele el código de invitación a tu coach e ingrésalo aquí.</p>

            {joinMsg && <div className="mb-4 p-3 rounded-xl bg-ac/10 border border-ac/20 text-ac text-sm font-semibold">{joinMsg}</div>}
            {joinErr && <div className="mb-4 p-3 rounded-xl bg-rd/10 border border-rd/20 text-rd text-sm font-semibold">{joinErr}</div>}

            <form onSubmit={handleJoinBox} className="flex gap-3">
              <input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
                className="flex-1 px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac uppercase tracking-widest font-barlow font-bold text-lg"
                placeholder="XXXXXXXX" maxLength={8} />
              <Button type="submit" disabled={joining || !inviteCode.trim()}>
                {joining ? 'Uniendo…' : 'Unirme'}
              </Button>
            </form>
          </Card>
        )}

        {prs.length > 0 && (
          <Card>
            <h2 className="font-barlow text-lg font-black tracking-wide mb-1">PERFIL ATLÉTICO</h2>
            <p className="text-mu text-sm mb-4">Tu fuerza relativa en cada categoría según tus RMs registrados.</p>
            <AthleteRadar prs={prs} />
          </Card>
        )}

        <Card>
          <h2 className="font-barlow text-lg font-black tracking-wide mb-1">CUENTA</h2>
          <p className="text-mu text-sm mb-4">{profile.email}</p>
          <Button variant="secondary" disabled={signingOut} onClick={handleSignOut} className="text-rd border-rd/20 hover:bg-rd/10">
            <LogOut size={14} strokeWidth={2} />
            {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </Button>
        </Card>

      </div>
    </>
  )
}
