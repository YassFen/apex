'use client'
import { useId, useState } from 'react'
import { Eye, EyeOff, AlertCircle, CheckCircle2, Dumbbell } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

// 16px on phones so iOS Safari doesn't zoom into the field on focus.
export const inputCls =
  'w-full h-12 px-4 rounded-xl bg-p2 text-t text-base sm:text-sm outline-none ' +
  'ring-1 ring-inset ring-transparent focus:ring-ac/60 placeholder:text-fa transition-[box-shadow,background-color] ' +
  'disabled:opacity-50'

export const labelCls = 'block text-[11px] uppercase tracking-[1.4px] text-mu font-bold mb-2'

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: React.ReactNode
  hint?: React.ReactNode
}

export function Field({ label, hint, className, id, ...props }: FieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <div>
      <label htmlFor={fieldId} className={labelCls}>{label}</label>
      <input id={fieldId} {...props} className={cn(inputCls, className)} />
      {hint && <p className="mt-1.5 text-xs text-mu">{hint}</p>}
    </div>
  )
}

export function PasswordField({ label, hint, className, id, ...props }: FieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label htmlFor={fieldId} className={labelCls}>{label}</label>
      <div className="relative">
        <input id={fieldId} {...props} type={visible ? 'text' : 'password'} className={cn(inputCls, 'pr-12', className)} />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          className="absolute right-1 top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-lg text-mu hover:text-t"
        >
          {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      {hint && <p className="mt-1.5 text-xs text-mu">{hint}</p>}
    </div>
  )
}

export function Alert({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const Icon = tone === 'error' ? AlertCircle : CheckCircle2
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex gap-2.5 p-3.5 rounded-xl text-sm leading-snug',
        tone === 'error' ? 'bg-rd/15 text-rd' : 'bg-gr/15 text-gr',
      )}
    >
      <Icon size={18} className="flex-shrink-0 mt-px" aria-hidden />
      <div className="text-pretty">{children}</div>
    </div>
  )
}

export function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="size-10 rounded-xl bg-ac grid place-items-center">
        <Dumbbell size={20} className="text-bg" strokeWidth={2.5} aria-hidden />
      </div>
      <div className="font-barlow text-3xl font-black tracking-[3px]">AP<span className="text-ac">E</span>X</div>
    </div>
  )
}
