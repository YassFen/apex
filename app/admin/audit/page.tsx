import { requirePlatformAdmin } from '@/lib/utils/platform'
import { PageTitle } from '@/components/admin/AdminChrome'
import { toDateInput, formatDateOnly } from '@/lib/utils/dates'

const ACTION: Record<string, string> = {
  box_plan: 'Cambió el plan de un box', error_resolved: 'Marcó un error como resuelto', error_ignored: 'Ignoró un error', error_open: 'Reabrió un error',
  ticket_answered: 'Respondió un mensaje de soporte', ticket_closed: 'Cerró un mensaje de soporte', ticket_open: 'Reabrió un mensaje de soporte',
}

export default async function AdminAudit() {
  const { supabase } = await requirePlatformAdmin()
  const { data } = await supabase.from('admin_audit_log').select('*, profiles:admin_id(full_name)').order('created_at', { ascending: false }).limit(200)
  const rows = (data ?? []) as any[]
  const nameOf = (r: any) => r.profiles?.full_name ?? 'Administrador'

  return (
    <>
      <PageTitle title="Auditoría" sub="Todo lo que se cambia desde este panel queda aquí: quién, qué y cuándo. No se puede editar ni borrar desde la app." />
      <ul className="flex flex-col gap-2">
        {rows.map(r => (
          <li key={r.id} className="p-4 rounded-2xl bg-p flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{ACTION[r.action] ?? r.action}</div>
              <div className="text-xs text-mu mt-0.5 break-words">
                {nameOf(r)}{r.target ? ` · ${r.target}` : ''}
                {r.detail?.from ? ` · ${r.detail.from} → ${r.detail.to}` : r.detail?.message ? ` · ${r.detail.message}` : ''}
              </div>
            </div>
            <span className="text-xs text-fa flex-shrink-0">{formatDateOnly(toDateInput(r.created_at), { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-mu p-4 rounded-2xl bg-p">Sin cambios registrados todavía.</li>}
      </ul>
    </>
  )
}
