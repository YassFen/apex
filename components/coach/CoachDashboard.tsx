'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { useShell } from '@/lib/hooks/useShell'
import { useToast } from '@/components/ui/Toast'
import { WOD_TYPE_META } from '@/components/wod/WodView'
import { todayISO, formatDateOnly } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'
import {
  Flame, BarChart3, Calculator, Timer, ArrowLeftRight, Dumbbell, Plus,
  ChevronRight, Radio, Copy, Check, Share2, Pencil,
} from 'lucide-react'
import type { Profile, Box } from '@/lib/types/database'

interface Props {
  profile: Profile
  box: Box | null
  athleteCount: number
  todayWod: { id: string; title: string; type: string } | null
  todayResults: number
  recentMembers: { id: string; name: string; avatar: string | null; joinedAt: string }[]
}

const TOOLS = [
  { href: '/analytics', icon: BarChart3,  label: 'Analytics' },
  { href: '/timer',     icon: Timer,      label: 'Timer' },
  { href: '/calc',      icon: Calculator, label: 'Calculadora' },
]

export function CoachDashboard({ profile, box, athleteCount, todayWod, todayResults, recentMembers }: Props) {
  const { setViewMode } = useShell()
  const { fire } = useToast()
  const [copied, setCopied] = useState(false)

  const firstName = profile.full_name.split(' ')[0]
  const dateLabel = formatDateOnly(todayISO(), { weekday: 'long', day: 'numeric', month: 'long' })
  const participation = athleteCount > 0 ? Math.min(100, Math.round((todayResults / athleteCount) * 100)) : 0
  const meta = todayWod ? WOD_TYPE_META[todayWod.type] : null

  async function copyCode() {
    if (!box) return
    try {
      await navigator.clipboard.writeText(box.invite_code)
      setCopied(true)
      fire('Código copiado', 'ok')
      setTimeout(() => setCopied(false), 1800)
    } catch {
      fire('No se pudo copiar. Mantén presionado el código para copiarlo.', 'error')
    }
  }

  async function shareCode() {
    if (!box) return
    const text = `Únete a ${box.name} en APEX: ${location.origin}/auth/register — código de invitación: ${box.invite_code}`
    if (navigator.share) {
      try { await navigator.share({ title: `APEX · ${box.name}`, text }) } catch { /* cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(text); fire('Invitación copiada. Pégala en WhatsApp.', 'ok') } catch {}
    }
  }

  return (
    <>
      <Topbar title="Inicio" profile={profile}
        actions={
          <Link href="/coach/publish-wod" aria-label="Nuevo WOD"
            className="inline-flex items-center gap-1.5 h-10 px-3 sm:px-4 rounded-full bg-ac text-onac text-sm font-bold hover:bg-ac/90 transition active:scale-95">
            <Plus size={16} strokeWidth={2.5} aria-hidden />
            <span className="hidden sm:inline">Nuevo WOD</span>
          </Link>
        }
      />

      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-3xl w-full stagger">
        <div className="px-1">
          <p className="text-mu text-sm first-letter:uppercase">{dateLabel}</p>
          <h2 className="font-barlow text-4xl font-black tracking-wide uppercase leading-tight">Hola, {firstName}</h2>
        </div>

        {!box ? (
          <Card className="p-8 text-center">
            <div className="size-16 rounded-2xl bg-ac/15 text-ac grid place-items-center mx-auto mb-4 animate-pop">
              <Dumbbell size={30} strokeWidth={2} aria-hidden />
            </div>
            <div className="font-barlow text-3xl font-black uppercase mb-2">Crea tu box</div>
            <p className="text-mu text-sm mb-6 max-w-xs mx-auto text-pretty">Configura tu box para publicar WODs, invitar atletas y ver el leaderboard en vivo.</p>
            <Link href="/coach/create-box"
              className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-ac text-onac font-bold hover:bg-ac/90 transition active:scale-95">
              <Plus size={18} strokeWidth={2.5} aria-hidden /> Crear mi box
            </Link>
          </Card>
        ) : (
          <>
            {/* Today's WOD: the one thing a coach needs every morning */}
            {todayWod ? (
              <Card padding={false} className="overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="relative flex size-2.5" aria-hidden>
                      <span className="absolute inset-0 rounded-full bg-rd animate-ping-slow" />
                      <span className="relative size-2.5 rounded-full bg-rd" />
                    </span>
                    <span className="text-[11px] uppercase tracking-[1.4px] text-rd font-bold">En vivo hoy</span>
                    {meta && <span className={cn('ml-auto px-2.5 py-1 rounded-full text-[11px] font-bold uppercase', meta.cls)}>{meta.label}</span>}
                  </div>
                  <h3 className="font-barlow text-3xl font-black leading-tight text-balance">{todayWod.title}</h3>
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between text-sm mb-1.5">
                      <span className="text-mu"><span className="text-t font-bold tabular-nums">{todayResults}</span> de {athleteCount} registraron</span>
                      <span className="font-barlow text-xl font-black tabular-nums">{participation}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-p3 overflow-hidden">
                      <div className="h-full rounded-full bg-ac transition-[width] duration-700 ease-out" style={{ width: `${participation}%` }} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-px bg-[var(--ln)] border-t border-[var(--ln)]">
                  <Link href="/coach/wod-live" className="bg-p flex items-center justify-center gap-2 h-12 text-sm font-bold hover:bg-p2 transition-colors">
                    <Radio size={16} aria-hidden /> Ver en vivo
                  </Link>
                  <Link href="/coach/publish-wod" className="bg-p flex items-center justify-center gap-2 h-12 text-sm font-bold text-mu hover:text-t hover:bg-p2 transition-colors">
                    <Pencil size={15} aria-hidden /> Editar
                  </Link>
                </div>
              </Card>
            ) : (
              <Link href="/coach/publish-wod" className="tap-card block rounded-[20px] bg-ac text-onac p-5 relative overflow-hidden">
                <Flame size={120} className="absolute -right-6 -bottom-8 opacity-15" aria-hidden />
                <div className="text-[11px] uppercase tracking-[1.4px] font-bold opacity-80">WOD de hoy</div>
                <div className="font-barlow text-3xl font-black uppercase leading-tight mt-1 max-w-[16ch]">Aún no lo publicas</div>
                <p className="text-sm opacity-80 mt-1 max-w-[30ch]">Tus atletas lo verán al instante, sin recargar.</p>
                <span className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-onac text-ac text-sm font-bold">
                  Publicar WOD <ChevronRight size={16} aria-hidden />
                </span>
              </Link>
            )}

            {/* Box + invite */}
            <Card>
              <div className="flex items-center gap-4">
                {box.logo_url ? (
                  <img src={box.logo_url} alt="" className="size-14 rounded-2xl object-cover flex-shrink-0" />
                ) : (
                  <div className="size-14 rounded-2xl bg-ac/15 text-ac grid place-items-center flex-shrink-0">
                    <Dumbbell size={24} strokeWidth={2} aria-hidden />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-barlow text-xl font-black tracking-wide truncate">{box.name}</div>
                  <div className="text-mu text-sm truncate">{[box.city, box.country].filter(Boolean).join(' · ')}</div>
                </div>
                <Link href="/settings" className="flex-shrink-0 h-9 px-3 rounded-full bg-p2 text-mu text-xs font-bold grid place-items-center hover:bg-p3 hover:text-t transition">
                  Editar
                </Link>
              </div>
              <div className="mt-4 flex items-center gap-2 p-2 pl-4 rounded-2xl bg-p2">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-[1.4px] text-mu font-bold">Código de invitación</div>
                  <div className="font-barlow text-2xl font-black tracking-[0.2em] text-ac select-all">{box.invite_code}</div>
                </div>
                <button type="button" onClick={copyCode} aria-label="Copiar código"
                  className="size-11 rounded-xl bg-p3 grid place-items-center text-t hover:bg-p transition active:scale-90">
                  {copied ? <Check size={18} className="text-gr animate-pop" aria-hidden /> : <Copy size={18} aria-hidden />}
                </button>
                <button type="button" onClick={shareCode} aria-label="Compartir invitación"
                  className="size-11 rounded-xl bg-ac text-onac grid place-items-center hover:bg-ac/90 transition active:scale-90">
                  <Share2 size={18} aria-hidden />
                </button>
              </div>
            </Card>

            {/* Athletes */}
            <Link href="/coach/athletes" className="tap-card block rounded-[20px] bg-p p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[1.4px] text-mu font-bold">Atletas</div>
                  <div className="font-barlow text-4xl font-black tabular-nums leading-none mt-1">{athleteCount}</div>
                </div>
                <div className="flex -space-x-2.5">
                  {recentMembers.slice(0, 4).map(m => m.avatar ? (
                    <img key={m.id} src={m.avatar} alt="" className="size-9 rounded-full object-cover ring-2 ring-p" />
                  ) : (
                    <span key={m.id} className="size-9 rounded-full bg-p3 ring-2 ring-p grid place-items-center text-[11px] font-bold text-mu">
                      {m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  ))}
                </div>
                <ChevronRight size={18} className="text-fa" aria-hidden />
              </div>
              {recentMembers[0] && (
                <p className="text-mu text-xs mt-3 truncate">
                  Último en unirse: <span className="text-t font-semibold">{recentMembers[0].name}</span>
                </p>
              )}
              {athleteCount <= 1 && (
                <p className="text-mu text-xs mt-3">Comparte el código de invitación para sumar a tus atletas.</p>
              )}
            </Link>

            {/* Tools */}
            <div className="grid grid-cols-3 gap-3">
              {TOOLS.map(t => {
                const Icon = t.icon
                return (
                  <Link key={t.href} href={t.href} className="tap-card rounded-[20px] bg-p p-4 flex flex-col items-center gap-2 text-center">
                    <span className="size-10 rounded-xl bg-p2 grid place-items-center text-t"><Icon size={18} aria-hidden /></span>
                    <span className="text-xs font-bold">{t.label}</span>
                  </Link>
                )
              })}
            </div>
          </>
        )}

        <button type="button" onClick={() => setViewMode('athlete')}
          className="tap-card w-full flex items-center gap-4 p-4 rounded-[20px] bg-p hover:bg-p2 text-left">
          <span className="size-11 rounded-xl bg-bl/15 text-bl grid place-items-center flex-shrink-0">
            <ArrowLeftRight size={20} aria-hidden />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-sm">Entrenar como atleta</span>
            <span className="block text-mu text-xs mt-0.5">Lleva tus propios RMs, WODs y timer</span>
          </span>
          <ChevronRight size={18} className="text-fa flex-shrink-0" aria-hidden />
        </button>
      </div>
    </>
  )
}
