import { cn } from '@/lib/utils/cn'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: boolean
}

/**
 * Card primitive — flat dark surface, no border.
 * Separation from background comes from tone difference (#0E0E0E on #000).
 */
export function Card({ className, padding = true, children, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={cn(
        'bg-p rounded-[20px]',
        padding && 'p-5',
        className
      )}
    >
      {children}
    </div>
  )
}
