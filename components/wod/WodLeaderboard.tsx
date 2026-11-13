import { Flame, Trophy } from '@/components/ui/icons'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils/cn'

const PODIUM = ['bg-ac text-onac', 'bg-t/15 text-t', 'bg-or/20 text-or']

// Expects results already ordered with rankResults().
// `bumps` null hides reactions (table not migrated yet).
export function WodLeaderboard({ results, currentUserId, bumps = null, onBump }: {
  results: any[]
  currentUserId: string
  bumps?: { result_id: string; user_id: string }[] | null
  onBump?: (resultId: string) => void
}) {
  if (results.length === 0) {
    return (
      <Card className="text-center py-8 flex flex-col items-center gap-2">
        <Trophy size={22} className="text-fa" aria-hidden />
        <p className="text-mu text-sm max-w-xs text-pretty">
          Nadie ha registrado todavía. Sé el primero en el leaderboard de hoy.
        </p>
      </Card>
    )
  }

  const myIndex = results.findIndex(r => r.user_id === currentUserId)

  return (
    <Card padding={false}>
      <div className="px-5 pt-5 pb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-bold tracking-tight">Leaderboard</h3>
        <span className="text-mu text-xs tabular-nums">
          {results.length} {results.length === 1 ? 'atleta' : 'atletas'}
          {myIndex >= 0 && <> · vas <span className="text-t font-semibold">#{myIndex + 1}</span></>}
        </span>
      </div>
      <ol className="px-2 pb-2 stagger">
        {results.map((r, i) => {
          const isMe = r.user_id === currentUserId
          const name = r.profiles?.full_name ?? 'Atleta'
          const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
          const count = bumps?.filter(b => b.result_id === r.id).length ?? 0
          const bumped = !!bumps?.some(b => b.result_id === r.id && b.user_id === currentUserId)
          return (
            <li key={r.id ?? r.user_id}
              className={cn('flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl', isMe && 'bg-ac/10')}
              aria-current={isMe ? 'true' : undefined}
            >
              <span className={cn(
                'size-7 flex-shrink-0 rounded-full grid place-items-center font-display text-base font-bold tabular-nums tracking-tight',
                i < 3 ? PODIUM[i] : 'text-fa',
              )}>
                {i + 1}
              </span>
              {r.profiles?.avatar_url ? (
                <img src={r.profiles.avatar_url} alt="" width={32} height={32}
                  className="size-8 rounded-full object-cover flex-shrink-0 outline outline-1 -outline-offset-1 outline-t/10" />
              ) : (
                <span className="size-8 rounded-full bg-p3 grid place-items-center font-bold text-xs text-mu flex-shrink-0">
                  {initials}
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className={cn('block truncate text-sm font-semibold', isMe ? 'text-ac' : 'text-t')}>
                  {name}{isMe && <span className="text-mu font-normal"> (tú)</span>}
                </span>
                <span className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-display text-lg font-bold tabular-nums leading-none tracking-tight">{r.result_value}</span>
                  <Badge color={r.rx_level === 'rx+' ? 'orange' : r.rx_level === 'scaled' ? 'blue' : 'lime'} className="!px-1.5 !py-0 text-[10px]">
                    {r.rx_level.toUpperCase()}
                  </Badge>
                </span>
              </span>
              {bumps && onBump && (
                isMe ? (
                  count > 0 && (
                    <span className="flex items-center gap-1 text-or text-xs font-bold tabular-nums px-2" aria-label={`${count} te dieron fuego`}>
                      <Flame size={15} fill="currentColor" aria-hidden />{count}
                    </span>
                  )
                ) : (
                  <button type="button" onClick={() => onBump(r.id)} aria-pressed={bumped}
                    aria-label={bumped ? `Quitar fuego a ${name}` : `Dar fuego a ${name}`}
                    className={cn(
                      'h-9 min-w-[52px] px-2.5 rounded-full flex items-center justify-center gap-1 text-xs font-bold tabular-nums transition-[background-color,color,transform] active:scale-90',
                      bumped ? 'bg-or/20 text-or' : 'bg-p2 text-mu hover:text-t',
                    )}>
                    <Flame size={15} fill={bumped ? 'currentColor' : 'none'} aria-hidden className={bumped ? 'animate-pop' : ''} />
                    {count > 0 && count}
                  </button>
                )
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
