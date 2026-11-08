import { createBrowserClient } from "@supabase/ssr"
import { createDemoBrowserClient, isDemoBrowser } from "@/lib/demo/client"

export function createClient() {
  // DEMO MODE: same API, backed by the demo store on the server (/demo/api).
  if (isDemoBrowser()) return createDemoBrowserClient() as ReturnType<typeof createBrowserClient>
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
