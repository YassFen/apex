'use client'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import type { Profile, Box } from '@/lib/types/database'

export function CoachDashboard({ profile, box }: { profile: Profile; box: Box | null }) {
  return (
    <>
      <Topbar title="Coach Dashboard" onMenuClick={() => {}} profile={profile} />

      <div className="p-4 lg:p-6 flex flex-col gap-4">
        {!box ? (
          <Card className="text-center py-12">
            <div className="text-[48px] mb-3">🏋️</div>
            <div className="font-barlow text-2xl font-black mb-2">CREA TU BOX</div>
            <p className="text-mu text-sm mb-5">Configura tu box para publicar WODs y gestionar atletas.</p>
            <Link href="/coach/create-box">
              <Button size="lg">Crear mi Box</Button>
            </Link>
          </Card>
        ) : (
          <>
            {/* Box info */}
            <Card className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-ac/10 border border-ac/20 grid place-items-center text-2xl flex-shrink-0">
                🏋️
              </div>
              <div className="flex-1">
                <div className="font-barlow text-xl font-black tracking-wide">{box.name}</div>
                <div className="text-mu text-sm">{box.city} · {box.country}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-mu font-bold mb-1">Código de invitación</div>
                <div className="font-barlow text-xl font-black tracking-widest text-ac">{box.invite_code}</div>
              </div>
            </Card>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3.5">
              <Link href="/coach/publish-wod">
                <Card className="h-full p-5 hover:border-ac/30 transition-colors cursor-pointer">
                  <div className="text-[28px] mb-2">📢</div>
                  <div className="font-barlow text-lg font-black tracking-wide">PUBLICAR WOD</div>
                  <div className="text-mu text-xs mt-1">Broadcast en tiempo real</div>
                </Card>
              </Link>
              <Link href="/coach/athletes">
                <Card className="h-full p-5 hover:border-bl/30 transition-colors cursor-pointer">
                  <div className="text-[28px] mb-2">👥</div>
                  <div className="font-barlow text-lg font-black tracking-wide">ATLETAS</div>
                  <div className="text-mu text-xs mt-1">Ver progreso y resultados</div>
                </Card>
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  )
}
