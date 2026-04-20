'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

function slugify(name: string): string {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '-' + Math.random().toString(36).slice(2, 6)
}

const COUNTRIES = [
  'Chile', 'México', 'Argentina', 'Colombia', 'Perú', 'España',
  'Venezuela', 'Ecuador', 'Bolivia', 'Paraguay', 'Uruguay',
  'Costa Rica', 'Guatemala', 'Honduras', 'El Salvador', 'Otro',
]

export default function CreateBoxPage() {
  const router = useRouter()
  const [name, setName]       = useState('')
  const [city, setCity]       = useState('')
  const [country, setCountry] = useState('Chile')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true); setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: box, error: boxErr } = await supabase
      .from('boxes')
      .insert({
        name:     name.trim(),
        slug:     slugify(name.trim()),
        city:     city.trim(),
        country:  country,
        owner_id: user.id,
      })
      .select()
      .single()

    if (boxErr || !box) {
      setError(boxErr?.message ?? 'Error al crear el box')
      setLoading(false)
      return
    }

    // Add coach as member with coach role
    await supabase.from('box_members').insert({
      box_id:   box.id,
      user_id:  user.id,
      role:     'coach',
      is_active: true,
    })

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="text-[48px] mb-3">🏋️</div>
          <h1 className="font-barlow text-4xl font-black tracking-wide">CREA TU BOX</h1>
          <p className="text-mu text-sm mt-2">Configura tu box para gestionar atletas y publicar WODs</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rd/10 border border-rd/20 text-rd text-sm font-semibold">
            {error}
          </div>
        )}

        <Card>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
                Nombre del Box *
              </label>
              <input
                required value={name} onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac transition-colors"
                placeholder="CrossFit Santiago"
                maxLength={60}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
                  Ciudad
                </label>
                <input
                  value={city} onChange={e => setCity(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac transition-colors"
                  placeholder="Santiago"
                  maxLength={60}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[1.8px] text-mu font-bold mb-1.5">
                  País
                </label>
                <select
                  value={country} onChange={e => setCountry(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-p3 border border-[var(--ln)] text-t text-sm outline-none focus:border-ac"
                >
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-1 p-3.5 rounded-xl bg-ac/5 border border-ac/15">
              <p className="text-[11px] text-mu leading-relaxed">
                Al crear tu box recibirás un <span className="text-ac font-bold">código de invitación</span> único
                que puedes compartir con tus atletas para que se unan.
              </p>
            </div>

            <Button type="submit" size="lg" disabled={loading} className="mt-1 w-full">
              {loading ? 'Creando box...' : 'Crear Box'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
