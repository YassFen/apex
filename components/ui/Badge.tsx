import { cn } from '@/lib/utils/cn'

interface BadgeProps {
  children: React.ReactNode
  color?: 'green' | 'lime' | 'blue' | 'orange' | 'red' | 'purple' | 'neutral'
  className?: string
}

/**
 * Badge — solid tinted pill. No border, slightly higher contrast bg than before.
 */
const colorMap = {
  green:   'bg-gr/15 text-gr',
  lime:    'bg-ac/15 text-ac',
  blue:    'bg-bl/15 text-bl',
  orange:  'bg-or/15 text-or',
  red:     'bg-rd/15 text-rd',
  purple:  'bg-pu/15 text-pu',
  neutral: 'bg-p3 text-mu',
}

export function Badge({ children, color = 'lime', className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide',
      colorMap[color],
      className
    )}>
      {children}
    </span>
  )
}
