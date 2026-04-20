import { cn } from '@/lib/utils/cn'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: boolean
}

export function Card({ className, padding = true, children, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={cn(
        'bg-gradient-to-br from-p to-p2 border border-[var(--ln)] rounded-[18px]',
        padding && 'p-5',
        className
      )}
    >
      {children}
    </div>
  )
}
