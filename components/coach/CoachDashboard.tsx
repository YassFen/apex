'use client'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { useShell } from '@/lib/hooks/useShell'
import {
  Users, Flame, Activity, BarChart3, Calculator, Timer,
  ArrowLeftRight, Dumbbell, Plus, ChevronRight, Radio, Trophy
} from 'lucide-react'
import type { Profile, Box } from '@/lib/types/database'

interface Props {
  profile: Profile
  box: Box | null
  athleteCount: number
  todayWodTitle: string | null
}

const QUICK_ACTIONS = [
  { href: '/coach/publish-wod', icon: Flame,       label: 'WOD',            sub: 'Publicar o editar', color: 'text-or bg-or/10 border-or/20' },
  { href: '/coach/wod-live',   icon: Radio,        label: 'En Vivo',        sub: 'Seguimiento WOD',   color: 'text-rd bg-rd/10 border-rd/20' },
  { href: '/coach/athletes',   icon: Users,        label: 'Atletas',        sub: 'Ver tu box',        color: 'text-bl bg-bl/10 border-bl/20' },
  { href: '/analytics',        icon: BarChart3,    label: 'Analytics',      sub: 'Progreso del box',  color: 'text-pu bg-pu/10 border-pu/20' },
  { href: '/calc',             icon: Calculator,   label: 'Calculadora RM', sub: 'Epley + discos',    color: 'text-gr bg-gr/10 border-gr/20' },
  { href: '/timer',            icon: Timer,        label: 'Timer',          sub: 'ForTime/AMRAP/EMOM', color: 'text-ac bg-ac/10 border-ac/20' },
]

export function CoachDashboard({ profile, box, athleteCount, todayWodTitle }: Props) {
  const { setViewMode } = useShell()
  const initials = profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <Topbar title="Dashboard" profile={profile}
        actions={
          <Link href="/coach/publish-wod"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-ac text-bg text-sm font-bold hover:bg-[#b8e030] transition active:scale-95">
            <Plus size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">Nuevo WOD</span>
          </Link>
        }
      />

      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-4xl">

        {/* ── MODO ATLETA BANNER ── */}
        <button
          onClick={() => setViewMode('athlete')}
          className="w-full flex items-center gap-4 p-4 rounded-2xl bg-bl/8 border border-bl/20 hover:bg-bl/12 hover:border-bl/35 transition group text-left"
        >
          <div className="w-11 h-11 rounded-xl bg-bl/15 grid place-items-center text-bl flex-shrink-0 group-hover:bg-bl/25 transition">
            <ArrowLeftRight size={20} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-barlow text-lg font-black tracking-wide text-bl uppercase">Cambiar a modo Atleta</div>
            <div className="text-mu text-[12px] mt-0.5">Llevá tu propio registro de RMs y entrenamiento</div>
          </div>
          <ChevronRight size={18} className="text-bl/60 flex-shrink-0 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* ── BOX INFO ── */}
        {!box ? (
          <div className="rounded-2xl bg-p border border-[var(--ln)] p-8 text-center">
            <Dumbbell size={40} className="text-ac mx-auto mb-3" strokeWidth={1.5} />
            <div className="font-barlow text-2xl font-black mb-2">CREA TU BOX</div>
            <p className="text-mu text-sm mb-5">Configura tu box para publicar WODs y gestionar atletas.</p>
            <Link href="/coach/create-box"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-ac text-bg font-barlow font-extrabold tracking-wide text-base hover:bg-[#b8e030] transition">
              <Plus size={16} strokeWidth={2.5} /> Crear mi Box
            </Link>
          </div>
        ) : (
          <>
            {/* Box card */}
            <div className="rounded-2xl bg-p border border-[var(--ln)] p-5 flex items-center gap-4">
              {(box as any).logo_url ? (
                <img src={(box as any).logo_url} alt="" className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-ac/10 border border-ac/20 grid place-items-center flex-shrink-0">
                  <Dumbbell size={24} className="text-ac" strokeWidth={2} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-barlow text-xl font-black tracking-wide truncate">{box.name}</div>
                <div className="text-mu text-sm">{box.city}{box.country ? ` · ${box.country}` : ''}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] uppercase tracking-wide text-fa font-bold">Código:</span>
                  <span className="font-barlow font-black tracking-widest text-ac">{box.invite_code}</span>
                </div>
              </div>
              <Link href="/settings"
                className="flex-shrink-0 px-3 py-2 rounded-xl border border-[var(--ln)] text-mu text-xs font-bold hover:text-t hover:border-mu transition">
                Editar
              </Link>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-p border border-[var(--ln)] p-4">
                <div className="text-[10px] uppercase tracking-[1.6px] text-fa font-bold mb-1">Atletas</div>
                <div className="font-barlow text-3xl font-black leading-none text-t">{athleteCount}</div>
                <div className="text-fa text-[11px] mt-1">en el box</div>
              </div>
              <div className="rounded-2xl bg-p border border-[var(--ln)] p-4">
                <div className="text-[10px] uppercase tracking-[1.6px] text-fa font-bold mb-1">WOD Hoy</div>
                <div className="font-barlow text-3xl font-black leading-none">
                  {todayWodTitle ? (
                    <span className="text-ac">✓</span>
                  ) : (
                    <span className="text-fa">—</span>
                  )}
                </div>
                <div className="text-fa text-[11px] mt-1 truncate">{todayWodTitle ?? 'Sin publicar'}</div>
              </div>
              <div className="rounded-2xl bg-p border border-[var(--ln)] p-4">
                <div className="text-[10px] uppercase tracking-[1.6px] text-fa font-bold mb-1">Tu rol</div>
                <div className="font-barlow text-3xl font-black leading-none text-ac">
                  <Trophy size={24} className="text-ac" />
                </div>
                <div className="text-fa text-[11px] mt-1 capitalize">{profile.role}</div>
              </div>
            </div>

            {/* Quick actions grid */}
            <div>
              <div className="text-[10px] uppercase tracking-[1.8px] text-fa font-bold mb-3">Acciones rápidas</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {QUICK_ACTIONS.map(a => {
                  const Icon = a.icon
                  return (
                    <Link key={a.href} href={a.href}
                      className="rounded-2xl bg-p border border-[var(--ln)] p-4 hover:border-[rgba(255,255,255,.15)] transition group flex flex-col gap-2.5">
                      <div className={`w-10 h-10 rounded-xl grid place-items-center border ${a.color}`}>
                        <Icon size={18} strokeWidth={2} />
                      </div>
                      <div>
                        <div className="font-barlow font-extrabold text-[15px] tracking-wide">{a.label}</div>
                        <div className="text-fa text-[11px] mt-0.5">{a.sub}</div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* Today's WOD preview */}
            {todayWodTitle && (
              <div className="rounded-2xl bg-p border border-ac/20 p-4 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-rd animate-pulse flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-[1.6px] text-rd font-bold">WOD EN VIVO</div>
                  <div className="font-barlow font-extrabold text-base truncate mt-0.5">{todayWodTitle}</div>
                </div>
                <Link href="/coach/wod-live"
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rd/10 border border-rd/20 text-rd text-xs font-bold hover:bg-rd/15 transition">
                  <Activity size={12} /> Ver
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
