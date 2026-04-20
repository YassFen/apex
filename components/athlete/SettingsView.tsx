'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { Profile } from '@/lib/types/database'

interface Props {
  profile: Profile
  memberships: any[]
}

export function SettingsView({ profile, memberships }: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Profile form state
  const [name, setName]     = useState(profile.full_name)
  const [city, setCity]     = useState(profile.city ?? '')
  const [bio, setBio]       = useState(profile.bio ?? '')
  const [unit, setUnit]     = useState<'kg' | 'lb'>(profile.preferred_unit)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [profileErr, setProfileErr] = useState('')

  // Join box state
  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining]       = useState(false)
  const [joinMsg, setJoinMsg]       = useState('')
  const [joinErr, setJoinErr]       = useState('')

  // Sign out
  const [signingOut, setSigningOut] = useState(false)

  const boxes = memberships.map(m => m.boxes).filter(Boolean)

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setProfileErr(''); setSavedOk(false)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim(), city: city.trim(), bio: bio.trim(), preferred_unit: unit })
      .eq('id', profile.id)
    setSaving(false)
    if (error) { setProfileErr(error.message); return }
    setSavedOk(true)
    setTimeout(() => setSavedOk(false), 3000)
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

    // Check not already a member
    const { data: existing } = await supabase
      .from('box_members')
      .select('id').eq('box_id', box.id).eq('user_id', profile.id).single()

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

  return (
    <>
      <Topbar title="Mi Perfil" onMenuClick={() => {}} profile={profile} />

      <div className="p-4 lg:p-6 flex flex-col gap-5 max-w-2xl">

        {/* ── Profile form ── */}
        <Card>
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
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={2}
                className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac transition-colors resize-none"
                placeholder="Cuéntanos un poco de ti…" />
            </div>

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

            <Button type="submit" disabled={saving} className="self-start px-6">
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </form>
        </Card>

        {/* ── Current boxes ── */}
        <Card>
          <h2 className="font-barlow text-lg font-black tracking-wide mb-4">MI BOX</h2>

          {boxes.length === 0 ? (
            <p className="text-mu text-sm">No perteneces a ningún box todavía.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {boxes.map((box: any) => (
                <div key={box.id} className="flex items-center justify-between p-3.5 rounded-xl bg-p3 border border-[var(--ln)]">
                  <div>
                    <div className="font-semibold text-sm">{box.name}</div>
                    <div className="text-mu text-[11px] mt-0.5">{box.city}{box.city && box.country ? ', ' : ''}{box.country}</div>
                  </div>
                  {box.invite_code && (
                    <div className="text-right">
                      <div className="text-[10px] text-fa uppercase tracking-wide font-bold mb-0.5">Código</div>
                      <div className="font-barlow text-base font-black tracking-widest text-ac">{box.invite_code}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Join a box ── */}
        {profile.role === 'athlete' && (
          <Card>
            <h2 className="font-barlow text-lg font-black tracking-wide mb-1">UNIRSE A UN BOX</h2>
            <p className="text-mu text-sm mb-4">Pídele el código de invitación a tu coach e ingrésalo aquí.</p>

            {joinMsg && (
              <div className="mb-4 p-3 rounded-xl bg-ac/10 border border-ac/20 text-ac text-sm font-semibold">{joinMsg}</div>
            )}
            {joinErr && (
              <div className="mb-4 p-3 rounded-xl bg-rd/10 border border-rd/20 text-rd text-sm font-semibold">{joinErr}</div>
            )}

            <form onSubmit={handleJoinBox} className="flex gap-3">
              <input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
                className="flex-1 px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac transition-colors uppercase tracking-widest font-barlow font-bold text-lg"
                placeholder="XXXXXXXX" maxLength={8} />
              <Button type="submit" disabled={joining || !inviteCode.trim()}>
                {joining ? 'Uniendo…' : 'Unirme'}
              </Button>
            </form>
          </Card>
        )}

        {/* ── Account ── */}
        <Card>
          <h2 className="font-barlow text-lg font-black tracking-wide mb-1">CUENTA</h2>
          <p className="text-mu text-sm mb-4">{profile.email}</p>
          <Button variant="secondary" disabled={signingOut} onClick={handleSignOut} className="text-rd border-rd/20 hover:bg-rd/10">
            {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </Button>
        </Card>

      </div>
    </>
  )
}
