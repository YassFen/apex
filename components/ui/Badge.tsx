import { cn } from '@/lib/utils/cn'

interface BadgeProps {
  children: React.ReactNode
  color?: 'green' | 'lime' | 'blue' | 'orange' | 'red' | 'purple'
  className?: string
}

const colorMap = {
  green:  'bg-gr/10 text-gr',
  lime:   'bg-ac/10 text-ac',
  blue:   'bg-bl/10 text-bl',
  orange: 'bg-or/10 text-or',
  red:    'bg-rd/10 text-rd',
  purple: 'bg-pu/10 text-pu',
}

export function Badge({ children, color = 'lime', className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold',
      colorMap[color],
      className
    )}>
      {children}
    </span>
  )
}
