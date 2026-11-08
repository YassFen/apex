import { Trophy } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils/cn'

// Expects results already ordered with rankResults().
export function WodLeaderboard({ results, currentUserId }: { results: any[]; currentUserId: string }) {
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
        <h3 className="font-barlow text-lg font-extrabold tracking-wide uppercase">Leaderboard</h3>
        <span className="text-mu text-xs tabular-nums">
          {results.length} {results.length === 1 ? 'atleta' : 'atletas'}
          {myIndex >= 0 && <> · vas <span className="text-t font-semibold">#{myIndex + 1}</span></>}
        </span>
      </div>
      <ol className="px-2 pb-2">
        {results.map((r, i) => {
          const isMe = r.user_id === currentUserId
          const name = r.profiles?.full_name ?? 'Atleta'
          const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
          return (
            <li key={r.id ?? r.user_id}
              className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl', isMe && 'bg-ac/10')}
              aria-current={isMe ? 'true' : undefined}
            >
              <span className={cn(
                'w-7 text-center font-barlow text-2xl font-black tabular-nums',
                i === 0 ? 'text-ac' : i < 3 ? 'text-t' : 'text-fa',
              )}>
                {i + 1}
              </span>
              {r.profiles?.avatar_url ? (
                <img src={r.profiles.avatar_url} alt="" width={32} height={32}
                  className="size-8 rounded-full object-cover flex-shrink-0 outline outline-1 -outline-offset-1 outline-white/10" />
              ) : (
                <span className="size-8 rounded-full bg-p3 grid place-items-center font-bold text-xs text-mu flex-shrink-0">
                  {initials}
                </span>
              )}
              <span className={cn('flex-1 min-w-0 truncate text-sm font-semibold', isMe ? 'text-ac' : 'text-t')}>
                {name}{isMe && <span className="text-mu font-normal"> (tú)</span>}
              </span>
              <span className="font-barlow text-xl font-bold tabular-nums">{r.result_value}</span>
              <Badge color={r.rx_level === 'rx+' ? 'orange' : r.rx_level === 'scaled' ? 'blue' : 'lime'} className="w-[58px] justify-center">
                {r.rx_level.toUpperCase()}
              </Badge>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
