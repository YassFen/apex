import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export function WodLeaderboard({ results, wod, currentUserId }: { results: any[]; wod: any; currentUserId: string }) {
  if (results.length === 0) {
    return (
      <Card className="text-center py-8">
        <div className="text-mu text-sm">El leaderboard aparecerá cuando los atletas registren sus resultados.</div>
      </Card>
    )
  }

  return (
    <Card padding={false}>
      <div className="p-5 border-b border-[var(--ln)]">
        <div className="font-barlow text-[17px] font-extrabold tracking-wide uppercase">
          Leaderboard — {results.length} atleta{results.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,.04)]">
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold">#</th>
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold">Atleta</th>
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold">Resultado</th>
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[1.6px] text-fa font-bold">Nivel</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const isMe = r.user_id === currentUserId
              const initials = (r.profiles?.full_name ?? 'AN').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
              return (
                <tr key={r.id} className={`border-b border-[rgba(255,255,255,.04)] hover:bg-white/[.02] transition-colors ${isMe ? 'bg-ac/[.04]' : ''}`}>
                  <td className="px-4 py-3">
                    <span className={`font-barlow text-[26px] font-black ${i === 0 ? 'text-ac' : i === 1 ? 'text-bl' : i === 2 ? 'text-or' : 'text-fa'}`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-ac to-bl grid place-items-center font-black text-xs text-bg flex-shrink-0`}>
                        {initials}
                      </div>
                      <span className={`font-semibold text-sm ${isMe ? 'text-ac' : 'text-t'}`}>
                        {r.profiles?.full_name ?? 'Atleta'}
                        {isMe && <span className="text-[10px] text-mu font-normal ml-1">(tú)</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-barlow text-xl font-bold">{r.result_value}</td>
                  <td className="px-4 py-3">
                    <Badge color={r.rx_level === 'rx+' ? 'orange' : r.rx_level === 'scaled' ? 'blue' : 'lime'}>
                      {r.rx_level.toUpperCase()}
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
