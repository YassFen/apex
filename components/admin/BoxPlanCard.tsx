'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Segmented } from '@/components/ui/motion'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/utils/errors'
import type { BoxPlan } from '@/lib/types/database'

/** The only thing the panel changes in a box: its plan. Asked twice, and written to the audit log. */
export function BoxPlanCard({ boxId, boxName, plan, me }: { boxId: string; boxName: string; plan: BoxPlan; me: string }) {
  const router = useRouter()
  const { fire } = useToast()
  const [next, setNext] = useState<BoxPlan | null>(null)
  const [busy, setBusy] = useState(false)

  async function apply() {
    if (!next) return
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('boxes').update({ plan: next }).eq('id', boxId)
    setBusy(false)
    if (error) { fire(friendlyError(error.message), 'error'); return }
    fire('Plan actualizado', 'ok'); setNext(null); router.refresh()
  }

  return (
    <Card className="flex flex-col gap-3">
      <div><h2 className="font-display text-base font-bold tracking-tight">Plan del box</h2><p className="text-xs text-mu mt-0.5">El cambio queda registrado en Auditoría con tu nombre.</p></div>
      <Segmented id="box-plan" value={plan} onChange={v => { if (v !== plan) setNext(v) }} options={[['free', 'Free'], ['pro', 'Pro'], ['enterprise', 'Enterprise']] as const} />
      <ConfirmDialog open={!!next} onClose={() => setNext(null)} onConfirm={apply} busy={busy}
        title={`¿Cambiar ${boxName} a ${next}?`} body={`Hoy está en ${plan}. El cambio aplica de inmediato.`} confirmLabel="Cambiar plan" />
    </Card>
  )
}
